import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import type { SearchHit } from "@relay/shared";
import {
  HttpError,
  requireChannelMember,
  requireMessageAccess,
  requireWorkspaceAdmin,
  requireWorkspaceMember,
  resolveActiveWorkspaceId,
  workspaceHeader,
} from "./access.js";
import {
  invite,
  message,
  savedItem,
  user,
  workspace,
  workspaceMember,
  channelMember,
} from "./db/schema.js";
import {
  acceptInvite,
  createInvite,
  createNamedChannel,
  createWorkspace,
  inviteLink,
  listPendingInvitesForEmail,
  openDm,
  selectWorkspace,
  type AuthPerson,
} from "./domain.js";
import { handle, routeParam } from "./errors.js";
import type { Hub } from "./hub.js";
import {
  getMembers,
  hydrateMessages,
  listFileMessages,
  loadWorkspaceChannels,
  mentionMap,
  searchMessages,
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

async function requestedWorkspace(c: { req: { raw: Request; query: (k: string) => string | undefined } }, db: AppDb, userId: string) {
  const requested = workspaceHeader(c.req.raw.headers) ?? c.req.query("workspaceId") ?? null;
  const id = await resolveActiveWorkspaceId(db, userId, requested);
  if (!id) throw new HttpError(404, "No workspace");
  return id;
}

async function personFor(db: AppDb, userId: string): Promise<AuthPerson> {
  const [person] = await db.select().from(user).where(eq(user.id, userId));
  if (!person) throw new HttpError(404, "No user");
  return { id: person.id, name: person.name, email: person.email, image: person.image };
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
  authed.post(
    "/workspaces",
    handle(async (c) => {
      const person = await personFor(db, c.get("userId"));
      const body = await c.req.json<{ name?: string }>();
      const ws = await createWorkspace(db, person, body.name ?? "");
      return c.json({ workspace: await toPublicWorkspace(ws) });
    }),
  );

  authed.post(
    "/workspaces/:id/select",
    handle(async (c) => {
      const workspaceId = await selectWorkspace(db, c.get("userId"), routeParam(c, "id"));
      return c.json({ activeWorkspaceId: workspaceId });
    }),
  );

  authed.patch(
    "/workspaces/:id",
    handle(async (c) => {
      const userId = c.get("userId");
      const workspaceId = routeParam(c, "id");
      await requireWorkspaceAdmin(db, workspaceId, userId);
      const body = await c.req.json<{
        name?: string;
        iconColor?: string;
        iconLetter?: string;
        iconKey?: string | null;
      }>();
      const [ws] = await db.select().from(workspace).where(eq(workspace.id, workspaceId));
      if (!ws) throw new HttpError(404, "Not found");
      const name = body.name?.trim() || ws.name;
      const iconLetter =
        body.iconLetter?.trim().slice(0, 2).toUpperCase() ||
        (body.name?.trim() ? body.name.trim()[0]!.toUpperCase() : ws.iconLetter);
      const iconColor = body.iconColor?.trim() || ws.iconColor;
      const iconKey = body.iconKey === undefined ? ws.iconKey : body.iconKey;
      await db
        .update(workspace)
        .set({ name, iconLetter, iconColor, iconKey, updatedAt: new Date() })
        .where(eq(workspace.id, workspaceId));
      const [next] = await db.select().from(workspace).where(eq(workspace.id, workspaceId));
      if (!next) throw new HttpError(404, "Not found");
      const payload = await toPublicWorkspace(next);
      hub.broadcastToWorkspace(workspaceId, { type: "workspace.updated", workspace: payload });
      return c.json({ workspace: payload });
    }),
  );

  authed.post(
    "/workspaces/:id/icon",
    handle(async (c) => {
      const userId = c.get("userId");
      const workspaceId = routeParam(c, "id");
      await requireWorkspaceAdmin(db, workspaceId, userId);
      const file = await readImage(c);
      if ("error" in file) return c.json({ error: file.error }, file.status);
      const key = workspaceIconObjectKey(workspaceId, file.file.name);
      await storage().upload(key, file.buf, { contentType: file.file.type || "image/png" });
      await db.update(workspace).set({ iconKey: key, updatedAt: new Date() }).where(eq(workspace.id, workspaceId));
      const [next] = await db.select().from(workspace).where(eq(workspace.id, workspaceId));
      if (!next) throw new HttpError(404, "Not found");
      const payload = await toPublicWorkspace(next);
      hub.broadcastToWorkspace(workspaceId, { type: "workspace.updated", workspace: payload });
      return c.json({ workspace: payload });
    }),
  );

  authed.post(
    "/me/photo",
    handle(async (c) => {
      const userId = c.get("userId");
      const file = await readImage(c);
      if ("error" in file) return c.json({ error: file.error }, file.status);
      const key = avatarObjectKey(userId, file.file.name);
      await storage().upload(key, file.buf, { contentType: file.file.type || "image/png" });
      await db.update(user).set({ image: key, updatedAt: new Date() }).where(eq(user.id, userId));
      const image = await publicFileUrl(key);
      const memberships = await db
        .select()
        .from(workspaceMember)
        .where(and(eq(workspaceMember.userId, userId), isNull(workspaceMember.leftAt)));
      for (const mem of memberships) {
        const members = await getMembers(db, mem.workspaceId);
        const member = members.find((m) => m.userId === userId);
        if (member) hub.broadcastToWorkspace(mem.workspaceId, { type: "member.updated", workspaceId: mem.workspaceId, member });
      }
      return c.json({ image });
    }),
  );

  authed.patch(
    "/me",
    handle(async (c) => {
      const userId = c.get("userId");
      const body = await c.req.json<{
        displayName?: string;
        title?: string | null;
        statusText?: string | null;
        statusEmoji?: string | null;
        presence?: "active" | "away" | "dnd" | "offline";
        activeWorkspaceId?: string;
      }>();
      if (body.activeWorkspaceId) {
        await selectWorkspace(db, userId, body.activeWorkspaceId);
      }
      const workspaceId = await requestedWorkspace(c, db, userId);
      const [mem] = await db
        .select()
        .from(workspaceMember)
        .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)))
        .limit(1);
      if (!mem) throw new HttpError(404, "No workspace");
      await db
        .update(workspaceMember)
        .set({
          displayName: body.displayName?.trim() || mem.displayName,
          title: body.title === undefined ? mem.title : body.title,
          statusText: body.statusText === undefined ? mem.statusText : body.statusText,
          statusEmoji: body.statusEmoji === undefined ? mem.statusEmoji : body.statusEmoji,
          presence: body.presence ?? mem.presence,
          updatedAt: new Date(),
        })
        .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)));
      if (body.presence) {
        hub.broadcastToWorkspace(workspaceId, {
          type: "presence",
          workspaceId,
          userId,
          presence: body.presence,
        });
      }
      const members = await getMembers(db, workspaceId);
      const member = members.find((m) => m.userId === userId);
      if (member) hub.broadcastToWorkspace(workspaceId, { type: "member.updated", workspaceId, member });
      return c.json({ ok: true });
    }),
  );

  authed.post(
    "/channels",
    handle(async (c) => {
      const userId = c.get("userId");
      const body = await c.req.json<{ name: string; topic?: string; isPrivate?: boolean; workspaceId?: string }>();
      const workspaceId = body.workspaceId ?? (await requestedWorkspace(c, db, userId));
      const payload = await createNamedChannel(db, {
        workspaceId,
        userId,
        name: body.name,
        topic: body.topic,
        isPrivate: body.isPrivate,
      });
      hub.broadcastToWorkspace(workspaceId, { type: "channel.created", channel: payload, workspaceId });
      return c.json({ channel: payload });
    }),
  );

  authed.post(
    "/dms",
    handle(async (c) => {
      const userId = c.get("userId");
      const body = await c.req.json<{ userId: string; workspaceId?: string }>();
      const workspaceId = body.workspaceId ?? (await requestedWorkspace(c, db, userId));
      const payload = await openDm(db, workspaceId, userId, body.userId);
      hub.broadcastToUser(userId, { type: "channel.created", channel: payload, workspaceId });
      const other = await openDm(db, workspaceId, body.userId, userId);
      hub.broadcastToUser(body.userId, { type: "channel.created", channel: other, workspaceId });
      return c.json({ channel: payload });
    }),
  );

  authed.post(
    "/channels/:id/star",
    handle(async (c) => {
      const userId = c.get("userId");
      const channelId = routeParam(c, "id");
      const access = await requireChannelMember(db, channelId, userId);
      const next = !access.membership.isStarred;
      await db
        .update(channelMember)
        .set({ isStarred: next })
        .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId)));
      return c.json({ isStarred: next });
    }),
  );

  authed.patch(
    "/messages/:id",
    handle(async (c) => {
      const userId = c.get("userId");
      const { body } = await c.req.json<{ body: string }>();
      const access = await requireMessageAccess(db, routeParam(c, "id"), userId);
      if (access.message.authorUserId !== userId) throw new HttpError(403, "Forbidden");
      if (access.message.deletedAt) throw new HttpError(400, "Message was deleted");
      await db
        .update(message)
        .set({ body: body.trim(), updatedAt: new Date() })
        .where(eq(message.id, access.message.id));
      const [fresh] = await db.select().from(message).where(eq(message.id, access.message.id));
      const [hydrated] = await hydrateMessages(db, [fresh]);
      hub.broadcastToChannel(access.channel.id, { type: "message.updated", message: hydrated });
      return c.json({ message: hydrated });
    }),
  );

  authed.delete(
    "/messages/:id",
    handle(async (c) => {
      const userId = c.get("userId");
      const access = await requireMessageAccess(db, routeParam(c, "id"), userId);
      if (access.message.authorUserId !== userId) throw new HttpError(403, "Forbidden");
      await db
        .update(message)
        .set({ deletedAt: new Date(), deletedBy: userId, updatedAt: new Date() })
        .where(eq(message.id, access.message.id));
      const [fresh] = await db.select().from(message).where(eq(message.id, access.message.id));
      const [hydrated] = await hydrateMessages(db, [fresh]);
      hub.broadcastToChannel(access.channel.id, { type: "message.updated", message: hydrated });
      hub.broadcastToChannel(access.channel.id, {
        type: "message.deleted",
        messageId: access.message.id,
        channelId: access.channel.id,
        parentId: access.message.parentId,
      });
      return c.json({ ok: true, message: hydrated });
    }),
  );

  authed.post(
    "/messages/:id/later",
    handle(async (c) => {
      const userId = c.get("userId");
      const messageId = routeParam(c, "id");
      await requireMessageAccess(db, messageId, userId);
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
    }),
  );

  authed.get(
    "/later",
    handle(async (c) => {
      const userId = c.get("userId");
      const workspaceId = await requestedWorkspace(c, db, userId);
      const rows = await db
        .select()
        .from(savedItem)
        .where(eq(savedItem.userId, userId))
        .orderBy(desc(savedItem.createdAt));
      if (!rows.length) return c.json({ items: [] });
      const msgs = await db
        .select()
        .from(message)
        .where(and(inArray(message.id, rows.map((r) => r.messageId)), eq(message.workspaceId, workspaceId)));
      const hydrated = await hydrateMessages(db, msgs);
      const byId = new Map(hydrated.map((m) => [m.id, m]));
      return c.json({
        items: rows
          .map((r) => byId.get(r.messageId))
          .filter(Boolean)
          .map((m) => ({ ...m!, savedAt: true })),
      });
    }),
  );

  authed.get(
    "/files",
    handle(async (c) => {
      const userId = c.get("userId");
      const workspaceId = await requestedWorkspace(c, db, userId);
      const hydrated = await listFileMessages(db, userId, workspaceId);
      const chans = await loadWorkspaceChannels(db, workspaceId, userId);
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
    }),
  );

  authed.get(
    "/activity",
    handle(async (c) => {
      const userId = c.get("userId");
      const workspaceId = await requestedWorkspace(c, db, userId);
      const names = await mentionMap(db, workspaceId);
      const myNames = [...names.entries()].filter(([, id]) => id === userId).map(([n]) => n);
      const memberships = await db
        .select()
        .from(channelMember)
        .where(and(eq(channelMember.workspaceId, workspaceId), eq(channelMember.userId, userId), isNull(channelMember.leftAt)));
      const ids = memberships.map((m) => m.channelId);
      if (!ids.length) return c.json({ items: [] });
      const rows = await db
        .select()
        .from(message)
        .where(and(inArray(message.channelId, ids), eq(message.workspaceId, workspaceId), isNull(message.deletedAt)))
        .orderBy(desc(message.createdAt))
        .limit(200);
      const messages = await hydrateMessages(db, rows);
      const chans = await loadWorkspaceChannels(db, workspaceId, userId);
      const chNames = new Map(chans.map((ch) => [ch.id, ch.name]));
      const items = [];
      for (const m of messages) {
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
    }),
  );

  authed.get(
    "/search",
    handle(async (c) => {
      const userId = c.get("userId");
      const q = (c.req.query("q") ?? "").trim();
      if (!q) return c.json({ hits: [] });
      const workspaceId = await requestedWorkspace(c, db, userId);
      const chans = await loadWorkspaceChannels(db, workspaceId, userId);
      const members = await getMembers(db, workspaceId);
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
          .filter(
            (m) =>
              m.name.toLowerCase().includes(q.toLowerCase()) || m.displayName.toLowerCase().includes(q.toLowerCase()),
          )
          .map((m) => ({
            kind: "member" as const,
            id: m.userId,
            title: m.displayName,
            userId: m.userId,
          })),
      ];
      const hydrated = await searchMessages(db, userId, workspaceId, q, 20);
      for (const m of hydrated) {
        hits.push({
          kind: "message",
          id: m.id,
          title: m.userName,
          snippet: m.body.slice(0, 140),
          channelId: m.channelId,
        });
      }
      return c.json({ hits: hits.slice(0, 40) });
    }),
  );

  authed.get(
    "/invites/inbox",
    handle(async (c) => {
      const person = await personFor(db, c.get("userId"));
      return c.json({ invites: await listPendingInvitesForEmail(db, person.email, person.id) });
    }),
  );

  authed.get(
    "/invites",
    handle(async (c) => {
      const userId = c.get("userId");
      const workspaceId = await requestedWorkspace(c, db, userId);
      await requireWorkspaceMember(db, workspaceId, userId);
      const rows = await db
        .select()
        .from(invite)
        .where(and(eq(invite.workspaceId, workspaceId), eq(invite.status, "pending")))
        .orderBy(desc(invite.createdAt));
      return c.json({
        invites: rows.map((r) => ({
          id: r.id,
          workspaceId: r.workspaceId,
          email: r.email,
          invitedBy: r.invitedBy ?? "",
          token: r.token,
          status: r.status,
          url: inviteLink(r.token),
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }),
  );

  authed.post(
    "/invites",
    handle(async (c) => {
      const userId = c.get("userId");
      const { email, workspaceId } = await c.req.json<{ email: string; workspaceId?: string }>();
      const wsId = workspaceId ?? (await requestedWorkspace(c, db, userId));
      await requireWorkspaceMember(db, wsId, userId);
      const created = await createInvite(db, wsId, userId, email);
      return c.json({ invite: created });
    }),
  );

  authed.post(
    "/invites/accept",
    handle(async (c) => {
      const userId = c.get("userId");
      const { token, inviteId } = await c.req.json<{ token?: string; inviteId?: string }>();
      const person = await personFor(db, userId);
      const ws = await acceptInvite(db, person, { token, inviteId });
      const members = await getMembers(db, ws.id);
      const joined = members.find((m) => m.userId === userId);
      if (joined) hub.broadcastToWorkspace(ws.id, { type: "member.joined", workspaceId: ws.id, member: joined });
      return c.json({ workspace: await toPublicWorkspace(ws) });
    }),
  );

  authed.get(
    "/threads",
    handle(async (c) => {
      const userId = c.get("userId");
      const workspaceId = await requestedWorkspace(c, db, userId);
      const memberships = await db
        .select()
        .from(channelMember)
        .where(and(eq(channelMember.workspaceId, workspaceId), eq(channelMember.userId, userId), isNull(channelMember.leftAt)));
      const ids = memberships.map((m) => m.channelId);
      if (!ids.length) return c.json({ items: [] });
      const parents = await db
        .select()
        .from(message)
        .where(and(inArray(message.channelId, ids), eq(message.workspaceId, workspaceId), isNull(message.parentId), isNull(message.deletedAt)))
        .orderBy(desc(message.createdAt))
        .limit(300);
      const hydrated = await hydrateMessages(db, parents);
      return c.json({ items: hydrated.filter((m) => m.replyCount > 0).slice(0, 40) });
    }),
  );
}
