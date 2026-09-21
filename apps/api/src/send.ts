import { and, eq, isNull } from "drizzle-orm";
import type { ChatMessage } from "@relay/shared";
import { HttpError, requireAttachment, requireChannelMember } from "./access.js";
import type { AppDb } from "./db/index.js";
import { attachment, message, user, workspaceMember } from "./db/schema.js";
import { bumpUnread, extractMentions, type Hub } from "./hub.js";
import { notifyUnreadPush } from "./push.js";
import { hydrateMessages, mentionMap } from "./queries.js";

export async function createChatMessage(
  db: AppDb,
  hub: Hub,
  opts: {
    channelId: string;
    userId: string;
    body: string;
    parentId?: string | null;
    clientId?: string | null;
    fileKey?: string | null;
    fileName?: string | null;
    fileContentType?: string | null;
  },
): Promise<{ ok: true; message: ChatMessage } | { ok: false; status: 400 | 403 | 404 | 409; error: string }> {
  try {
    const text = opts.body.trim();
    if (!text && !opts.fileKey) return { ok: false, status: 400, error: "Empty" };

    const access = await requireChannelMember(db, opts.channelId, opts.userId);
    if (opts.parentId) {
      const [parent] = await db.select().from(message).where(eq(message.id, opts.parentId)).limit(1);
      if (!parent || parent.channelId !== opts.channelId) return { ok: false, status: 400, error: "Invalid thread" };
      if (parent.parentId) return { ok: false, status: 400, error: "Replies must be on the root message" };
    }

    const [mem] = await db
      .select()
      .from(workspaceMember)
      .where(
        and(
          eq(workspaceMember.workspaceId, access.workspaceId),
          eq(workspaceMember.userId, opts.userId),
          isNull(workspaceMember.leftAt),
        ),
      )
      .limit(1);
    const [urow] = await db.select().from(user).where(eq(user.id, opts.userId)).limit(1);
    const file = opts.fileKey
      ? await requireAttachment(db, opts.fileKey, opts.userId, access.workspaceId)
      : null;

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(message).values({
        id,
        workspaceId: access.workspaceId,
        channelId: opts.channelId,
        parentId: opts.parentId ?? null,
        authorUserId: opts.userId,
        authorDisplayName: mem?.displayName ?? urow?.name ?? "Unknown",
        authorAvatarKey: urow?.image ?? null,
        body: text,
      });
      if (file) {
        await tx
          .update(attachment)
          .set({ messageId: id, fileName: opts.fileName ?? file.fileName, contentType: opts.fileContentType ?? file.contentType })
          .where(eq(attachment.id, file.id));
      }
    });

    const [row] = await db.select().from(message).where(eq(message.id, id)).limit(1);
    const [hydrated] = await hydrateMessages(db, [row]);
    if (!hydrated) return { ok: false, status: 400, error: "Could not send" };
    if (opts.clientId) hydrated.clientId = opts.clientId;

    hub.broadcastToChannel(opts.channelId, { type: "message.created", message: hydrated });
    const names = await mentionMap(db, access.workspaceId);
    const bumps = await bumpUnread(db, hub, opts.channelId, opts.userId, extractMentions(text, names), {
      threadReply: Boolean(opts.parentId),
    });
    await notifyUnreadPush(db, hub, bumps, hydrated);
    return { ok: true, message: hydrated };
  } catch (err) {
    if (err instanceof HttpError) return { ok: false, status: err.status, error: err.message };
    console.error(err);
    return { ok: false, status: 400, error: "Could not send" };
  }
}
