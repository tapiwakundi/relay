import { and, eq, ne } from "drizzle-orm";
import { user } from "./db/schema.js";
import type { AppDb } from "./db/index.js";
import { normalizeEmail, type AuthPerson } from "./domain.js";
import { isHttpUrl } from "./storage.js";

export type { AuthPerson };

export async function provisionAuthedUser(db: AppDb, person: AuthPerson) {
  const image = person.image ? normalizePhoto(person.image) : person.image;
  return upsertUser(db, { ...person, email: normalizeEmail(person.email), image });
}

async function upsertUser(db: AppDb, person: AuthPerson) {
  const [byId] = await db.select().from(user).where(eq(user.id, person.id)).limit(1);
  if (byId) {
    const image = isStoredUpload(byId.image) ? byId.image : (person.image ?? byId.image);
    const email = await nextEmail(db, byId, person.email);
    await db
      .update(user)
      .set({
        name: person.name,
        email,
        image,
        updatedAt: new Date(),
      })
      .where(eq(user.id, person.id));
    return { image };
  }

  const email =
    person.email && !(await emailTaken(db, person.email, person.id))
      ? person.email
      : placeholderEmail(person.id);

  await db.insert(user).values({
    id: person.id,
    name: person.name,
    email,
    emailVerified: Boolean(person.email),
    image: person.image,
  });
  return { image: person.image };
}

async function nextEmail(db: AppDb, existing: { id: string; email: string }, incoming: string) {
  if (!incoming || incoming === existing.email) return existing.email;
  if (await emailTaken(db, incoming, existing.id)) return existing.email;
  return incoming;
}

async function emailTaken(db: AppDb, email: string, exceptUserId?: string) {
  const [row] = exceptUserId
    ? await db
        .select()
        .from(user)
        .where(and(eq(user.email, email), ne(user.id, exceptUserId)))
        .limit(1)
    : await db.select().from(user).where(eq(user.email, email)).limit(1);
  return Boolean(row);
}

function placeholderEmail(userId: string) {
  return `${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18)}@relay.users`;
}

function isStoredUpload(image: string | null) {
  return Boolean(image && !isHttpUrl(image));
}

function normalizePhoto(url: string) {
  return url.replace(/=s\d+-c(?=$|[/?#])/, "=s128-c");
}
