import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Channel, ChatMessage, Huddle, Member, Workspace } from "@relay/shared";
import type { createDb } from "./db/index.js";
import {
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

export type AppDb = Awaited<ReturnType<typeof createDb>>["db"];

export async function hydrateMessages(db: AppDb, rows: (typeof message.$inferSelect)[]): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const ids = rows.map((r) => r.id);

  const [users, reactions, replies, members] = await Promise.all([
    db.select().from(user).where(inArray(user.id, userIds)),
    db.select().from(reaction).where(inArray(reaction.messageId, ids)),
    db
      .select({
        parentId: message.parentId,
        count: sql<number>`count(*)::int`,
        latest: sql<Date>`max(${message.createdAt})`,
      })
      .from(message)
      .where(inArray(message.parentId, ids))
      .groupBy(message.parentId),
    db
      .select()
      .from(workspaceMember)
      .where(inArray(workspaceMember.userId, userIds)),
  ]);

  const replyUsers = await db
    .select({ parentId: message.parentId, userId: message.userId })
    .from(message)
    .where(inArray(message.parentId, ids));

  const userMap = new Map(users.map((u) => [u.id, u]));
  const memberMap = new Map(members.map((m) => [m.userId, m]));

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
    if (!r.parentId) continue;
    const arr = replyUserMap.get(r.parentId) ?? [];
    if (!arr.includes(r.userId)) arr.push(r.userId);
    replyUserMap.set(r.parentId, arr);
  }

  const messages = rows.map((row) => {
    const u = userMap.get(row.userId);
    const mem = memberMap.get(row.userId);
    const rc = replyCount.get(row.id);
    return {
      id: row.id,
      channelId: row.channelId,
      parentId: row.parentId,
      userId: row.userId,
      userName: mem?.displayName ?? u?.name ?? "Unknown",
      userImage: u?.image ?? null,
      userStatusEmoji: mem?.statusEmoji ?? null,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      edited: Boolean(row.updatedAt),
      replyCount: Number(rc?.count ?? 0),
      latestReplyAt: rc?.latest ? new Date(rc.latest).toISOString() : null,
      replyUserIds: replyUserMap.get(row.id) ?? [],
      reactions: reactionMap.get(row.id) ?? [],
      fileKey: row.fileKey,
      fileName: row.fileName,
      fileContentType: row.fileContentType,
      fileUrl: null as string | null,
    };
  });
  const imageMap = await resolveImageMap(messages.map((m) => m.userImage));
  for (const m of messages) {
    m.userImage = m.userImage ? (imageMap.get(m.userImage) ?? m.userImage) : null;
  }
  await attachFileUrls(messages);
  return messages;
}

async function attachFileUrls(messages: ChatMessage[]) {
  const keyed = messages.filter((m) => m.fileKey);
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
    .where(and(eq(huddle.channelId, channelId), eq(huddle.active, true)))
    .limit(1);
  if (!h) return null;

  const parts = await db
    .select()
    .from(huddleParticipant)
    .where(eq(huddleParticipant.huddleId, h.id));
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
    startedBy: h.startedBy,
    active: h.active,
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
    .where(eq(workspaceMember.workspaceId, workspaceId));

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
    presence: (m.presence as Member["presence"]) ?? "offline",
    role: m.role as Member["role"],
  }));
}

export async function loadChannelMessages(db: AppDb, channelId: string, parentId?: string | null) {
  const rows = await db
    .select()
    .from(message)
    .where(
      parentId
        ? and(eq(message.channelId, channelId), eq(message.parentId, parentId))
        : and(eq(message.channelId, channelId), isNull(message.parentId)),
    )
    .orderBy(message.createdAt)
    .limit(400);
  return hydrateMessages(db, rows);
}

export async function markRead(db: AppDb, channelId: string, userId: string) {
  await db
    .update(channelMember)
    .set({ lastReadAt: new Date(), unreadCount: 0, mentionCount: 0 })
    .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId)));
}

export async function loadWorkspaceChannels(db: AppDb, wsId: string, userId: string): Promise<Channel[]> {
  const members = await getMembers(db, wsId);
  const chans = await db.select().from(channel).where(eq(channel.workspaceId, wsId));
  const memberships = await db.select().from(channelMember).where(eq(channelMember.userId, userId));
  const memByChan = new Map(memberships.map((m) => [m.channelId, m]));
  const payload: Channel[] = [];
  for (const ch of chans) {
    const mem = memByChan.get(ch.id);
    if (!mem) continue;
    payload.push(await toChannel(db, ch, mem, members, userId));
  }
  return payload;
}

export async function toChannel(
  db: AppDb,
  ch: typeof channel.$inferSelect,
  mem: typeof channelMember.$inferSelect,
  members: Member[],
  userId: string,
): Promise<Channel> {
  const huddleState = await hydrateHuddle(db, ch.id);
  const memberRows = await db.select().from(channelMember).where(eq(channelMember.channelId, ch.id));
  let name = ch.name;
  let section: Channel["section"] = "channels";
  if (ch.isDm) {
    section = "direct";
    const other = memberRows.find((o) => o.userId !== userId);
    const ou = other ? members.find((m) => m.userId === other.userId) : null;
    name = ou?.displayName || ou?.name || ch.name;
  } else if (mem.isStarred) {
    section = "starred";
  }
  return {
    id: ch.id,
    workspaceId: ch.workspaceId,
    name,
    topic: ch.topic,
    description: ch.description,
    isPrivate: ch.isPrivate,
    isDm: ch.isDm,
    isMpim: ch.isMpim,
    dmName: ch.isDm ? name : null,
    unreadCount: mem.unreadCount,
    mentionCount: mem.mentionCount,
    isMuted: mem.isMuted,
    isStarred: mem.isStarred,
    section,
    huddle: huddleState,
    memberCount: memberRows.length,
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

async function resolveImageMap(values: Array<string | null | undefined>) {
  const unique = [...new Set(values.filter((v): v is string => Boolean(v)))];
  const pairs = await Promise.all(unique.map(async (v) => [v, await publicFileUrl(v)] as const));
  return new Map(pairs);
}

export { desc };
