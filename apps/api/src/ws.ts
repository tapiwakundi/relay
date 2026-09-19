import type { IncomingMessage } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";
import { and, eq } from "drizzle-orm";
import type { WsClientEvent } from "@relay/shared";
import { getAuthUser } from "./auth.js";
import {
  huddle,
  huddleParticipant,
  message,
  reaction,
  workspaceMember,
} from "./db/schema.js";
import { endHuddleIfEmpty, type Hub } from "./hub.js";
import { mintLivekitToken } from "./livekit.js";
import { hydrateHuddle, hydrateMessages, markRead, type AppDb } from "./queries.js";
import { provisionAuthedUser } from "./provision.js";
import { createChatMessage } from "./send.js";

function readToken(req: IncomingMessage) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("token");
}

export function attachSockets(opts: {
  wss: WebSocketServer;
  db: AppDb;
  hub: Hub;
}) {
  const { wss, db, hub } = opts;

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const token = readToken(req);
    const headers = new Headers();
    if (token) headers.set("authorization", `Bearer ${token}`);
    const user = await getAuthUser(headers);
    if (!user) {
      ws.close(4401, "unauthorized");
      return;
    }
    await provisionAuthedUser(db, user);

    const userId = user.id;
    const client = hub.add(ws, userId);
    hub.send(ws, { type: "ready", userId });

    await db
      .update(workspaceMember)
      .set({ presence: "active" })
      .where(eq(workspaceMember.userId, userId));
    hub.broadcastAll({ type: "presence", userId, presence: "active" });

    ws.on("message", async (raw) => {
      let event: WsClientEvent;
      try {
        event = JSON.parse(String(raw)) as WsClientEvent;
      } catch {
        return;
      }
      try {
        if (event.type === "subscribe") {
          hub.subscribe(client, event.channelId);
          await markRead(db, event.channelId, userId);
          return;
        }
        if (event.type === "unsubscribe") {
          hub.unsubscribe(client, event.channelId);
          return;
        }
        if (event.type === "typing") {
          hub.broadcastToChannel(
            event.channelId,
            {
              type: "typing",
              channelId: event.channelId,
              userId,
              userName: user.name,
              parentId: event.parentId,
            },
            ws,
          );
          return;
        }
        if (event.type === "presence.set") {
          await db
            .update(workspaceMember)
            .set({ presence: event.presence })
            .where(eq(workspaceMember.userId, userId));
          hub.broadcastAll({ type: "presence", userId, presence: event.presence });
          return;
        }
        if (event.type === "message.send") {
          hub.subscribe(client, event.channelId);
          const result = await createChatMessage(db, hub, {
            channelId: event.channelId,
            userId,
            body: event.body ?? "",
            parentId: event.parentId,
            clientId: event.clientId,
            fileKey: event.fileKey,
            fileName: event.fileName,
            fileContentType: event.fileContentType,
          });
          if (!result.ok) {
            hub.send(ws, { type: "error", message: result.error });
            return;
          }
          hub.send(ws, { type: "message.created", message: result.message });
          return;
        }
        if (event.type === "reaction.toggle") {
          const { messageId, emoji } = event;
          const [existing] = await db
            .select()
            .from(reaction)
            .where(
              and(eq(reaction.messageId, messageId), eq(reaction.userId, userId), eq(reaction.emoji, emoji)),
            );
          if (existing) {
            await db
              .delete(reaction)
              .where(
                and(eq(reaction.messageId, messageId), eq(reaction.userId, userId), eq(reaction.emoji, emoji)),
              );
          } else {
            await db.insert(reaction).values({ messageId, userId, emoji });
          }
          const [row] = await db.select().from(message).where(eq(message.id, messageId));
          const [hydrated] = await hydrateMessages(db, [row]);
          hub.broadcastToChannel(row.channelId, { type: "message.updated", message: hydrated });
          return;
        }
        if (event.type === "huddle.join") {
          const channelId = event.channelId;
          let [h] = await db
            .select()
            .from(huddle)
            .where(and(eq(huddle.channelId, channelId), eq(huddle.active, true)))
            .limit(1);
          if (!h) {
            h = {
              id: crypto.randomUUID(),
              channelId,
              startedBy: userId,
              livekitRoom: `huddle_${channelId}`,
              active: true,
              startedAt: new Date(),
              endedAt: null,
            };
            await db.insert(huddle).values(h);
          }
          await db.insert(huddleParticipant).values({ huddleId: h.id, userId }).onConflictDoNothing();
          const state = await hydrateHuddle(db, channelId);
          hub.broadcastAll({ type: "huddle.updated", channelId, huddle: state });
          const livekit = await mintLivekitToken({
            room: h.livekitRoom,
            identity: userId,
            name: user.name,
          });
          hub.send(ws, { type: "huddle.updated", channelId, huddle: state });
          void livekit;
          return;
        }
        if (event.type === "huddle.leave") {
          const channelId = event.channelId;
          const [h] = await db
            .select()
            .from(huddle)
            .where(and(eq(huddle.channelId, channelId), eq(huddle.active, true)))
            .limit(1);
          if (h) {
            await db
              .delete(huddleParticipant)
              .where(and(eq(huddleParticipant.huddleId, h.id), eq(huddleParticipant.userId, userId)));
            await endHuddleIfEmpty(db, h.id);
          }
          const state = await hydrateHuddle(db, channelId);
          hub.broadcastAll({ type: "huddle.updated", channelId, huddle: state });
        }
      } catch (err) {
        console.error(err);
        hub.send(ws, { type: "error", message: "server error" });
      }
    });

    ws.on("close", async () => {
      const still = hub.isOnline(userId);
      if (!still) {
        await db
          .update(workspaceMember)
          .set({ presence: "away" })
          .where(eq(workspaceMember.userId, userId));
        hub.broadcastAll({ type: "presence", userId, presence: "away" });
      }
    });
  });
}
