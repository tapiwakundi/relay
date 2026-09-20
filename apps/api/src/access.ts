import { and, eq, isNull } from "drizzle-orm";
import type { AppDb } from "./db/index.js";
import {
  attachment,
  channel,
  channelMember,
  invite,
  message,
  userPreference,
  workspaceMember,
} from "./db/schema.js";

export class HttpError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export async function requireWorkspaceMember(db: AppDb, workspaceId: string, userId: string) {
  const [row] = await db
    .select()
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.workspaceId, workspaceId),
        eq(workspaceMember.userId, userId),
        isNull(workspaceMember.leftAt),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(403, "Forbidden");
  return row;
}

export async function requireWorkspaceAdmin(db: AppDb, workspaceId: string, userId: string) {
  const row = await requireWorkspaceMember(db, workspaceId, userId);
  if (row.role !== "owner" && row.role !== "admin") {
    throw new HttpError(403, "Only workspace admins can do that");
  }
  return row;
}

export async function requireChannelMember(db: AppDb, channelId: string, userId: string) {
  const [ch] = await db.select().from(channel).where(eq(channel.id, channelId)).limit(1);
  if (!ch || ch.deletedAt) throw new HttpError(404, "Not found");
  const [membership] = await db
    .select()
    .from(channelMember)
    .where(
      and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId), isNull(channelMember.leftAt)),
    )
    .limit(1);
  if (!membership) throw new HttpError(403, "Forbidden");
  await requireWorkspaceMember(db, ch.workspaceId, userId);
  return { channel: ch, membership, workspaceId: ch.workspaceId };
}

export async function requireMessageAccess(db: AppDb, messageId: string, userId: string) {
  const [row] = await db.select().from(message).where(eq(message.id, messageId)).limit(1);
  if (!row) throw new HttpError(404, "Not found");
  const access = await requireChannelMember(db, row.channelId, userId);
  return { message: row, ...access };
}

export async function requireAttachment(db: AppDb, fileKey: string, userId: string, workspaceId: string) {
  const [row] = await db.select().from(attachment).where(eq(attachment.storageKey, fileKey)).limit(1);
  if (!row || row.deletedAt) throw new HttpError(400, "Unknown file");
  if (row.workspaceId !== workspaceId) throw new HttpError(403, "Forbidden");
  if (row.uploadedBy !== userId) throw new HttpError(403, "Forbidden");
  return row;
}

export function assertInviteRecipient(inviteEmail: string, userEmail: string) {
  if (inviteEmail.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
    throw new HttpError(403, "This invite is for a different email");
  }
}

export async function listActiveMemberships(db: AppDb, userId: string) {
  return db
    .select()
    .from(workspaceMember)
    .where(and(eq(workspaceMember.userId, userId), isNull(workspaceMember.leftAt)));
}

export async function resolveActiveWorkspaceId(
  db: AppDb,
  userId: string,
  requested?: string | null,
): Promise<string | null> {
  if (requested) {
    await requireWorkspaceMember(db, requested, userId);
    return requested;
  }
  const [pref] = await db.select().from(userPreference).where(eq(userPreference.userId, userId)).limit(1);
  if (pref?.activeWorkspaceId) {
    const [mem] = await db
      .select()
      .from(workspaceMember)
      .where(
        and(
          eq(workspaceMember.workspaceId, pref.activeWorkspaceId),
          eq(workspaceMember.userId, userId),
          isNull(workspaceMember.leftAt),
        ),
      )
      .limit(1);
    if (mem) return pref.activeWorkspaceId;
  }
  const [first] = await db
    .select()
    .from(workspaceMember)
    .where(and(eq(workspaceMember.userId, userId), isNull(workspaceMember.leftAt)))
    .limit(1);
  return first?.workspaceId ?? null;
}

export async function setActiveWorkspace(db: AppDb, userId: string, workspaceId: string | null) {
  await db
    .insert(userPreference)
    .values({ userId, activeWorkspaceId: workspaceId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPreference.userId,
      set: { activeWorkspaceId: workspaceId, updatedAt: new Date() },
    });
}

export function workspaceHeader(headers: Headers) {
  return headers.get("x-relay-workspace-id")?.trim() || null;
}
