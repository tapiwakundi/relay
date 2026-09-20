import { eq } from "drizzle-orm";
import { user } from "./db/schema.js";
import type { AppDb } from "./db/index.js";
import type { AuthPerson } from "./domain.js";
import { isHttpUrl } from "./storage.js";

export type { AuthPerson };

export async function provisionAuthedUser(db: AppDb, person: AuthPerson) {
  const image = person.image ? normalizePhoto(person.image) : person.image;
  return upsertUser(db, { ...person, image });
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

function isStoredUpload(image: string | null) {
  return Boolean(image && !isHttpUrl(image));
}

function normalizePhoto(url: string) {
  return url.replace(/=s\d+-c(?=$|[/?#])/, "=s128-c");
}
