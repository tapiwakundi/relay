import { defineConfig } from "drizzle-kit";

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(appDir, ".env") });
config({ path: resolve(appDir, ".env.local"), override: true });

const raw =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL ??
  "postgres://localhost:5432/relay";
const url = new URL(raw);
url.searchParams.delete("channel_binding");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: url.toString(),
  },
});
