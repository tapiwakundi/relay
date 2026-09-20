import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

function postgresUrl(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.delete("channel_binding");
  return parsed.toString();
}

export type AppDb = ReturnType<typeof drizzlePg<typeof schema>>;

export async function createDb() {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error("DATABASE_URL is required; local database fallback is disabled.");
  }

  const client = postgres(postgresUrl(url), { prepare: false, max: 10 });
  const db = drizzlePg(client, { schema });
  return { db, dialect: "neon" as const, client };
}
