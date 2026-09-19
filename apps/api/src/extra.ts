import { and, desc, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import type { Hono } from "hono";
import type { SearchHit } from "@relay/shared";
import {
  channel,
  channelMember,
  invite,
  message,
  savedItem,
  user,
  workspace,
  workspaceMember,
} from "./db/schema.js";
import type { Hub } from "./hub.js";
import { joinWorkspace, createWorkspace, type AuthPerson } from "./provision.js";
import {
  getMembers,
  hydrateMessages,
  loadWorkspaceChannels,
  mentionMap,
  toChannel,
  toPublicWorkspace,
  type AppDb,
} from "./queries.js";
import { avatarObjectKey, publicFileUrl, storage, workspaceIconObjectKey } from "./storage.js";

type Env = {
  Variables: {
    userId: string;
    userName: string;
    userImage: string | null;
  };
};

async function requireMember(db: AppDb, workspaceId: string, userId: string) {
  const [row] = await db
    .select()
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function readImage(c: { req: { formData: () => Promise<FormData> } }) {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Choose a photo", status: 400 as const };
  if (!file.type.startsWith("image/")) return { error: "Use a PNG, JPG, GIF, or WebP", status: 400 as const };
  if (file.size > 8 * 1024 * 1024) return { error: "Keep photos under 8 MB", status: 400 as const };
  return { file, buf: Buffer.from(await file.arrayBuffer()) };
}

export function registerExtraRoutes(authed: Hono<Env>, db: AppDb, hub: Hub) {
  authed.post("/workspaces", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json<{ name?: string }>();
    const name = body.name?.trim();
    if (!name) return c.json({ error: "Name your workspace" }, 400);
    const [person] = await db.select().from(user).where(eq(user.id, userId));
    if (!person) return c.json({ error: "No user" }, 404);
    const [existing] = await db
      .select()
      .from(workspaceMember)
      .where(eq(workspaceMember.userId, userId))
      .limit(1);
    if (existing) return c.json({ error: "Already in a workspace" }, 409);
    const ws = await createWorkspace(db, {
      id: person.id,
      name: person.name,
      email: person.email,
      image: person.image,
    }, name);
    if (!ws) return c.json({ error: "Couldn’t create workspace" }, 500);
    return c.json({ workspace: await toPublicWorkspace(ws) });
  });

  authed.patch("/workspaces/:id", async (c) => {
    const userId = c.get("userId");
    const workspaceId = c.req.param("id");
    const mem = await requireMember(db, workspaceId, userId);
    if (!mem) return c.json({ error: "Forbidden" }, 403);
    if (mem.role !== "owner" && mem.role !== "admin") {
      return c.json({ error: "Only workspace admins can edit settings" }, 403);
    }
    const body = await c.req.json<{
      name?: string;
      iconColor?: string;
      iconLetter?: string;
      iconKey?: string | null;
    }>();
    const [ws] = await db.select().from(workspace).where(eq(workspace.id, workspaceId));
    if (!ws) return c.json({ error: "Not found" }, 404);
    const name = body.name?.trim() || ws.name;
    const iconLetter =
      body.iconLetter?.trim().slice(0, 2).toUpperCase() ||
      (body.name?.trim() ? body.name.trim()[0]!.toUpperCase() : ws.iconLetter);
    const iconColor = body.iconColor?.trim() || ws.iconColor;
    const iconKey = body.iconKey === undefined ? ws.iconKey : body.iconKey;
    await db
      .update(workspace)
      .set({ name, iconLetter, iconColor, iconKey })
      .where(eq(workspace.id, workspaceId));
    const [next] = await db.select().from(workspace).where(eq(workspace.id, workspaceId));
    if (!next) return c.json({ error: "Not found" }, 404);
    const payload = await toPublicWorkspace(next);
    hub.broadcastAll({ type: "workspace.updated", workspace: payload });
    return c.json({ workspace: payload });
  });

  authed.post("/workspaces/:id/icon", async (c) => {
    const userId = c.get("userId");
    const workspaceId = c.req.param("id");
    const mem = await requireMember(db, workspaceId, userId);
    if (!mem) return c.json({ error: "Forbidden" }, 403);
    if (mem.role !== "owner" && mem.role !== "admin") {
      return c.json({ error: "Only workspace admins can edit settings" }, 403);
    }
    const file = await readImage(c);
    if ("error" in file) return c.json({ error: file.error }, file.status);
    const key = workspaceIconObjectKey(workspaceId, file.file.name);
    await storage().upload(key, file.buf, { contentType: file.file.type || "image/png" });
    await db.update(workspace).set({ iconKey: key }).where(eq(workspace.id, workspaceId));
    const [next] = await db.select().from(workspace).where(eq(workspace.id, workspaceId));
    if (!next) return c.json({ error: "Not found" }, 404);
    const payload = await toPublicWorkspace(next);
    hub.broadcastAll({ type: "workspace.updated", workspace: payload });
    return c.json({ workspace: payload });
  });

  authed.post("/me/photo", async (c) => {
    const userId = c.get("userId");
    const file = await readImage(c);
    if ("error" in file) return c.json({ error: file.error }, file.status);
    const key = avatarObjectKey(userId, file.file.name);
    await storage().upload(key, file.buf, { contentType: file.file.type || "image/png" });
    await db.update(user).set({ image: key, updatedAt: new Date() }).where(eq(user.id, userId));
    const image = await publicFileUrl(key);
    const [mem] = await db.select().from(workspaceMember).where(eq(workspaceMember.userId, userId)).limit(1);
    if (mem) {
      const members = await getMembers(db, mem.workspaceId);
      const member = members.find((m) => m.userId === userId);
      if (member) hub.broadcastAll({ type: "member.updated", member });
    }
    return c.json({ image });
  });

  authed.patch("/me", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json<{
      displayName?: string;
      title?: string | null;
      statusText?: string | null;
      statusEmoji?: string | null;
      presence?: string;
    }>();
    const [mem] = await db.select().from(workspaceMember).where(eq(workspaceMember.userId, userId)).limit(1);
    if (!mem) return c.json({ error: "No workspace" }, 404);
    await db
      .update(workspaceMember)
      .set({
        displayName: body.displayName?.trim() || mem.displayName,
        title: body.title === undefined ? mem.title : body.title,
        statusText: body.statusText === undefined ? mem.statusText : body.statusText,
        statusEmoji: body.statusEmoji === undefined ? mem.statusEmoji : body.statusEmoji,
        presence: body.presence ?? mem.presence,
      })
      .where(and(eq(workspaceMember.workspaceId, mem.workspaceId), eq(workspaceMember.userId, userId)));
    if (body.presence) hub.broadcastAll({ type: "presence", userId, presence: body.presence as "active" });
    const members = await getMembers(db, mem.workspaceId);
    const member = members.find((m) => m.userId === userId);
    if (member) hub.broadcastAll({ type: "member.updated", member });
    return c.json({ ok: true });
  });

  authed.post("/channels", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json<{ name: string; topic?: string; isPrivate?: boolean; workspaceId: string }>();
    const name = body.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!name) return c.json({ error: "Name required" }, 400);
    const mem = await requireMember(db, body.workspaceId, userId);
    if (!mem) return c.json({ error: "Forbidden" }, 403);
    const [dup] = await db
      .select()
      .from(channel)
      .where(and(eq(channel.workspaceId, body.workspaceId), eq(channel.name, name), eq(channel.isDm, false)))
      .limit(1);
    if (dup) return c.json({ error: "Channel already exists" }, 409);
    const id = crypto.randomUUID();
    await db.insert(channel).values({
      id,
      workspaceId: body.workspaceId,
      name,
      topic: body.topic?.trim() || null,
      isPrivate: Boolean(body.isPrivate),
      createdBy: userId,
    });
    const members = await db.select().from(workspaceMember).where(eq(workspaceMember.workspaceId, body.workspaceId));
    for (const m of members) {
      if (body.isPrivate && m.userId !== userId) continue;
      await db.insert(channelMember).values({ channelId: id, userId: m.userId });
    }
    const [ch] = await db.select().from(channel).where(eq(channel.id, id));
    const [membership] = await db
      .select()
      .from(channelMember)
      .where(and(eq(channelMember.channelId, id), eq(channelMember.userId, userId)));
    const people = await getMembers(db, body.workspaceId);
    const payload = await toChannel(db, ch, membership, people, userId);
    hub.broadcastAll({ type: "channel.created", channel: payload });
    return c.json({ channel: payload });
  });

  authed.post("/dms", async (c) => {
    const userId = c.get("userId");
    const { userId: otherId, workspaceId } = await c.req.json<{ userId: string; workspaceId: string }>();
    if (!otherId || otherId === userId) return c.json({ error: "Pick a teammate" }, 400);
    const mem = await requireMember(db, workspaceId, userId);
    const otherMem = await requireMember(db, workspaceId, otherId);
    if (!mem || !otherMem) return c.json({ error: "Forbidden" }, 403);

    const mine = await db.select().from(channelMember).where(eq(channelMember.userId, userId));
    for (const row of mine) {
      const [ch] = await db.select().from(channel).where(eq(channel.id, row.channelId));
      if (!ch?.isDm || ch.workspaceId !== workspaceId) continue;
      const people = await db.select().from(channelMember).where(eq(channelMember.channelId, ch.id));
      if (people.length === 2 && people.some((p) => p.userId === otherId)) {
        const members = await getMembers(db, workspaceId);
        return c.json({ channel: await toChannel(db, ch, row, members, userId) });
      }
    }

    const id = crypto.randomUUID();
    const [other] = await db.select().from(user).where(eq(user.id, otherId));
    await db.insert(channel).values({
      id,
      workspaceId,
      name: other?.name ?? "dm",
      isDm: true,
      createdBy: userId,
    });
    await db.insert(channelMember).values([
      { channelId: id, userId },
      { channelId: id, userId: otherId },
    ]);
    const [ch] = await db.select().from(channel).where(eq(channel.id, id));
    const [membership] = await db
      .select()
      .from(channelMember)
      .where(and(eq(channelMember.channelId, id), eq(channelMember.userId, userId)));
    const members = await getMembers(db, workspaceId);
    const payload = await toChannel(db, ch, membership, members, userId);
    hub.broadcastToUser(userId, { type: "channel.created", channel: payload });
    const [otherMembership] = await db
      .select()
      .from(channelMember)
      .where(and(eq(channelMember.channelId, id), eq(channelMember.userId, otherId)));
    const otherPayload = await toChannel(db, ch, otherMembership, members, otherId);
    hub.broadcastToUser(otherId, { type: "channel.created", channel: otherPayload });
    return c.json({ channel: payload });
  });

  authed.post("/channels/:id/star", async (c) => {
    const userId = c.get("userId");
    const channelId = c.req.param("id");
    const [mem] = await db
      .select()
      .from(channelMember)
      .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId)));
    if (!mem) return c.json({ error: "Forbidden" }, 403);
    await db
      .update(channelMember)
      .set({ isStarred: !mem.isStarred })
      .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId)));
    return c.json({ isStarred: !mem.isStarred });
  });

  authed.patch("/messages/:id", async (c) => {
    const userId = c.get("userId");
    const { body } = await c.req.json<{ body: string }>();
    const [row] = await db.select().from(message).where(eq(message.id, c.req.param("id")));
    if (!row || row.userId !== userId) return c.json({ error: "Forbidden" }, 403);
    await db.update(message).set({ body: body.trim(), updatedAt: new Date() }).where(eq(message.id, row.id));
    const [fresh] = await db.select().from(message).where(eq(message.id, row.id));
    const [hydrated] = await hydrateMessages(db, [fresh]);
    hub.broadcastToChannel(row.channelId, { type: "message.updated", message: hydrated });
    return c.json({ message: hydrated });
  });

  authed.delete("/messages/:id", async (c) => {
    const userId = c.get("userId");
    const [row] = await db.select().from(message).where(eq(message.id, c.req.param("id")));
    if (!row || row.userId !== userId) return c.json({ error: "Forbidden" }, 403);
    await db.delete(message).where(eq(message.id, row.id));
    hub.broadcastToChannel(row.channelId, {
      type: "message.deleted",
      messageId: row.id,
      channelId: row.channelId,
      parentId: row.parentId,
    });
    return c.json({ ok: true });
  });

  authed.post("/messages/:id/later", async (c) => {
    const userId = c.get("userId");
    const messageId = c.req.param("id");
    const [existing] = await db
      .select()
      .from(savedItem)
      .where(and(eq(savedItem.userId, userId), eq(savedItem.messageId, messageId)));
    if (existing) {
      await db.delete(savedItem).where(and(eq(savedItem.userId, userId), eq(savedItem.messageId, messageId)));
      return c.json({ saved: false });
    }
    await db.insert(savedItem).values({ userId, messageId });
    return c.json({ saved: true });
  });

  authed.get("/later", async (c) => {
    const userId = c.get("userId");
    const rows = await db
      .select()
      .from(savedItem)
      .where(eq(savedItem.userId, userId))
      .orderBy(desc(savedItem.createdAt));
    if (!rows.length) return c.json({ items: [] });
    const msgs = await db.select().from(message).where(inArray(message.id, rows.map((r) => r.messageId)));
    const hydrated = await hydrateMessages(db, msgs);
    const byId = new Map(hydrated.map((m) => [m.id, m]));
    return c.json({
      items: rows
        .map((r) => byId.get(r.messageId))
        .filter(Boolean)
        .map((m) => ({ ...m!, savedAt: true })),
    });
  });

  authed.get("/files", async (c) => {
    const userId = c.get("userId");
    const [mem] = await db.select().from(workspaceMember).where(eq(workspaceMember.userId, userId)).limit(1);
    if (!mem) return c.json({ items: [] });
    const memberships = await db.select().from(channelMember).where(eq(channelMember.userId, userId));
    const ids = memberships.map((m) => m.channelId);
    if (!ids.length) return c.json({ items: [] });
    const rows = await db
      .select()
      .from(message)
      .where(and(inArray(message.channelId, ids), isNotNull(message.fileKey)))
      .orderBy(desc(message.createdAt))
      .limit(80);
    const hydrated = await hydrateMessages(db, rows);
    const chans = await loadWorkspaceChannels(db, mem.workspaceId, userId);
    const names = new Map(chans.map((ch) => [ch.id, ch.name]));
    return c.json({
      items: hydrated
        .filter((m) => m.fileKey)
        .map((m) => ({
          messageId: m.id,
          channelId: m.channelId,
          channelName: names.get(m.channelId) ?? "channel",
          fileKey: m.fileKey!,
          fileName: m.fileName ?? "file",
          fileContentType: m.fileContentType ?? null,
          fileUrl: m.fileUrl ?? null,
          userName: m.userName,
          createdAt: m.createdAt,
        })),
    });
  });

  authed.get("/activity", async (c) => {
    const userId = c.get("userId");
    const [mem] = await db.select().from(workspaceMember).where(eq(workspaceMember.userId, userId)).limit(1);
    if (!mem) return c.json({ items: [] });
    const names = await mentionMap(db, mem.workspaceId);
    const myNames = [...names.entries()].filter(([, id]) => id === userId).map(([n]) => n);
    const memberships = await db.select().from(channelMember).where(eq(channelMember.userId, userId));
    const ids = memberships.map((m) => m.channelId);
    if (!ids.length) return c.json({ items: [] });
    const rows = await db
      .select()
      .from(message)
      .where(inArray(message.channelId, ids))
      .orderBy(desc(message.createdAt))
      .limit(200);
    const hydrated = await hydrateMessages(db, rows);
    const chans = await loadWorkspaceChannels(db, mem.workspaceId, userId);
    const chNames = new Map(chans.map((ch) => [ch.id, ch.name]));
    const items = [];
    for (const m of hydrated) {
      const mentioned = myNames.some((n) => new RegExp(`(^|\\s)@${n}\\b`, "i").test(m.body));
      if (mentioned && m.userId !== userId) {
        items.push({
          id: `mention-${m.id}`,
          kind: "mention" as const,
          at: m.createdAt,
          channelId: m.channelId,
          channelName: chNames.get(m.channelId) ?? "",
          message: m,
        });
      }
      if (m.userId === userId && m.reactions.length) {
        items.push({
          id: `rxn-${m.id}`,
          kind: "reaction" as const,
          at: m.updatedAt ?? m.createdAt,
          channelId: m.channelId,
          channelName: chNames.get(m.channelId) ?? "",
          message: m,
          emoji: m.reactions[0]?.emoji,
        });
      }
      if (m.replyCount > 0 && m.userId === userId) {
        items.push({
          id: `thread-${m.id}`,
          kind: "thread" as const,
          at: m.latestReplyAt ?? m.createdAt,
          channelId: m.channelId,
          channelName: chNames.get(m.channelId) ?? "",
          message: m,
        });
      }
    }
    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return c.json({ items: items.slice(0, 50) });
  });

  authed.get("/search", async (c) => {
    const userId = c.get("userId");
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ hits: [] });
    const [mem] = await db.select().from(workspaceMember).where(eq(workspaceMember.userId, userId)).limit(1);
    if (!mem) return c.json({ hits: [] });
    const like = `%${q}%`;
    const chans = await loadWorkspaceChannels(db, mem.workspaceId, userId);
    const members = await getMembers(db, mem.workspaceId);
    const hits: SearchHit[] = [
      ...chans
        .filter((ch) => ch.name.toLowerCase().includes(q.toLowerCase()))
        .map((ch) => ({
          kind: "channel" as const,
          id: ch.id,
          title: ch.isDm ? ch.name : `#${ch.name}`,
          channelId: ch.id,
        })),
      ...members
        .filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || m.displayName.toLowerCase().includes(q.toLowerCase()))
        .map((m) => ({
          kind: "member" as const,
          id: m.userId,
          title: m.displayName,
          userId: m.userId,
        })),
    ];
    const memberships = await db.select().from(channelMember).where(eq(channelMember.userId, userId));
    const ids = memberships.map((m) => m.channelId);
    if (ids.length) {
      const rows = await db
        .select()
        .from(message)
        .where(and(inArray(message.channelId, ids), ilike(message.body, like)))
        .orderBy(desc(message.createdAt))
        .limit(20);
      const hydrated = await hydrateMessages(db, rows);
      for (const m of hydrated) {
        hits.push({
          kind: "message",
          id: m.id,
          title: m.userName,
          snippet: m.body.slice(0, 140),
          channelId: m.channelId,
        });
      }
    }
    return c.json({ hits: hits.slice(0, 40) });
  });

  authed.get("/invites", async (c) => {
    const userId = c.get("userId");
    const [mem] = await db.select().from(workspaceMember).where(eq(workspaceMember.userId, userId)).limit(1);
    if (!mem) return c.json({ invites: [] });
    const rows = await db
      .select()
      .from(invite)
      .where(and(eq(invite.workspaceId, mem.workspaceId), eq(invite.status, "pending")))
      .orderBy(desc(invite.createdAt));
    const origin = c.req.header("origin") ?? process.env.WEB_ORIGIN ?? "http://localhost:5173";
    return c.json({
      invites: rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        email: r.email,
        invitedBy: r.invitedBy,
        token: r.token,
        status: r.status,
        url: `${origin}/?invite=${r.token}`,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  authed.post("/invites", async (c) => {
    const userId = c.get("userId");
    const { email, workspaceId } = await c.req.json<{ email: string; workspaceId: string }>();
    const mem = await requireMember(db, workspaceId, userId);
    if (!mem) return c.json({ error: "Forbidden" }, 403);
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) return c.json({ error: "Valid email required" }, 400);
    const token = crypto.randomUUID().replaceAll("-", "");
    const id = crypto.randomUUID();
    await db.insert(invite).values({
      id,
      workspaceId,
      email: normalized,
      invitedBy: userId,
      token,
      status: "pending",
    });
    const origin = c.req.header("origin") ?? process.env.WEB_ORIGIN ?? "http://localhost:5173";
    return c.json({
      invite: {
        id,
        workspaceId,
        email: normalized,
        invitedBy: userId,
        token,
        status: "pending" as const,
        url: `${origin}/?invite=${token}`,
        createdAt: new Date().toISOString(),
      },
    });
  });

  authed.post("/invites/accept", async (c) => {
    const userId = c.get("userId");
    const { token } = await c.req.json<{ token: string }>();
    const [row] = await db.select().from(invite).where(eq(invite.token, token)).limit(1);
    if (!row || row.status !== "pending") return c.json({ error: "Invite is not valid" }, 400);
    const [person] = await db.select().from(user).where(eq(user.id, userId));
    if (!person) return c.json({ error: "No user" }, 404);
    const authPerson: AuthPerson = {
      id: person.id,
      name: person.name,
      email: person.email,
      image: person.image,
    };
    const [existing] = await db
      .select()
      .from(workspaceMember)
      .where(and(eq(workspaceMember.workspaceId, row.workspaceId), eq(workspaceMember.userId, userId)))
      .limit(1);
    if (!existing) await joinWorkspace(db, row.workspaceId, authPerson);
    await db.update(invite).set({ status: "accepted" }).where(eq(invite.id, row.id));
    const [ws] = await db.select().from(workspace).where(eq(workspace.id, row.workspaceId));
    const members = await getMembers(db, row.workspaceId);
    const joined = members.find((m) => m.userId === userId);
    if (joined) hub.broadcastAll({ type: "member.joined", member: joined });
    if (!ws) return c.json({ error: "Workspace missing" }, 404);
    return c.json({ workspace: await toPublicWorkspace(ws) });
  });

  authed.get("/threads", async (c) => {
    const userId = c.get("userId");
    const memberships = await db.select().from(channelMember).where(eq(channelMember.userId, userId));
    const ids = memberships.map((m) => m.channelId);
    if (!ids.length) return c.json({ items: [] });
    const parents = await db
      .select()
      .from(message)
      .where(inArray(message.channelId, ids))
      .orderBy(desc(message.createdAt))
      .limit(300);
    const hydrated = await hydrateMessages(db, parents);
    return c.json({ items: hydrated.filter((m) => m.replyCount > 0 && !m.parentId).slice(0, 40) });
  });
}
