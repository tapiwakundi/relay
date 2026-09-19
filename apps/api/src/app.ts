import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "./auth.js";
import type { Auth } from "./better-auth.js";
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
import { mintLivekitToken } from "./livekit.js";
import {
  getMembers,
  hydrateHuddle,
  hydrateMessages,
  loadChannelMessages,
  loadWorkspaceChannels,
  markRead,
  toPublicWorkspace,
  type AppDb,
} from "./queries.js";
import { provisionAuthedUser } from "./provision.js";
import { Hub, endHuddleIfEmpty } from "./hub.js";
import { createChatMessage } from "./send.js";
import { objectKey, publicFileUrl, storage } from "./storage.js";
import { registerExtraRoutes } from "./extra.js";

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

  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  const origins = [webOrigin, "http://localhost:5173", "http://localhost:3001", "http://localhost:8081"];

  function originAllowed(origin: string) {
    if (!origin) return true;
    if (origins.includes(origin)) return true;
    if (origin.startsWith("exp://") || origin.startsWith("relay://") || origin.startsWith("exp+relay://")) return true;
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
      c.header("Access-Control-Allow-Origin", origin || webOrigin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, set-auth-token, expo-origin");
      c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      c.header("Access-Control-Expose-Headers", "set-auth-token");
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    return next();
  });

  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

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

  authed.get("/me", async (c) => {
    const userId = c.get("userId");
    const [mem] = await db
      .select()
      .from(workspaceMember)
      .where(eq(workspaceMember.userId, userId))
      .limit(1);
    const [ws] = mem
      ? await db.select().from(workspace).where(eq(workspace.id, mem.workspaceId))
      : [null];
    const [urow] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    return c.json({
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
      workspace: ws ? await toPublicWorkspace(ws) : null,
    });
  });

  authed.get("/workspaces/:id/bootstrap", async (c) => {
    const userId = c.get("userId");
    const wsId = c.req.param("id");
    const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
    if (!ws) return c.json({ error: "Not found" }, 404);
    const [allowed] = await db
      .select()
      .from(workspaceMember)
      .where(and(eq(workspaceMember.workspaceId, wsId), eq(workspaceMember.userId, userId)))
      .limit(1);
    if (!allowed) return c.json({ error: "Forbidden" }, 403);

    const members = await getMembers(db, wsId);
    const payload = await loadWorkspaceChannels(db, wsId, userId);
    return c.json({ workspace: await toPublicWorkspace(ws), members, channels: payload });
  });

  authed.get("/channels/:id/messages", async (c) => {
    const channelId = c.req.param("id");
    const parentId = c.req.query("parentId") ?? null;
    await markRead(db, channelId, c.get("userId"));
    const messages = await loadChannelMessages(db, channelId, parentId);
    const huddleState = await hydrateHuddle(db, channelId);
    const [ch] = await db.select().from(channel).where(eq(channel.id, channelId));
    return c.json({ channel: ch, messages, huddle: huddleState });
  });

  authed.post("/channels/:id/messages", async (c) => {
    const channelId = c.req.param("id");
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
  });

  authed.post("/messages/:id/reactions", async (c) => {
    const messageId = c.req.param("id");
    const { emoji } = await c.req.json<{ emoji: string }>();
    const userId = c.get("userId");
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
    hub.broadcastToChannel(row.channelId, { type: "message.updated", message: hydrated });
    return c.json({ message: hydrated });
  });

  authed.post("/channels/:id/huddle/join", async (c) => {
    const channelId = c.req.param("id");
    const userId = c.get("userId");
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
    await db
      .insert(huddleParticipant)
      .values({ huddleId: h.id, userId })
      .onConflictDoNothing();
    const state = await hydrateHuddle(db, channelId);
    hub.broadcastToChannel(channelId, { type: "huddle.updated", channelId, huddle: state });
    hub.broadcastAll({ type: "huddle.updated", channelId, huddle: state });
    const token = await mintLivekitToken({
      room: h.livekitRoom,
      identity: userId,
      name: c.get("userName"),
    });
    return c.json({ huddle: state, livekit: token });
  });

  authed.post("/channels/:id/huddle/leave", async (c) => {
    const channelId = c.req.param("id");
    const userId = c.get("userId");
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
    return c.json({ huddle: state });
  });

  authed.post("/files", async (c) => {
    const userId = c.get("userId");
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "Missing file" }, 400);
    const key = objectKey(userId, file.name);
    const files = storage();
    const buf = Buffer.from(await file.arrayBuffer());
    await files.upload(key, buf, { contentType: file.type || "application/octet-stream" });
    const url = await files.url(key, { expiresIn: 3600 });
    return c.json({
      key,
      name: file.name,
      contentType: file.type,
      url,
    });
  });

  authed.post("/device-tokens", async (c) => {
    const { token, platform } = await c.req.json<{ token: string; platform: string }>();
    const { deviceToken } = await import("./db/schema.js");
    await db
      .insert(deviceToken)
      .values({
        id: crypto.randomUUID(),
        userId: c.get("userId"),
        token,
        platform,
      })
      .onConflictDoNothing();
    return c.json({ ok: true });
  });

  registerExtraRoutes(authed, db, hub);

  app.route("/api", authed);
  return app;
}
