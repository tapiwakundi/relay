import { and, asc, eq } from "drizzle-orm";
import { channel, channelMember, invite, user, workspace, workspaceMember } from "./db/schema.js";
import type { AppDb } from "./queries.js";

export type AuthPerson = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export async function provisionAuthedUser(db: AppDb, person: AuthPerson) {
  const image = person.image ? normalizePhoto(person.image) : person.image;
  const stored = await upsertUser(db, { ...person, image });

  const [membership] = await db
    .select()
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, person.id))
    .limit(1);
    if (membership) return stored;

  if (person.email) {
    const [pending] = await db
      .select()
      .from(invite)
      .where(and(eq(invite.email, person.email.toLowerCase()), eq(invite.status, "pending")))
      .orderBy(asc(invite.createdAt))
      .limit(1);
    if (pending) {
      await joinWorkspace(db, pending.workspaceId, person);
      await db.update(invite).set({ status: "accepted" }).where(eq(invite.id, pending.id));
    }
  }
  return stored;
}

async function upsertUser(db: AppDb, person: AuthPerson) {
  const [byId] = await db.select().from(user).where(eq(user.id, person.id)).limit(1);
  if (byId) {
    const image = isStoredUpload(byId.image) ? byId.image : (person.image ?? byId.image);
    await db
      .update(user)
      .set({
        name: person.name,
        image,
        updatedAt: new Date(),
      })
      .where(eq(user.id, person.id));
    return { image };
  }

  const email =
    person.email && !(await emailTaken(db, person.email))
      ? person.email
      : `${person.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18)}@relay.users`;

  await db.insert(user).values({
    id: person.id,
    name: person.name,
    email,
    emailVerified: Boolean(person.email),
    image: person.image,
  });
  return { image: person.image };
}

async function emailTaken(db: AppDb, email: string) {
  const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  return Boolean(row);
}

export async function createWorkspace(db: AppDb, person: AuthPerson, name: string) {
  const trimmed = name.trim();
  const first = person.name.split(" ")[0] || trimmed || "Relay";
  const wsId = crypto.randomUUID();
  const generalId = crypto.randomUUID();
  const letter = (trimmed[0] || first[0] || "R").toUpperCase();
  await db.insert(workspace).values({
    id: wsId,
    name: trimmed,
    slug: slugify(trimmed),
    iconColor: colorFor(trimmed),
    iconLetter: letter,
    plan: "Pro",
    createdBy: person.id,
  });
  await db.insert(workspaceMember).values({
    workspaceId: wsId,
    userId: person.id,
    role: "owner",
    displayName: first,
    title: null,
    presence: "active",
  });
  await db.insert(channel).values({
    id: generalId,
    workspaceId: wsId,
    name: "general",
    topic: null,
    description: "Workspace-wide conversation",
    createdBy: person.id,
  });
  await db.insert(channelMember).values({
    channelId: generalId,
    userId: person.id,
  });
  const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
  return ws;
}

function colorFor(name: string) {
  const colors = ["#4A154B", "#1264A3", "#007A5A", "#E01E5A", "#3F0E40", "#1164A3"];
  let h = 0;
  for (const c of name) h = (h + c.charCodeAt(0)) % colors.length;
  return colors[h] ?? "#4A154B";
}

export async function joinWorkspace(db: AppDb, workspaceId: string, person: AuthPerson) {
  const first = person.name.split(" ")[0] || person.name;
  await db.insert(workspaceMember).values({
    workspaceId,
    userId: person.id,
    role: "member",
    displayName: first,
    title: null,
    presence: "active",
  });
  const channels = await db.select().from(channel).where(eq(channel.workspaceId, workspaceId));
  for (const c of channels) {
    if (c.isDm) continue;
    await db.insert(channelMember).values({
      channelId: c.id,
      userId: person.id,
    });
  }
}

function isStoredUpload(image: string | null) {
  return Boolean(image && !/^https?:\/\//i.test(image));
}

function normalizePhoto(url: string) {
  return url.replace(/=s\d+-c(?=$|[/?#])/, "=s128-c");
}

function slugify(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "ws";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
