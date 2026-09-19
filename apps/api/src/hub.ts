import { and, eq } from "drizzle-orm";
import type { ChatMessage, Huddle, WsServerEvent } from "@relay/shared";
import { WebSocket } from "ws";
import type { AppDb } from "./queries.js";
import { huddle, huddleParticipant } from "./db/schema.js";

type Client = {
  ws: WebSocket;
  userId: string;
  channels: Set<string>;
};

export class Hub {
  private clients = new Set<Client>();

  add(ws: WebSocket, userId: string) {
    const client: Client = { ws, userId, channels: new Set() };
    this.clients.add(client);
    ws.on("close", () => this.clients.delete(client));
    return client;
  }

  subscribe(client: Client, channelId: string) {
    client.channels.add(channelId);
  }

  unsubscribe(client: Client, channelId: string) {
    client.channels.delete(channelId);
  }

  send(ws: WebSocket, event: WsServerEvent) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }

  broadcastToChannel(channelId: string, event: WsServerEvent, except?: WebSocket) {
    for (const c of this.clients) {
      if (c.ws === except) continue;
      if (c.channels.has(channelId)) this.send(c.ws, event);
    }
  }

  broadcastToUser(userId: string, event: WsServerEvent) {
    for (const c of this.clients) {
      if (c.userId === userId) this.send(c.ws, event);
    }
  }

  broadcastAll(event: WsServerEvent) {
    for (const c of this.clients) this.send(c.ws, event);
  }

  isOnline(userId: string) {
    for (const c of this.clients) if (c.userId === userId) return true;
    return false;
  }

  isSubscribed(userId: string, channelId: string) {
    for (const c of this.clients) {
      if (c.userId === userId && c.channels.has(channelId)) return true;
    }
    return false;
  }
}

export async function bumpUnread(
  db: AppDb,
  hub: Hub,
  channelId: string,
  authorId: string,
  mentionedUserIds: string[],
) {
  const { channelMember } = await import("./db/schema.js");
  const members = await db.select().from(channelMember).where(eq(channelMember.channelId, channelId));
  for (const m of members) {
    if (m.userId === authorId) continue;
    if (hub.isSubscribed(m.userId, channelId)) continue;
    const mention = mentionedUserIds.includes(m.userId) ? 1 : 0;
    await db
      .update(channelMember)
      .set({
        unreadCount: (m.unreadCount ?? 0) + 1,
        mentionCount: (m.mentionCount ?? 0) + mention,
      })
      .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, m.userId)));
    hub.broadcastToUser(m.userId, {
      type: "unread",
      channelId,
      unreadCount: (m.unreadCount ?? 0) + 1,
      mentionCount: (m.mentionCount ?? 0) + mention,
    });
  }
}

export function extractMentions(body: string, userIdsByName: Map<string, string>) {
  const ids: string[] = [];
  const re = /@([A-Za-z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const id = userIdsByName.get(match[1].toLowerCase());
    if (id) ids.push(id);
  }
  if (/\b@channel\b|\b@here\b/i.test(body)) {
    /* caller can expand */
  }
  return ids;
}

export function createdEvent(message: ChatMessage): WsServerEvent {
  return { type: "message.created", message };
}

export function huddleEvent(channelId: string, huddleState: Huddle | null): WsServerEvent {
  return { type: "huddle.updated", channelId, huddle: huddleState };
}

export async function endHuddleIfEmpty(db: AppDb, huddleId: string) {
  const parts = await db.select().from(huddleParticipant).where(eq(huddleParticipant.huddleId, huddleId));
  if (parts.length === 0) {
    await db
      .update(huddle)
      .set({ active: false, endedAt: new Date() })
      .where(eq(huddle.id, huddleId));
  }
}
