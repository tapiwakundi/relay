import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import * as schema from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function postgresUrl(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.delete("channel_binding");
  return parsed.toString();
}

export async function createDb() {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const client = postgres(postgresUrl(url), { prepare: false, max: 10 });
    const db = drizzlePg(client, { schema });
    return { db, dialect: "neon" as const };
  }

  const dataDir = resolve(__dirname, "../../data/pglite");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await ensureLocalTables(client);
  const db = drizzlePglite({ client, schema });
  return { db, dialect: "pglite" as const };
}

async function ensureLocalTables(client: PGlite) {
  await client.exec(`
      CREATE TABLE IF NOT EXISTS "user" (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        email_verified boolean NOT NULL DEFAULT false,
        image text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS session (
        id text PRIMARY KEY,
        expires_at timestamptz NOT NULL,
        token text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        ip_address text,
        user_agent text,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS account (
        id text PRIMARY KEY,
        account_id text NOT NULL,
        provider_id text NOT NULL,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        access_token text,
        refresh_token text,
        id_token text,
        access_token_expires_at timestamptz,
        refresh_token_expires_at timestamptz,
        scope text,
        password text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS verification (
        id text PRIMARY KEY,
        identifier text NOT NULL,
        value text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS workspace (
        id text PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL UNIQUE,
        icon_color text NOT NULL DEFAULT '#4A154B',
        icon_letter text NOT NULL DEFAULT 'R',
        icon_key text,
        plan text NOT NULL DEFAULT 'Pro',
        created_by text NOT NULL REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS workspace_member (
        workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'member',
        display_name text NOT NULL,
        title text,
        status_text text,
        status_emoji text,
        presence text NOT NULL DEFAULT 'offline',
        joined_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS channel (
        id text PRIMARY KEY,
        workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        name text NOT NULL,
        topic text,
        description text,
        is_private boolean NOT NULL DEFAULT false,
        is_dm boolean NOT NULL DEFAULT false,
        is_mpim boolean NOT NULL DEFAULT false,
        created_by text REFERENCES "user"(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS channel_member (
        channel_id text NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        last_read_at timestamptz,
        is_starred boolean NOT NULL DEFAULT false,
        is_muted boolean NOT NULL DEFAULT false,
        unread_count integer NOT NULL DEFAULT 0,
        mention_count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (channel_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS message (
        id text PRIMARY KEY,
        channel_id text NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
        parent_id text,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        body text NOT NULL DEFAULT '',
        file_key text,
        file_name text,
        file_content_type text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS reaction (
        message_id text NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        emoji text NOT NULL,
        PRIMARY KEY (message_id, user_id, emoji)
      );
      CREATE TABLE IF NOT EXISTS huddle (
        id text PRIMARY KEY,
        channel_id text NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
        started_by text NOT NULL REFERENCES "user"(id),
        livekit_room text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        started_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS huddle_participant (
        huddle_id text NOT NULL REFERENCES huddle(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        muted boolean NOT NULL DEFAULT false,
        camera_on boolean NOT NULL DEFAULT false,
        joined_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (huddle_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS device_token (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        token text NOT NULL UNIQUE,
        platform text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS invite (
        id text PRIMARY KEY,
        workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        email text NOT NULL,
        invited_by text NOT NULL REFERENCES "user"(id),
        token text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS saved_item (
        user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        message_id text NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, message_id)
      );
    `);
  await client.exec(`ALTER TABLE workspace ADD COLUMN IF NOT EXISTS icon_key text`);
}
