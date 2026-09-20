import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Channel, ChatMessage, Huddle, Member, Workspace, WorkspaceSummary } from "@relay/shared";
import type { AppDb } from "./db/index.js";
import {
  attachment,
  channel,
  channelMember,
  huddle,
  huddleParticipant,
  message,
  reaction,
  user,
  workspace,
  workspaceMember,
} from "./db/schema.js";
import { publicFileUrl } from "./storage.js";

export type { AppDb };

export function channelKindFlags(kind: (typeof channel.$inferSelect)["kind"]) {
  return {
    isPrivate: kind === "private",
    isDm: kind === "dm",
    isMpim: kind === "mpim",
  };
}

export async function hydrateMessages(db: AppDb, rows: (typeof message.$inferSelect)[]): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const workspaceIds = [...new Set(rows.map((r) => r.workspaceId))];
  const userIds = [...new Set(rows.map((r) => r.authorUserId).filter((id): id is string => Boolean(id)))];

  const [reactions, replies, members, files] = await Promise.all([
    db.select().from(reaction).where(inArray(reaction.messageId, ids)),
    db
      .select({
        parentId: message.parentId,
        count: sql<number>`count(*)::int`,
        latest: sql<Date>`max(${message.createdAt})`,
      })
      .from(message)
      .where(and(inArray(message.parentId, ids), isNull(message.deletedAt)))
      .groupBy(message.parentId),
    workspaceIds.length && userIds.length
      ? db
          .select()
          .from(workspaceMember)
          .where(and(inArray(workspaceMember.workspaceId, workspaceIds), inArray(workspaceMember.userId, userIds)))
      : Promise.resolve([]),
    db.select().from(attachment).where(and(inArray(attachment.messageId, ids), isNull(attachment.deletedAt))),
  ]);

  const replyUsers = await db
    .select({ parentId: message.parentId, userId: message.authorUserId })
    .from(message)
    .where(and(inArray(message.parentId, ids), isNull(message.deletedAt)));

  const memberMap = new Map(members.map((m) => [`${m.workspaceId}:${m.userId}`, m]));
  const fileMap = new Map<string, (typeof attachment.$inferSelect)[]>();
  for (const file of files) {
    if (!file.messageId) continue;
    const list = fileMap.get(file.messageId) ?? [];
    list.push(file);
    fileMap.set(file.messageId, list);
  }

  const reactionMap = new Map<string, { emoji: string; count: number; userIds: string[] }[]>();
  for (const r of reactions) {
    const list = reactionMap.get(r.messageId) ?? [];
    const existing = list.find((x) => x.emoji === r.emoji);
    if (existing) {
      existing.count += 1;
      existing.userIds.push(r.userId);
    } else {
      list.push({ emoji: r.emoji, count: 1, userIds: [r.userId] });
    }
    reactionMap.set(r.messageId, list);
  }

  const replyCount = new Map(replies.map((r) => [r.parentId, r]));
  const replyUserMap = new Map<string, string[]>();
  for (const r of replyUsers) {
    if (!r.parentId || !r.userId) continue;
    const arr = replyUserMap.get(r.parentId) ?? [];
    if (!arr.includes(r.userId)) arr.push(r.userId);
    replyUserMap.set(r.parentId, arr);
  }

  const payload = rows.map((row) => {
    const mem = row.authorUserId ? memberMap.get(`${row.workspaceId}:${row.authorUserId}`) : undefined;
    const rc = replyCount.get(row.id);
    const file = (fileMap.get(row.id) ?? [])[0];
    const deleted = Boolean(row.deletedAt);
    return {
      id: row.id,
      channelId: row.channelId,
      parentId: row.parentId,
      userId: row.authorUserId ?? "deleted",
      userName: mem?.displayName ?? row.authorDisplayName,
      userImage: row.authorAvatarKey,
      userStatusEmoji: mem?.statusEmoji ?? null,
      body: deleted ? "" : row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      edited: Boolean(row.updatedAt) && !deleted,
      deleted,
      replyCount: Number(rc?.count ?? 0),
      latestReplyAt: rc?.latest ? new Date(rc.latest).toISOString() : null,
      replyUserIds: replyUserMap.get(row.id) ?? [],
      reactions: reactionMap.get(row.id) ?? [],
      fileKey: file?.storageKey ?? null,
      fileName: file?.fileName ?? null,
      fileContentType: file?.contentType ?? null,
      fileUrl: null as string | null,
      attachmentId: file?.id ?? null,
    };
  });
  const imageMap = await resolveImageMap(payload.map((m) => m.userImage));
  for (const m of payload) {
    m.userImage = m.userImage ? (imageMap.get(m.userImage) ?? m.userImage) : null;
  }
  await attachFileUrls(payload);
  return payload;
}

async function attachFileUrls(messages: ChatMessage[]) {
  const keyed = messages.filter((m) => m.fileKey && !m.deleted);
  if (!keyed.length || !process.env.AWS_ACCESS_KEY_ID) return;
  const { storage } = await import("./storage.js");
  const files = storage();
  await Promise.all(
    keyed.map(async (m) => {
      try {
        m.fileUrl = await files.url(m.fileKey!, { expiresIn: 3600 });
      } catch {
        m.fileUrl = null;
      }
    }),
  );
}

export async function hydrateHuddle(db: AppDb, channelId: string): Promise<Huddle | null> {
  const [h] = await db
    .select()
    .from(huddle)
    .where(and(eq(huddle.channelId, channelId), isNull(huddle.endedAt)))
    .limit(1);
  if (!h) return null;

  const parts = await db.select().from(huddleParticipant).where(eq(huddleParticipant.huddleId, h.id));
  const users = parts.length
    ? await db
        .select()
        .from(user)
        .where(
          inArray(
            user.id,
            parts.map((p) => p.userId),
          ),
        )
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const imageMap = await resolveImageMap(users.map((u) => u.image));

  return {
    id: h.id,
    channelId: h.channelId,
    startedBy: h.startedBy ?? "",
    active: !h.endedAt,
    livekitRoom: h.livekitRoom,
    startedAt: h.startedAt.toISOString(),
    participants: parts.map((p) => {
      const u = userMap.get(p.userId);
      const raw = u?.image ?? null;
      return {
        userId: p.userId,
        name: u?.name ?? "Unknown",
        image: raw ? (imageMap.get(raw) ?? raw) : null,
        muted: p.muted,
        cameraOn: p.cameraOn,
      };
    }),
  };
}

export async function getMembers(db: AppDb, workspaceId: string): Promise<Member[]> {
  const rows = await db
    .select({
      user,
      membership: workspaceMember,
    })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(and(eq(workspaceMember.workspaceId, workspaceId), isNull(workspaceMember.leftAt)));

  const imageMap = await resolveImageMap(rows.map((r) => r.user.image));
  return rows.map(({ user: u, membership: m }) => ({
    id: `${m.workspaceId}:${u.id}`,
    userId: u.id,
    name: u.name,
    email: u.email,
    image: u.image ? (imageMap.get(u.image) ?? u.image) : null,
    displayName: m.displayName,
    title: m.title,
    statusText: m.statusText,
    statusEmoji: m.statusEmoji,
    presence: m.presence,
    role: m.role,
  }));
}

export async function loadChannelMessages(
  db: AppDb,
  channelId: string,
  opts: { parentId?: string | null; cursor?: string | null; limit?: number } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 80, 1), 200);
  const filters = [eq(message.channelId, channelId)];
  if (opts.parentId) filters.push(eq(message.parentId, opts.parentId));
  else filters.push(isNull(message.parentId));
  if (opts.cursor) {
    const [createdAt, id] = decodeCursor(opts.cursor);
    if (createdAt && id) {
      filters.push(or(lt(message.createdAt, createdAt), and(eq(message.createdAt, createdAt), lt(message.id, id)))!);
    }
  }
  const rows = await db
    .select()
    .from(message)
    .where(and(...filters))
    .orderBy(desc(message.createdAt), desc(message.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const oldest = page[page.length - 1];
  const messages = await hydrateMessages(db, [...page].reverse());
  return {
    messages,
    nextCursor: hasMore && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
    hasMore,
  };
}

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): [Date | null, string | null] {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const createdAt = iso ? new Date(iso) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) return [null, null];
    return [createdAt, id];
  } catch {
    return [null, null];
  }
}

export async function markRead(db: AppDb, channelId: string, userId: string) {
  await db
    .update(channelMember)
    .set({ lastReadAt: new Date(), unreadCount: 0, mentionCount: 0 })
    .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId), isNull(channelMember.leftAt)));
}

export async function loadWorkspaceChannels(db: AppDb, wsId: string, userId: string): Promise<Channel[]> {
  const members = await getMembers(db, wsId);
  const chans = await db
    .select()
    .from(channel)
    .where(and(eq(channel.workspaceId, wsId), isNull(channel.deletedAt)));
  const memberships = await db
    .select()
    .from(channelMember)
    .where(and(eq(channelMember.workspaceId, wsId), isNull(channelMember.leftAt)));
  const memByChan = new Map(
    memberships.filter((m) => m.userId === userId).map((m) => [m.channelId, m]),
  );
  const usersByChan = new Map<string, string[]>();
  for (const row of memberships) {
    const list = usersByChan.get(row.channelId) ?? [];
    list.push(row.userId);
    usersByChan.set(row.channelId, list);
  }
  const huddles = await Promise.all(chans.map((ch) => hydrateHuddle(db, ch.id)));
  const huddleByChan = new Map(chans.map((ch, i) => [ch.id, huddles[i] ?? null]));
  const payload: Channel[] = [];
  for (const ch of chans) {
    const mem = memByChan.get(ch.id);
    if (!mem) continue;
    const memberIds = usersByChan.get(ch.id) ?? [];
    payload.push(
      toChannel(ch, mem, members, userId, huddleByChan.get(ch.id) ?? null, memberIds.length, memberIds),
    );
  }
  return payload;
}

export function toChannel(
  ch: typeof channel.$inferSelect,
  mem: typeof channelMember.$inferSelect,
  members: Member[],
  userId: string,
  huddleState: Huddle | null,
  memberCount: number,
  memberUserIds: string[] = [],
): Channel {
  const flags = channelKindFlags(ch.kind);
  let name = ch.name;
  let section: Channel["section"] = "channels";
  if (flags.isDm || flags.isMpim) {
    section = "direct";
    const others = (memberUserIds.length ? memberUserIds : members.map((m) => m.userId)).filter(
      (id) => id !== userId,
    );
    const labels = others
      .map((id) => members.find((m) => m.userId === id))
      .filter((m): m is Member => Boolean(m))
      .map((m) => m.displayName || m.name);
    name = labels.join(", ") || ch.name;
  } else if (mem.isStarred) {
    section = "starred";
  }
  return {
    id: ch.id,
    workspaceId: ch.workspaceId,
    name,
    topic: ch.topic,
    description: ch.description,
    isPrivate: flags.isPrivate,
    isDm: flags.isDm,
    isMpim: flags.isMpim,
    dmName: flags.isDm ? name : null,
    unreadCount: mem.unreadCount,
    mentionCount: mem.mentionCount,
    isMuted: mem.isMuted,
    isStarred: mem.isStarred,
    section,
    huddle: huddleState,
    memberCount,
  };
}

export async function mentionMap(db: AppDb, workspaceId: string) {
  const members = await getMembers(db, workspaceId);
  const map = new Map<string, string>();
  for (const m of members) {
    map.set(m.displayName.toLowerCase(), m.userId);
    map.set(m.name.toLowerCase(), m.userId);
    const first = m.displayName.split(" ")[0]?.toLowerCase();
    if (first) map.set(first, m.userId);
  }
  return map;
}

export async function toPublicWorkspace(row: typeof workspace.$inferSelect): Promise<Workspace> {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconColor: row.iconColor,
    iconLetter: row.iconLetter,
    iconUrl: await publicFileUrl(row.iconKey),
    plan: row.plan,
  };
}

export async function listWorkspaceSummaries(db: AppDb, userId: string): Promise<WorkspaceSummary[]> {
  const rows = await db
    .select({ workspace, membership: workspaceMember })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(and(eq(workspaceMember.userId, userId), isNull(workspaceMember.leftAt), isNull(workspace.deletedAt)));
  return Promise.all(
    rows.map(async ({ workspace: ws, membership }) => ({
      ...(await toPublicWorkspace(ws)),
      role: membership.role,
    })),
  );
}

export async function searchMessages(db: AppDb, userId: string, workspaceId: string, q: string, limit = 20) {
  const memberships = await db
    .select()
    .from(channelMember)
    .where(
      and(eq(channelMember.workspaceId, workspaceId), eq(channelMember.userId, userId), isNull(channelMember.leftAt)),
    );
  const ids = memberships.map((m) => m.channelId);
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(message)
    .where(
      and(
        inArray(message.channelId, ids),
        eq(message.workspaceId, workspaceId),
        isNull(message.deletedAt),
        ilike(message.body, `%${q}%`),
      ),
    )
    .orderBy(desc(message.createdAt))
    .limit(limit);
  return hydrateMessages(db, rows);
}

export async function listFileMessages(db: AppDb, userId: string, workspaceId: string) {
  const memberships = await db
    .select()
    .from(channelMember)
    .where(
      and(eq(channelMember.workspaceId, workspaceId), eq(channelMember.userId, userId), isNull(channelMember.leftAt)),
    );
  const ids = memberships.map((m) => m.channelId);
  if (!ids.length) return [];
  const rows = await db
    .select({ message })
    .from(attachment)
    .innerJoin(message, eq(message.id, attachment.messageId))
    .where(
      and(
        inArray(message.channelId, ids),
        eq(attachment.workspaceId, workspaceId),
        isNotNull(attachment.messageId),
        isNull(attachment.deletedAt),
        isNull(message.deletedAt),
      ),
    )
    .orderBy(desc(attachment.createdAt))
    .limit(80);
  return hydrateMessages(
    db,
    rows.map((r) => r.message),
  );
}

async function resolveImageMap(values: Array<string | null | undefined>) {
  const unique = [...new Set(values.filter((v): v is string => Boolean(v)))];
  const pairs = await Promise.all(unique.map(async (v) => [v, await publicFileUrl(v)] as const));
  return new Map(pairs);
}

export { desc, isNull };
