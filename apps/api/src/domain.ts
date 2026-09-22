import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { slugChannelName, type Channel, type ChannelDetails, type InboxInvite } from "@relay/shared";
import { HttpError, requireChannelMember, requireWorkspaceMember, setActiveWorkspace } from "./access.js";
import type { AppDb } from "./db/index.js";
import {
  channel,
  channelMember,
  deviceToken,
  invite,
  user,
  workspace,
  workspaceMember,
} from "./db/schema.js";
import { isUniqueViolation } from "./errors.js";
import { getMembers, hydrateHuddle, toChannel, toPublicWorkspace } from "./queries.js";

export type AuthPerson = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export function pairKey(ids: string[]) {
  return [...ids].sort().join(":");
}

function colorFor(name: string) {
  const colors = ["#1A5FB4", "#1264A3", "#007A5A", "#E01E5A", "#0E3C74", "#1164A3"];
  let h = 0;
  for (const c of name) h = (h + c.charCodeAt(0)) % colors.length;
  return colors[h] ?? "#1A5FB4";
}

export function slugify(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "ws";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export function inviteLink(token: string) {
  return `relay://invite?invite=${encodeURIComponent(token)}`;
}

export function inviteExpiry(from = new Date()) {
  return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
}

async function upsertWorkspaceMember(
  db: AppDb,
  values: typeof workspaceMember.$inferInsert,
) {
  await db
    .insert(workspaceMember)
    .values(values)
    .onConflictDoUpdate({
      target: [workspaceMember.workspaceId, workspaceMember.userId],
      set: {
        role: values.role,
        displayName: values.displayName,
        presence: values.presence ?? "active",
        leftAt: null,
        updatedAt: new Date(),
      },
    });
}

async function joinWorkspaceOn(db: AppDb, workspaceId: string, person: AuthPerson) {
  const first = person.name.split(" ")[0] || person.name;
  await upsertWorkspaceMember(db, {
    workspaceId,
    userId: person.id,
    role: "member",
    displayName: first,
    title: null,
    presence: "active",
  });
  const channels = await db
    .select()
    .from(channel)
    .where(and(eq(channel.workspaceId, workspaceId), isNull(channel.deletedAt), eq(channel.kind, "public")));
  if (channels.length) {
    await db
      .insert(channelMember)
      .values(
        channels.map((c) => ({
          channelId: c.id,
          workspaceId,
          userId: person.id,
        })),
      )
      .onConflictDoUpdate({
        target: [channelMember.channelId, channelMember.userId],
        set: { leftAt: null },
      });
  }
  await setActiveWorkspace(db, person.id, workspaceId);
}

export async function createWorkspace(db: AppDb, person: AuthPerson, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new HttpError(400, "Name your workspace");
  const first = person.name.split(" ")[0] || trimmed || "Relay";
  const wsId = crypto.randomUUID();
  const generalId = crypto.randomUUID();
  const letter = (trimmed[0] || first[0] || "R").toUpperCase();

  await db.transaction(async (tx) => {
    const conn = tx as unknown as AppDb;
    await tx.insert(workspace).values({
      id: wsId,
      name: trimmed,
      slug: slugify(trimmed),
      iconColor: colorFor(trimmed),
      iconLetter: letter,
      plan: "Pro",
      createdBy: person.id,
    });
    await upsertWorkspaceMember(conn, {
      workspaceId: wsId,
      userId: person.id,
      role: "owner",
      displayName: first,
      title: null,
      presence: "active",
    });
    await tx.insert(channel).values({
      id: generalId,
      workspaceId: wsId,
      kind: "public",
      name: "general",
      topic: null,
      description: "Workspace-wide conversation",
      createdBy: person.id,
    });
    await tx.insert(channelMember).values({
      channelId: generalId,
      workspaceId: wsId,
      userId: person.id,
    });
    await setActiveWorkspace(conn, person.id, wsId);
  });

  const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
  if (!ws) throw new HttpError(400, "Couldn’t create workspace");
  return ws;
}

export async function joinWorkspace(db: AppDb, workspaceId: string, person: AuthPerson) {
  await db.transaction(async (tx) => {
    await joinWorkspaceOn(tx as unknown as AppDb, workspaceId, person);
  });
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function listPendingInvitesForEmail(
  db: AppDb,
  email: string,
  userId: string,
): Promise<InboxInvite[]> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return [];
  await db
    .update(invite)
    .set({ status: "expired" })
    .where(and(eq(invite.email, normalized), eq(invite.status, "pending"), lt(invite.expiresAt, new Date())));

  const rows = await db
    .select({
      invite,
      workspace,
      invitedByName: user.name,
      memberUserId: workspaceMember.userId,
    })
    .from(invite)
    .innerJoin(workspace, eq(workspace.id, invite.workspaceId))
    .leftJoin(user, eq(user.id, invite.invitedBy))
    .leftJoin(
      workspaceMember,
      and(
        eq(workspaceMember.workspaceId, invite.workspaceId),
        eq(workspaceMember.userId, userId),
        isNull(workspaceMember.leftAt),
      ),
    )
    .where(and(eq(invite.email, normalized), eq(invite.status, "pending"), isNull(workspace.deletedAt)))
    .orderBy(desc(invite.createdAt));

  return Promise.all(
    rows
      .filter((row) => !row.memberUserId)
      .map(async (row) => ({
        id: row.invite.id,
        workspace: await toPublicWorkspace(row.workspace),
        invitedByName: row.invitedByName ?? null,
        createdAt: row.invite.createdAt.toISOString(),
      })),
  );
}

export async function acceptInvite(
  db: AppDb,
  person: AuthPerson,
  claim: { token?: string; inviteId?: string },
) {
  const token = claim.token?.trim();
  const inviteId = claim.inviteId?.trim();
  if (!token && !inviteId) throw new HttpError(400, "Invite is not valid");
  return db.transaction(async (tx) => {
    const conn = tx as unknown as AppDb;
    const [row] = token
      ? await tx.select().from(invite).where(eq(invite.token, token)).limit(1)
      : await tx.select().from(invite).where(eq(invite.id, inviteId!)).limit(1);
    if (!row || row.status !== "pending") throw new HttpError(400, "Invite is not valid");
    if (row.expiresAt.getTime() < Date.now()) {
      await tx.update(invite).set({ status: "expired" }).where(eq(invite.id, row.id));
      throw new HttpError(400, "Invite has expired");
    }
    if (normalizeEmail(row.email) !== normalizeEmail(person.email)) {
      throw new HttpError(403, "This invite is for a different email");
    }
    await joinWorkspaceOn(conn, row.workspaceId, person);
    const [claimed] = await tx
      .update(invite)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedBy: person.id,
      })
      .where(and(eq(invite.id, row.id), eq(invite.status, "pending")))
      .returning();
    if (!claimed) throw new HttpError(409, "Invite is not valid");
    const [ws] = await tx.select().from(workspace).where(eq(workspace.id, row.workspaceId));
    if (!ws || ws.deletedAt) throw new HttpError(404, "Workspace missing");
    return ws;
  });
}

export async function createNamedChannel(
  db: AppDb,
  opts: { workspaceId: string; userId: string; name: string; topic?: string; isPrivate?: boolean },
) {
  const name = slugChannelName(opts.name);
  if (!name) throw new HttpError(400, "Name required");
  await requireWorkspaceMember(db, opts.workspaceId, opts.userId);
  const kind = opts.isPrivate ? "private" : "public";
  const id = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(channel).values({
        id,
        workspaceId: opts.workspaceId,
        kind,
        name,
        topic: opts.topic?.trim() || null,
        createdBy: opts.userId,
      });
      if (kind === "private") {
        await tx.insert(channelMember).values({
          channelId: id,
          workspaceId: opts.workspaceId,
          userId: opts.userId,
        });
      } else {
        const members = await tx
          .select()
          .from(workspaceMember)
          .where(and(eq(workspaceMember.workspaceId, opts.workspaceId), isNull(workspaceMember.leftAt)));
        if (members.length) {
          await tx.insert(channelMember).values(
            members.map((m) => ({
              channelId: id,
              workspaceId: opts.workspaceId,
              userId: m.userId,
            })),
          );
        }
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "Channel already exists");
    throw err;
  }

  return loadChannelForUser(db, id, opts.userId);
}

export async function openDm(db: AppDb, workspaceId: string, userId: string, otherId: string) {
  if (!otherId || otherId === userId) throw new HttpError(400, "Pick a teammate");
  await requireWorkspaceMember(db, workspaceId, userId);
  await requireWorkspaceMember(db, workspaceId, otherId);
  const dmKey = pairKey([userId, otherId]);

  const [existing] = await db
    .select()
    .from(channel)
    .where(and(eq(channel.workspaceId, workspaceId), eq(channel.kind, "dm"), eq(channel.dmKey, dmKey), isNull(channel.deletedAt)))
    .limit(1);
  if (existing) return loadChannelForUser(db, existing.id, userId);

  const id = crypto.randomUUID();
  const [other] = await db.select().from(user).where(eq(user.id, otherId)).limit(1);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(channel).values({
        id,
        workspaceId,
        kind: "dm",
        name: other?.name ?? "dm",
        dmKey,
        createdBy: userId,
      });
      await tx.insert(channelMember).values([
        { channelId: id, workspaceId, userId },
        { channelId: id, workspaceId, userId: otherId },
      ]);
    });
    return loadChannelForUser(db, id, userId);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const [again] = await db
      .select()
      .from(channel)
      .where(and(eq(channel.workspaceId, workspaceId), eq(channel.kind, "dm"), eq(channel.dmKey, dmKey), isNull(channel.deletedAt)))
      .limit(1);
    if (!again) throw err;
    return loadChannelForUser(db, again.id, userId);
  }
}

export async function loadChannelForUser(db: AppDb, channelId: string, userId: string): Promise<Channel> {
  const [ch] = await db.select().from(channel).where(eq(channel.id, channelId)).limit(1);
  if (!ch || ch.deletedAt) throw new HttpError(404, "Not found");
  const [membership] = await db
    .select()
    .from(channelMember)
    .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId), isNull(channelMember.leftAt)))
    .limit(1);
  if (!membership) throw new HttpError(403, "Forbidden");
  const people = await getMembers(db, ch.workspaceId);
  const memberRows = await db
    .select()
    .from(channelMember)
    .where(and(eq(channelMember.channelId, channelId), isNull(channelMember.leftAt)));
  const huddleState = await hydrateHuddle(db, channelId);
  return toChannel(
    ch,
    membership,
    people,
    userId,
    huddleState,
    memberRows.length,
    memberRows.map((m) => m.userId),
  );
}

export async function getChannelDetails(db: AppDb, channelId: string, userId: string): Promise<ChannelDetails> {
  const view = await loadChannelForUser(db, channelId, userId);
  const [row] = await db
    .select({ createdAt: channel.createdAt, createdBy: channel.createdBy, workspaceId: channel.workspaceId })
    .from(channel)
    .where(eq(channel.id, channelId))
    .limit(1);
  if (!row) throw new HttpError(404, "Not found");
  const people = await getMembers(db, row.workspaceId);
  const memberRows = await db
    .select({ userId: channelMember.userId })
    .from(channelMember)
    .where(and(eq(channelMember.channelId, channelId), isNull(channelMember.leftAt)));
  const creator = row.createdBy ? people.find((m) => m.userId === row.createdBy) : undefined;
  return {
    channel: view,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy
      ? { userId: row.createdBy, name: creator?.displayName || creator?.name || "Someone" }
      : null,
    memberIds: memberRows.map((m) => m.userId),
  };
}

export async function updateChannel(
  db: AppDb,
  channelId: string,
  userId: string,
  patch: { name?: string; topic?: string | null; description?: string | null },
) {
  const access = await requireChannelMember(db, channelId, userId);
  if ((access.channel.kind === "dm" || access.channel.kind === "mpim") && patch.name !== undefined) {
    throw new HttpError(400, "You can't rename this conversation");
  }
  const next: { name?: string; topic?: string | null; description?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (patch.name !== undefined) {
    const name = slugChannelName(patch.name);
    if (!name) throw new HttpError(400, "Name required");
    next.name = name;
  }
  if (patch.topic !== undefined) next.topic = patch.topic?.trim() || null;
  if (patch.description !== undefined) next.description = patch.description?.trim() || null;
  try {
    await db.update(channel).set(next).where(eq(channel.id, channelId));
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "A channel with that name already exists");
    throw err;
  }
  return getChannelDetails(db, channelId, userId);
}

export async function leaveChannel(db: AppDb, channelId: string, userId: string) {
  const access = await requireChannelMember(db, channelId, userId);
  if (access.channel.kind === "dm") throw new HttpError(400, "You can't leave a direct message");
  await db
    .update(channelMember)
    .set({ leftAt: new Date() })
    .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId)));
  const memberRows = await db
    .select({ userId: channelMember.userId })
    .from(channelMember)
    .where(and(eq(channelMember.channelId, channelId), isNull(channelMember.leftAt)));
  return {
    channelId,
    workspaceId: access.workspaceId,
    name: access.channel.name,
    topic: access.channel.topic,
    description: access.channel.description,
    memberCount: memberRows.length,
  };
}

export async function addChannelMember(db: AppDb, channelId: string, actorId: string, memberUserId: string) {
  const access = await requireChannelMember(db, channelId, actorId);
  if (access.channel.kind === "dm") throw new HttpError(400, "This conversation has a fixed set of people");
  await requireWorkspaceMember(db, access.workspaceId, memberUserId);
  await db
    .insert(channelMember)
    .values({ channelId, workspaceId: access.workspaceId, userId: memberUserId })
    .onConflictDoUpdate({
      target: [channelMember.channelId, channelMember.userId],
      set: { leftAt: null },
    });
  const [forMember, details] = await Promise.all([
    loadChannelForUser(db, channelId, memberUserId),
    getChannelDetails(db, channelId, actorId),
  ]);
  return { forMember, details };
}

export async function toggleChannelMute(db: AppDb, channelId: string, userId: string) {
  const access = await requireChannelMember(db, channelId, userId);
  const next = !access.membership.isMuted;
  await db
    .update(channelMember)
    .set({ isMuted: next })
    .where(and(eq(channelMember.channelId, channelId), eq(channelMember.userId, userId)));
  return loadChannelForUser(db, channelId, userId);
}

export async function createInvite(db: AppDb, workspaceId: string, invitedBy: string, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) throw new HttpError(400, "Valid email required");
  const token = crypto.randomUUID().replaceAll("-", "");
  const id = crypto.randomUUID();
  const expiresAt = inviteExpiry();
  try {
    await db.insert(invite).values({
      id,
      workspaceId,
      email: normalized,
      invitedBy,
      token,
      status: "pending",
      expiresAt,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "That email already has a pending invite");
    throw err;
  }
  return {
    id,
    workspaceId,
    email: normalized,
    invitedBy,
    token,
    status: "pending" as const,
    url: inviteLink(token),
    createdAt: new Date().toISOString(),
  };
}

export async function registerDeviceToken(
  db: AppDb,
  opts: { userId: string; token: string; platform: string },
) {
  const platform = normalizePlatform(opts.platform);
  const token = opts.token.trim();
  if (!token) throw new HttpError(400, "Token required");
  await db
    .insert(deviceToken)
    .values({
      userId: opts.userId,
      token,
      platform,
      updatedAt: new Date(),
      lastUsedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [deviceToken.userId, deviceToken.token],
      set: { platform, updatedAt: new Date(), lastUsedAt: new Date() },
    });
}

export async function unregisterDeviceToken(
  db: AppDb,
  opts: { userId: string; token: string },
) {
  const token = opts.token.trim();
  if (!token) throw new HttpError(400, "Token required");
  await db
    .delete(deviceToken)
    .where(and(eq(deviceToken.userId, opts.userId), eq(deviceToken.token, token)));
}

export async function removeDeviceTokens(db: AppDb, tokens: string[]) {
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  if (!unique.length) return;
  await db.delete(deviceToken).where(inArray(deviceToken.token, unique));
}

function normalizePlatform(value: string): "ios" | "android" | "desktop" | "web" {
  if (value === "ios" || value === "android" || value === "desktop" || value === "web") return value;
  if (value === "macos" || value === "windows" || value === "linux") return "desktop";
  return "web";
}

export async function selectWorkspace(db: AppDb, userId: string, workspaceId: string) {
  await requireWorkspaceMember(db, workspaceId, userId);
  await setActiveWorkspace(db, userId, workspaceId);
  return workspaceId;
}
