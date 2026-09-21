import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ChatMessage, Huddle, WsServerEvent } from "@relay/shared";
import { WebSocket } from "ws";
import type { AppDb } from "./db/index.js";
import { channelMember } from "./db/schema.js";
import { markRead } from "./queries.js";

type Client = {
  ws: WebSocket;
  userId: string;
  workspaceId: string | null;
  watched: Set<string>;
  viewed: Set<string>;
};

export type UnreadBump = {
  userId: string;
  workspaceId: string;
  channelId: string;
  unreadCount: number;
  mentionCount: number;
};

export class Hub {
  private clients = new Set<Client>();

  add(ws: WebSocket, userId: string, workspaceId: string | null = null) {
    const client: Client = { ws, userId, workspaceId, watched: new Set(), viewed: new Set() };
    this.clients.add(client);
    ws.on("close", () => this.clients.delete(client));
    return client;
  }

  setWorkspace(client: Client, workspaceId: string | null) {
    client.workspaceId = workspaceId;
  }

  watch(client: Client, channelId: string) {
    client.watched.add(channelId);
  }

  unwatch(client: Client, channelId: string) {
    client.watched.delete(channelId);
    client.viewed.delete(channelId);
  }

  subscribe(client: Client, channelId: string) {
    client.watched.add(channelId);
    client.viewed.add(channelId);
  }

  unsubscribe(client: Client, channelId: string) {
    client.viewed.delete(channelId);
  }

  send(ws: WebSocket, event: WsServerEvent) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }

  listening(client: Client, channelId: string) {
    return client.watched.has(channelId) || client.viewed.has(channelId);
  }

  broadcastToChannel(channelId: string, event: WsServerEvent, except?: WebSocket) {
    for (const c of this.clients) {
      if (c.ws === except) continue;
      if (this.listening(c, channelId)) this.send(c.ws, event);
    }
  }

  broadcastToUser(userId: string, event: WsServerEvent) {
    for (const c of this.clients) {
      if (c.userId === userId) this.send(c.ws, event);
    }
  }

  broadcastToWorkspace(workspaceId: string, event: WsServerEvent, except?: WebSocket) {
    for (const c of this.clients) {
      if (c.ws === except) continue;
      if (c.workspaceId === workspaceId) this.send(c.ws, event);
    }
  }

  isOnline(userId: string) {
    for (const c of this.clients) if (c.userId === userId) return true;
    return false;
  }

  isViewing(userId: string, channelId: string) {
    for (const c of this.clients) {
      if (c.userId === userId && c.viewed.has(channelId)) return true;
    }
    return false;
  }

  isWatching(userId: string, channelId: string) {
    for (const c of this.clients) {
      if (c.userId === userId && this.listening(c, channelId)) return true;
    }
    return false;
  }

  /** @deprecated use isViewing — subscribe now means the user is looking at the channel */
  isSubscribed(userId: string, channelId: string) {
    return this.isViewing(userId, channelId);
  }
}

/** Who should receive a channel badge for a new message. Viewers and the author are excluded. Thread replies badge only when they mention someone. */
export function selectUnreadTargets(opts: {
  memberIds: string[];
  authorId: string;
  viewingIds: Iterable<string>;
  mentionedUserIds: string[];
  threadReply?: boolean;
}): { mention: string[]; other: string[] } {
  const viewing = new Set(opts.viewingIds);
  const mentionAll = opts.mentionedUserIds.includes("*");
  const mentionSet = new Set(opts.mentionedUserIds.filter((id) => id !== "*"));
  const mention: string[] = [];
  const other: string[] = [];
  for (const userId of opts.memberIds) {
    if (userId === opts.authorId || viewing.has(userId)) continue;
    const mentioned = mentionAll || mentionSet.has(userId);
    if (opts.threadReply && !mentioned) continue;
    if (mentioned) mention.push(userId);
    else other.push(userId);
  }
  return { mention, other };
}

export function broadcastUnread(hub: Hub, bump: UnreadBump) {
  hub.broadcastToUser(bump.userId, {
    type: "unread",
    channelId: bump.channelId,
    workspaceId: bump.workspaceId,
    unreadCount: bump.unreadCount,
    mentionCount: bump.mentionCount,
  });
}

export async function bumpUnread(
  db: AppDb,
  hub: Hub,
  channelId: string,
  authorId: string,
  mentionedUserIds: string[],
  opts?: { threadReply?: boolean },
): Promise<UnreadBump[]> {
  const members = await db
    .select()
    .from(channelMember)
    .where(and(eq(channelMember.channelId, channelId), isNull(channelMember.leftAt)));
  const viewingIds = members.filter((m) => hub.isViewing(m.userId, channelId)).map((m) => m.userId);
  const picked = selectUnreadTargets({
    memberIds: members.map((m) => m.userId),
    authorId,
    viewingIds,
    mentionedUserIds,
    threadReply: opts?.threadReply,
  });
  const mentionedTargets = picked.mention.filter((id) => !hub.isViewing(id, channelId));
  const otherTargets = picked.other.filter((id) => !hub.isViewing(id, channelId));
  const targets = [...mentionedTargets, ...otherTargets];
  if (!targets.length) return [];

  if (otherTargets.length) {
    await db
      .update(channelMember)
      .set({ unreadCount: sql`${channelMember.unreadCount} + 1` })
      .where(
        and(
          eq(channelMember.channelId, channelId),
          inArray(channelMember.userId, otherTargets),
          isNull(channelMember.leftAt),
        ),
      );
  }
  if (mentionedTargets.length) {
    await db
      .update(channelMember)
      .set({
        unreadCount: sql`${channelMember.unreadCount} + 1`,
        mentionCount: sql`${channelMember.mentionCount} + 1`,
      })
      .where(
        and(
          eq(channelMember.channelId, channelId),
          inArray(channelMember.userId, mentionedTargets),
          isNull(channelMember.leftAt),
        ),
      );
  }

  const fresh = await db
    .select()
    .from(channelMember)
    .where(and(eq(channelMember.channelId, channelId), inArray(channelMember.userId, targets)));
  const bumps: UnreadBump[] = [];
  for (const m of fresh) {
    if (hub.isViewing(m.userId, channelId)) {
      const cleared = await markRead(db, channelId, m.userId);
      if (cleared) {
        broadcastUnread(hub, {
          userId: m.userId,
          workspaceId: cleared.workspaceId,
          channelId,
          unreadCount: 0,
          mentionCount: 0,
        });
      }
      continue;
    }
    const bump: UnreadBump = {
      userId: m.userId,
      workspaceId: m.workspaceId,
      channelId,
      unreadCount: m.unreadCount,
      mentionCount: m.mentionCount,
    };
    bumps.push(bump);
    broadcastUnread(hub, bump);
  }
  return bumps;
}

export function extractMentions(body: string, userIdsByName: Map<string, string>) {
  const ids: string[] = [];
  const re = /@([A-Za-z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const id = userIdsByName.get(match[1].toLowerCase());
    if (id) ids.push(id);
  }
  if (/(^|\s)@(channel|here)\b/i.test(body)) ids.push("*");
  return ids;
}

export function createdEvent(message: ChatMessage): WsServerEvent {
  return { type: "message.created", message };
}

export function huddleEvent(channelId: string, huddleState: Huddle | null, workspaceId?: string): WsServerEvent {
  return { type: "huddle.updated", channelId, huddle: huddleState, workspaceId };
}
