import type { IncomingMessage } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";
import { and, eq } from "drizzle-orm";
import type { WsClientEvent } from "@relay/shared";
import { requireChannelMember, requireMessageAccess, resolveActiveWorkspaceId } from "./access.js";
import { getAuthUser } from "./auth.js";
import type { Auth } from "./better-auth.js";
import { message, reaction, workspaceMember } from "./db/schema.js";
import { selectWorkspace } from "./domain.js";
import { joinHuddle, leaveHuddle } from "./huddle.js";
import { broadcastUnread, type Hub } from "./hub.js";
import { hydrateMessages, markRead, type AppDb } from "./queries.js";
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
  auth: Auth;
}) {
  const { wss, db, hub, auth } = opts;

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const token = readToken(req);
    const headers = new Headers();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (req.headers.host) headers.set("host", String(req.headers.host));
    if (req.headers.cookie) headers.set("cookie", String(req.headers.cookie));
    const user = await getAuthUser(auth, headers);
    if (!user) {
      ws.close(4401, "unauthorized");
      return;
    }
    await provisionAuthedUser(db, user);

    const userId = user.id;
    const activeWorkspaceId = await resolveActiveWorkspaceId(db, userId, null);
    const client = hub.add(ws, userId, activeWorkspaceId);
    hub.send(ws, { type: "ready", userId, activeWorkspaceId });

    if (activeWorkspaceId) {
      await db
        .update(workspaceMember)
        .set({ presence: "active", updatedAt: new Date() })
        .where(and(eq(workspaceMember.workspaceId, activeWorkspaceId), eq(workspaceMember.userId, userId)));
      hub.broadcastToWorkspace(activeWorkspaceId, {
        type: "presence",
        workspaceId: activeWorkspaceId,
        userId,
        presence: "active",
      });
    }

    ws.on("message", async (raw) => {
      let event: WsClientEvent;
      try {
        event = JSON.parse(String(raw)) as WsClientEvent;
      } catch {
        return;
      }
      try {
        if (event.type === "workspace.select") {
          await selectWorkspace(db, userId, event.workspaceId);
          hub.setWorkspace(client, event.workspaceId);
          hub.send(ws, { type: "ready", userId, activeWorkspaceId: event.workspaceId });
          return;
        }
        if (event.type === "watch") {
          await requireChannelMember(db, event.channelId, userId);
          hub.watch(client, event.channelId);
          return;
        }
        if (event.type === "unwatch") {
          hub.unwatch(client, event.channelId);
          return;
        }
        if (event.type === "subscribe") {
          await requireChannelMember(db, event.channelId, userId);
          hub.subscribe(client, event.channelId);
          const cleared = await markRead(db, event.channelId, userId);
          if (cleared) {
            broadcastUnread(hub, {
              userId,
              workspaceId: cleared.workspaceId,
              channelId: event.channelId,
              unreadCount: 0,
              mentionCount: 0,
            });
          }
          return;
        }
        if (event.type === "unsubscribe") {
          hub.unsubscribe(client, event.channelId);
          return;
        }
        if (event.type === "typing") {
          await requireChannelMember(db, event.channelId, userId);
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
          const workspaceId = client.workspaceId ?? (await resolveActiveWorkspaceId(db, userId, null));
          if (!workspaceId) return;
          await db
            .update(workspaceMember)
            .set({ presence: event.presence, updatedAt: new Date() })
            .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)));
          hub.broadcastToWorkspace(workspaceId, {
            type: "presence",
            workspaceId,
            userId,
            presence: event.presence,
          });
          return;
        }
        if (event.type === "message.send") {
          await requireChannelMember(db, event.channelId, userId);
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
          const access = await requireMessageAccess(db, messageId, userId);
          const [existing] = await db
            .select()
            .from(reaction)
            .where(and(eq(reaction.messageId, messageId), eq(reaction.userId, userId), eq(reaction.emoji, emoji)));
          if (existing) {
            await db
              .delete(reaction)
              .where(and(eq(reaction.messageId, messageId), eq(reaction.userId, userId), eq(reaction.emoji, emoji)));
          } else {
            await db.insert(reaction).values({ messageId, userId, emoji });
          }
          const [row] = await db.select().from(message).where(eq(message.id, messageId));
          const [hydrated] = await hydrateMessages(db, [row]);
          hub.broadcastToChannel(access.channel.id, { type: "message.updated", message: hydrated });
          return;
        }
        if (event.type === "huddle.join") {
          await joinHuddle(db, hub, { channelId: event.channelId, userId, userName: user.name });
          return;
        }
        if (event.type === "huddle.leave") {
          await leaveHuddle(db, hub, { channelId: event.channelId, userId });
        }
      } catch (err) {
        console.error(err);
        hub.send(ws, { type: "error", message: err instanceof Error ? err.message : "server error" });
      }
    });

    ws.on("close", async () => {
      const still = hub.isOnline(userId);
      if (!still && client.workspaceId) {
        await db
          .update(workspaceMember)
          .set({ presence: "away", updatedAt: new Date() })
          .where(and(eq(workspaceMember.workspaceId, client.workspaceId), eq(workspaceMember.userId, userId)));
        hub.broadcastToWorkspace(client.workspaceId, {
          type: "presence",
          workspaceId: client.workspaceId,
          userId,
          presence: "away",
        });
      }
    });
  });
}
