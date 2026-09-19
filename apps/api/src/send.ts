import { and, eq } from "drizzle-orm";
import type { ChatMessage } from "@relay/shared";
import { bumpUnread, extractMentions, type Hub } from "./hub.js";
import { channel, channelMember, message } from "./db/schema.js";
import { hydrateMessages, mentionMap, type AppDb } from "./queries.js";

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
): Promise<{ ok: true; message: ChatMessage } | { ok: false; status: 400 | 403; error: string }> {
  const text = opts.body.trim();
  if (!text && !opts.fileKey) return { ok: false, status: 400, error: "Empty" };

  const [allowed] = await db
    .select()
    .from(channelMember)
    .where(and(eq(channelMember.channelId, opts.channelId), eq(channelMember.userId, opts.userId)))
    .limit(1);
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };

  const row = {
    id: crypto.randomUUID(),
    channelId: opts.channelId,
    parentId: opts.parentId ?? null,
    userId: opts.userId,
    body: text,
    createdAt: new Date(),
    updatedAt: null,
    fileKey: opts.fileKey ?? null,
    fileName: opts.fileName ?? null,
    fileContentType: opts.fileContentType ?? null,
  };
  await db.insert(message).values(row);
  const [hydrated] = await hydrateMessages(db, [row]);
  if (!hydrated) return { ok: false, status: 400, error: "Could not send" };
  if (opts.clientId) hydrated.clientId = opts.clientId;

  hub.broadcastToChannel(opts.channelId, { type: "message.created", message: hydrated });
  hub.broadcastToUser(opts.userId, { type: "message.created", message: hydrated });

  const [ch] = await db.select().from(channel).where(eq(channel.id, opts.channelId));
  const names = ch ? await mentionMap(db, ch.workspaceId) : new Map<string, string>();
  await bumpUnread(db, hub, opts.channelId, opts.userId, extractMentions(text, names));
  return { ok: true, message: hydrated };
}
