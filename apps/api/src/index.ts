import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { createAuth } from "./better-auth.js";
import { createDb } from "./db/index.js";
import { Hub } from "./hub.js";
import { attachSockets } from "./ws.js";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(appDir, ".env") });
config({ path: resolve(appDir, ".env.local"), override: true });

const port = Number(process.env.PORT ?? 3001);

const { db, dialect } = await createDb();
const hub = new Hub();
const auth = createAuth(db);
const app = createApp({ db, hub, auth });

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`Relay API on http://localhost:${port} (${dialect})`);
});

const nodeServer = server as unknown as ReturnType<typeof createServer>;
const wss = new WebSocketServer({ server: nodeServer, path: "/ws" });
attachSockets({ wss, db, hub, auth });
