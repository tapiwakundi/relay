import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { MeResponse } from "@relay/shared";
import {
  HttpError,
  requireChannelMember,
  requireMessageAccess,
  requireWorkspaceMember,
  resolveActiveWorkspaceId,
  workspaceHeader,
} from "./access.js";
import { getAuthUser } from "./auth.js";
import { sanitizeAuthRequest } from "./auth-forwarded.js";
import type { Auth } from "./better-auth.js";
import { message, reaction, user, workspace, workspaceMember } from "./db/schema.js";
import { listPendingInvitesForEmail, registerDeviceToken, unregisterDeviceToken } from "./domain.js";
import { handle, routeParam } from "./errors.js";
import { joinHuddle, leaveHuddle } from "./huddle.js";
import { type Hub } from "./hub.js";
import { provisionAuthedUser } from "./provision.js";
import {
  getMembers,
  hydrateHuddle,
  hydrateMessages,
  listWatchChannels,
  listWorkspaceSummaries,
  loadChannelMessages,
  loadWorkspaceChannels,
  markRead,
  toPublicWorkspace,
  type AppDb,
} from "./queries.js";
import { createChatMessage } from "./send.js";
import { objectKey, publicFileUrl, storage } from "./storage.js";
import { attachment } from "./db/schema.js";
import { registerExtraRoutes } from "./extra.js";
import { desktopHandoffHtml } from "./desktop-handoff.js";

type Env = {
  Variables: {
    userId: string;
    userName: string;
    userImage: string | null;
  };
};

export function createApp(opts: { db: AppDb; hub: Hub; auth: Auth }) {
  const { db, hub, auth } = opts;
  const app = new Hono<Env>();

  const apiOrigin = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
  const origins = [apiOrigin, "http://localhost:3001", "http://127.0.0.1:3001", "http://localhost:8081"];

  function originAllowed(origin: string) {
    if (!origin) return true;
    if (origins.includes(origin)) return true;
    if (
      origin.startsWith("exp://") ||
      origin.startsWith("relay://") ||
      origin.startsWith("exp+relay://") ||
      origin.startsWith("com.endurancelabs.relaydesktop:") ||
      origin.startsWith("com.endurancelabs.relayapp:")
    ) {
      return true;
    }
    try {
      const { hostname } = new URL(origin);
      if (hostname === "localhost" || hostname === "127.0.0.1") return true;
      const parts = hostname.split(".").map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
        const [a, b] = parts;
        if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  app.use("*", async (c, next) => {
    const origin = c.req.header("origin") ?? "";
    if (originAllowed(origin)) {
      c.header("Access-Control-Allow-Origin", origin || apiOrigin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, set-auth-token, expo-origin, x-relay-workspace-id",
      );
      c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      c.header("Access-Control-Expose-Headers", "set-auth-token");
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    return next();
  });

  app.get("/", (c) => c.html(desktopHandoffHtml));
  app.get("/desktop/callback", (c) => c.html(desktopHandoffHtml));

  app.all("/api/auth/*", async (c) => auth.handler(sanitizeAuthRequest(c.req.raw)));

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      livekit: Boolean(process.env.LIVEKIT_URL),
      storage: Boolean(process.env.AWS_ENDPOINT_URL_S3),
    }),
  );

  const authed = new Hono<Env>();
  authed.use("*", async (c, next) => {
    const u = await getAuthUser(auth, c.req.raw.headers);
    if (!u) return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", u.id);
    c.set("userName", u.name);
    const provisioned = await provisionAuthedUser(db, u);
    c.set("userImage", provisioned.image);
    return next();
  });

  authed.get(
    "/me",
    handle(async (c) => {
      const userId = c.get("userId");
      const requested = workspaceHeader(c.req.raw.headers) ?? c.req.query("workspaceId") ?? null;
      const workspaces = await listWorkspaceSummaries(db, userId);
      let activeWorkspaceId: string | null;
      try {
        activeWorkspaceId = await resolveActiveWorkspaceId(db, userId, requested);
      } catch (err) {
        if (!(err instanceof HttpError) || err.status !== 403 || !requested) throw err;
        activeWorkspaceId = await resolveActiveWorkspaceId(db, userId, null);
      }
      const [urow] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
      const mem = activeWorkspaceId
        ? (
            await db
              .select()
              .from(workspaceMember)
              .where(and(eq(workspaceMember.workspaceId, activeWorkspaceId), eq(workspaceMember.userId, userId)))
              .limit(1)
          )[0]
        : null;
      const ws = activeWorkspaceId
        ? (await db.select().from(workspace).where(eq(workspace.id, activeWorkspaceId)))[0]
        : null;
      const members = activeWorkspaceId ? await getMembers(db, activeWorkspaceId) : [];
      const membership = members.find((m) => m.userId === userId) ?? null;
      const payload: MeResponse = {
        user: {
          id: userId,
          name: urow?.name ?? c.get("userName"),
          email: urow?.email ?? "",
          image: await publicFileUrl(urow?.image ?? c.get("userImage")),
          displayName: mem?.displayName ?? urow?.name ?? c.get("userName"),
          title: mem?.title ?? null,
          statusText: mem?.statusText ?? null,
          statusEmoji: mem?.statusEmoji ?? null,
          presence: mem?.presence ?? "active",
          role: mem?.role ?? "member",
        },
        workspaces,
        activeWorkspaceId,
        membership,
        workspace: ws ? await toPublicWorkspace(ws) : null,
        pendingInvites: await listPendingInvitesForEmail(db, urow?.email ?? "", userId),
      };
      return c.json(payload);
    }),
  );

  authed.get(
    "/workspaces/:id/bootstrap",
    handle(async (c) => {
      const userId = c.get("userId");
      const wsId = routeParam(c, "id");
      await requireWorkspaceMember(db, wsId, userId);
      const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
      if (!ws || ws.deletedAt) throw new HttpError(404, "Not found");
      const members = await getMembers(db, wsId);
      const payload = await loadWorkspaceChannels(db, wsId, userId);
      return c.json({ workspace: await toPublicWorkspace(ws), members, channels: payload });
    }),
  );

  authed.get(
    "/channels/:id/messages",
    handle(async (c) => {
      const channelId = routeParam(c, "id");
      const parentId = c.req.query("parentId") ?? null;
      const cursor = c.req.query("cursor") ?? null;
      const limit = Number(c.req.query("limit") ?? 80);
      await requireChannelMember(db, channelId, c.get("userId"));
      await markRead(db, channelId, c.get("userId"));
      const page = await loadChannelMessages(db, channelId, { parentId, cursor, limit });
      const huddleState = await hydrateHuddle(db, channelId);
      return c.json({ ...page, huddle: huddleState });
    }),
  );

  authed.post(
    "/channels/:id/messages",
    handle(async (c) => {
      const channelId = routeParam(c, "id");
      const body = await c.req.json<{
        body?: string;
        parentId?: string | null;
        clientId?: string;
        fileKey?: string;
        fileName?: string;
        fileContentType?: string;
      }>();
      const result = await createChatMessage(db, hub, {
        channelId,
        userId: c.get("userId"),
        body: body.body ?? "",
        parentId: body.parentId,
        clientId: body.clientId,
        fileKey: body.fileKey,
        fileName: body.fileName,
        fileContentType: body.fileContentType,
      });
      if (!result.ok) return c.json({ error: result.error }, result.status);
      return c.json({ message: result.message });
    }),
  );

  authed.post(
    "/messages/:id/reactions",
    handle(async (c) => {
      const messageId = routeParam(c, "id");
      const { emoji } = await c.req.json<{ emoji: string }>();
      const userId = c.get("userId");
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
      return c.json({ message: hydrated });
    }),
  );

  authed.post(
    "/channels/:id/huddle/join",
    handle(async (c) => {
      const result = await joinHuddle(db, hub, {
        channelId: routeParam(c, "id"),
        userId: c.get("userId"),
        userName: c.get("userName"),
      });
      return c.json(result);
    }),
  );

  authed.post(
    "/channels/:id/huddle/leave",
    handle(async (c) => {
      const result = await leaveHuddle(db, hub, {
        channelId: routeParam(c, "id"),
        userId: c.get("userId"),
      });
      return c.json(result);
    }),
  );

  authed.post(
    "/files",
    handle(async (c) => {
      const userId = c.get("userId");
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new HttpError(400, "Missing file");
      const requested =
        workspaceHeader(c.req.raw.headers) ??
        (typeof form.get("workspaceId") === "string" ? String(form.get("workspaceId")) : null) ??
        c.req.query("workspaceId") ??
        null;
      const workspaceId = await resolveActiveWorkspaceId(db, userId, requested);
      if (!workspaceId) throw new HttpError(404, "No workspace");
      await requireWorkspaceMember(db, workspaceId, userId);
      const key = objectKey(userId, file.name);
      const files = storage();
      const buf = Buffer.from(await file.arrayBuffer());
      await files.upload(key, buf, { contentType: file.type || "application/octet-stream" });
      await db.insert(attachment).values({
        workspaceId,
        uploadedBy: userId,
        storageKey: key,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: buf.byteLength,
        purpose: "message",
      });
      const url = await files.url(key, { expiresIn: 3600 });
      return c.json({
        key,
        name: file.name,
        contentType: file.type,
        url,
      });
    }),
  );

  authed.get(
    "/watch-channels",
    handle(async (c) => {
      const channels = await listWatchChannels(db, c.get("userId"));
      return c.json({ channels });
    }),
  );

  authed.post(
    "/device-tokens",
    handle(async (c) => {
      const { token, platform } = await c.req.json<{ token: string; platform: string }>();
      await registerDeviceToken(db, { userId: c.get("userId"), token, platform });
      return c.json({ ok: true });
    }),
  );

  authed.delete(
    "/device-tokens",
    handle(async (c) => {
      const { token } = await c.req.json<{ token: string }>();
      await unregisterDeviceToken(db, { userId: c.get("userId"), token });
      return c.json({ ok: true });
    }),
  );

  registerExtraRoutes(authed, db, hub);

  app.route("/api", authed);
  return app;
}
