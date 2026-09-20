import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ChatMessage, Huddle, WsServerEvent } from "@relay/shared";
import { WebSocket } from "ws";
import type { AppDb } from "./db/index.js";
import { channelMember } from "./db/schema.js";

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

export async function bumpUnread(
  db: AppDb,
  hub: Hub,
  channelId: string,
  authorId: string,
  mentionedUserIds: string[],
): Promise<UnreadBump[]> {
  const members = await db
    .select()
    .from(channelMember)
    .where(and(eq(channelMember.channelId, channelId), isNull(channelMember.leftAt)));
  const skip = new Set<string>([authorId]);
  for (const m of members) {
    if (hub.isViewing(m.userId, channelId)) skip.add(m.userId);
  }
  const mentionAll = mentionedUserIds.includes("*");
  const mentionSet = new Set(mentionedUserIds.filter((id) => id !== "*"));
  const targets = members.filter((m) => !skip.has(m.userId));
  if (!targets.length) return [];

  const mentionedTargets = targets.filter((m) => mentionAll || mentionSet.has(m.userId)).map((m) => m.userId);
  const otherTargets = targets.filter((m) => !mentionedTargets.includes(m.userId)).map((m) => m.userId);

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
    .where(and(eq(channelMember.channelId, channelId), inArray(channelMember.userId, targets.map((m) => m.userId))));
  const bumps: UnreadBump[] = [];
  for (const m of fresh) {
    const bump: UnreadBump = {
      userId: m.userId,
      workspaceId: m.workspaceId,
      channelId,
      unreadCount: m.unreadCount,
      mentionCount: m.mentionCount,
    };
    bumps.push(bump);
    hub.broadcastToUser(m.userId, {
      type: "unread",
      channelId,
      workspaceId: m.workspaceId,
      unreadCount: m.unreadCount,
      mentionCount: m.mentionCount,
    });
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
