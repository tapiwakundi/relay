import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/better-auth.js";
import { createDb, type AppDb } from "../src/db/index.js";
import { Hub } from "../src/hub.js";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(appDir, ".env") });
config({ path: resolve(appDir, ".env.local"), override: true });

const origin = "http://localhost:3001";

describe.skipIf(!process.env.DATABASE_URL)("better auth smoke", () => {
  let db: AppDb;
  let client: { end: (opts?: { timeout?: number }) => Promise<void> };
  let fetchApp: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  const cookies: string[] = [];
  const email = `smoke-${Date.now()}@relay.test`;
  const password = "SmokeTest123!";

  beforeAll(async () => {
    const created = await createDb();
    db = created.db;
    client = created.client;
    const app = createApp({ db, hub: new Hub(), auth: createAuth(db) });
    fetchApp = app.fetch;
  }, 30_000);

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  async function call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    if (cookies.length) {
      headers.set("cookie", cookies.map((c) => c.split(";")[0]).join("; "));
    }
    const res = await fetchApp(new Request(`${origin}${path}`, { ...init, headers }));
    for (const cookie of res.headers.getSetCookie?.() ?? []) cookies.push(cookie);
    return res;
  }

  it("signs up with email/password, selects a workspace, and starts Google OAuth", async () => {
    const signup = await call("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "Smoke User" }),
    });
    expect(signup.ok, await signup.text()).toBe(true);

    const signin = await call("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(signin.ok, await signin.text()).toBe(true);

    const me = await call("/api/me");
    const meBody = (await me.json()) as { user?: { email?: string }; workspaces?: unknown[] };
    expect(me.ok).toBe(true);
    expect(meBody.user?.email).toBe(email);
    expect(Array.isArray(meBody.workspaces)).toBe(true);

    const created = await call("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Smoke Workspace" }),
    });
    const createdBody = (await created.json()) as { workspace?: { id?: string } };
    expect(created.ok).toBe(true);
    expect(createdBody.workspace?.id).toBeTruthy();

    const selected = await call(`/api/workspaces/${createdBody.workspace!.id}/select`, { method: "POST" });
    const selectedBody = (await selected.json()) as { activeWorkspaceId?: string };
    expect(selected.ok).toBe(true);
    expect(selectedBody.activeWorkspaceId).toBe(createdBody.workspace!.id);

    const google = await call("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: `${origin}/` }),
    });
    const googleBody = (await google.json()) as { url?: string };
    expect(google.ok).toBe(true);
    expect(googleBody.url).toContain("accounts.google.com");
  });
});
