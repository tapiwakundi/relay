import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import type { Auth } from "../src/better-auth.js";
import { createDb, type AppDb } from "../src/db/index.js";
import { attachment, channel, deviceToken, huddle, message } from "../src/db/schema.js";
import { Hub } from "../src/hub.js";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(appDir, ".env") });
config({ path: resolve(appDir, ".env.local"), override: true });

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

type Person = { id: string; name: string; email: string; image: string | null };

function mockAuth(users: Map<string, Person>): Auth {
  return {
    handler: () => new Response("ok"),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const token = headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const user = users.get(token);
        return user ? { user, session: { id: "s", token } } : null;
      },
    },
  } as unknown as Auth;
}

describe.skipIf(!process.env.DATABASE_URL)("v1 api integration", () => {
  let db: AppDb;
  let client: { end: (opts?: { timeout?: number }) => Promise<void> };
  let fetchApp: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  const users = new Map<string, Person>();
  const alice: Person = {
    id: `alice-${suffix}`,
    name: "Alice Example",
    email: `alice-${suffix}@relay.test`,
    image: null,
  };
  const bob: Person = {
    id: `bob-${suffix}`,
    name: "Bob Example",
    email: `bob-${suffix}@relay.test`,
    image: null,
  };
  const mallory: Person = {
    id: `mallory-${suffix}`,
    name: "Mallory Example",
    email: `mallory-${suffix}@relay.test`,
    image: null,
  };
  users.set("alice", alice);
  users.set("bob", bob);
  users.set("mallory", mallory);

  async function api(token: string, path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return fetchApp(new Request(`http://relay.test${path}`, { ...init, headers }));
  }

  beforeAll(async () => {
    const created = await createDb();
    db = created.db;
    client = created.client;
    const app = createApp({ db, hub: new Hub(), auth: mockAuth(users) });
    fetchApp = app.fetch;
  }, 30_000);

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  it("enforces tenant boundaries, invites, threads, huddles, and device tokens", async () => {
    const meA = await api("alice", "/api/me");
    expect(meA.status).toBe(200);
    const aliceMe = await meA.json();
    expect(aliceMe.workspaces).toEqual([]);

    const wsA = await (
      await api("alice", "/api/workspaces", { method: "POST", body: JSON.stringify({ name: `Alpha ${suffix}` }) })
    ).json();
    const wsB = await (
      await api("bob", "/api/workspaces", { method: "POST", body: JSON.stringify({ name: `Beta ${suffix}` }) })
    ).json();
    const aId = wsA.workspace.id as string;
    const bId = wsB.workspace.id as string;
    expect(aId).toMatch(/^[0-9a-f-]{36}$/i);

    const forbidden = await api("bob", `/api/workspaces/${aId}/bootstrap`);
    expect(forbidden.status).toBe(403);

    const privateCh = await (
      await api("alice", "/api/channels", {
        method: "POST",
        body: JSON.stringify({ name: "secret", isPrivate: true, workspaceId: aId }),
      })
    ).json();

    const invite = await (
      await api("alice", "/api/invites", {
        method: "POST",
        body: JSON.stringify({ email: bob.email, workspaceId: aId }),
      })
    ).json();
    expect(invite.invite.token).toBeTruthy();

    const wrong = await api("mallory", "/api/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token: invite.invite.token }),
    });
    expect(wrong.status).toBe(403);

    const accepted = await api("bob", "/api/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token: invite.invite.token }),
    });
    expect(accepted.status).toBe(200);

    const bobAlpha = await (await api("bob", `/api/workspaces/${aId}/bootstrap`)).json();
    expect(bobAlpha.channels.some((c: { name: string }) => c.name === "secret")).toBe(false);
    expect(bobAlpha.channels.some((c: { name: string }) => c.name === "general")).toBe(true);

    const reused = await api("bob", "/api/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token: invite.invite.token }),
    });
    expect(reused.status).toBe(400);

    const [dm1, dm2] = await Promise.all([
      api("alice", "/api/dms", { method: "POST", body: JSON.stringify({ userId: bob.id, workspaceId: aId }) }),
      api("alice", "/api/dms", { method: "POST", body: JSON.stringify({ userId: bob.id, workspaceId: aId }) }),
    ]);
    const dmA = await dm1.json();
    const dmB = await dm2.json();
    expect(dmA.channel.id).toBe(dmB.channel.id);

    const general = bobAlpha.channels.find((c: { name: string }) => c.name === "general");
    const sent = await (
      await api("alice", `/api/channels/${general.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: `hello @Bob ${suffix}` }),
      })
    ).json();
    expect(sent.message.id).toMatch(/^[0-9a-f-]{36}$/i);

    const nested = await api("bob", `/api/channels/${general.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: "nested", parentId: sent.message.id }),
    });
    expect(nested.status).toBe(200);
    const reply = await nested.json();
    const nested2 = await api("bob", `/api/channels/${general.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: "too deep", parentId: reply.message.id }),
    });
    expect(nested2.status).toBe(400);

    const tombstone = await api("alice", `/api/messages/${sent.message.id}`, { method: "DELETE" });
    expect(tombstone.status).toBe(200);
    const [row] = await db.select().from(message).where(eq(message.id, sent.message.id));
    expect(row.deletedAt).not.toBeNull();

    const [h1, h2] = await Promise.all([
      api("alice", `/api/channels/${general.id}/huddle/join`, { method: "POST" }),
      api("bob", `/api/channels/${general.id}/huddle/join`, { method: "POST" }),
    ]);
    const huddleA = await h1.json();
    const huddleB = await h2.json();
    expect(huddleA.huddle.id).toBe(huddleB.huddle.id);
    const open = await db.select().from(huddle).where(eq(huddle.channelId, general.id));
    expect(open.filter((h) => !h.endedAt)).toHaveLength(1);

    const muted = await api("alice", `/api/channels/${general.id}/huddle/mute`, {
      method: "POST",
      body: JSON.stringify({ muted: true }),
    });
    expect(muted.status).toBe(200);
    const mutedBody = await muted.json();
    const aliceInCall = mutedBody.huddle.participants.find((p: { userId: string }) => p.userId === alice.id);
    const bobInCall = mutedBody.huddle.participants.find((p: { userId: string }) => p.userId === bob.id);
    expect(aliceInCall.muted).toBe(true);
    expect(bobInCall.muted).toBe(false);

    const aliceTok = await api("alice", "/api/device-tokens", {
      method: "POST",
      body: JSON.stringify({ token: `tok-${suffix}`, platform: "ios" }),
    });
    const bobTok = await api("bob", "/api/device-tokens", {
      method: "POST",
      body: JSON.stringify({ token: `tok-${suffix}`, platform: "ios" }),
    });
    expect(aliceTok.status).toBe(200);
    expect(bobTok.status).toBe(200);
    const tokens = await db.select().from(deviceToken);
    const shared = tokens.filter((row) => row.token === `tok-${suffix}`);
    expect(shared.map((row) => row.userId).sort()).toEqual([alice.id, bob.id].sort());

    const selected = await api("bob", `/api/workspaces/${bId}/select`, { method: "POST" });
    expect(selected.status).toBe(200);
    const bobMe = await (await api("bob", "/api/me")).json();
    expect(bobMe.activeWorkspaceId).toBe(bId);
    expect(bobMe.workspaces.length).toBeGreaterThanOrEqual(2);

    const cross = await api("bob", `/api/channels/${privateCh.channel.id}/messages`);
    expect(cross.status).toBe(403);

    await expect(
      db.insert(message).values({
        workspaceId: aId,
        channelId: bId,
        authorDisplayName: "x",
        body: "cross",
      }),
    ).rejects.toThrow();

    await db.insert(attachment).values({
      workspaceId: aId,
      uploadedBy: alice.id,
      storageKey: `key-${suffix}`,
      fileName: "note.txt",
      purpose: "message",
    });
    const steal = await api("bob", `/api/channels/${general.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: "", fileKey: `key-${suffix}` }),
    });
    expect(steal.status).toBe(403);

    const uuidBad = await api("alice", `/api/channels/${crypto.randomUUID()}/messages`);
    expect([403, 404]).toContain(uuidBad.status);

    const [generalRow] = await db.select().from(channel).where(eq(channel.id, general.id));
    expect(generalRow.kind).toBe("public");
  }, 60_000);

  it("surfaces email invites after the recipient creates an account", async () => {
    const dave: Person = {
      id: `dave-${suffix}`,
      name: "Dave Example",
      email: `Dave-${suffix}@relay.test`,
      image: null,
    };

    const ws = await (
      await api("alice", "/api/workspaces", { method: "POST", body: JSON.stringify({ name: `Inbox ${suffix}` }) })
    ).json();
    const workspaceId = ws.workspace.id as string;

    const created = await (
      await api("alice", "/api/invites", {
        method: "POST",
        body: JSON.stringify({ email: dave.email, workspaceId }),
      })
    ).json();
    expect(created.invite.email).toBe(dave.email.toLowerCase());
    expect(created.invite.token).toBeTruthy();

    users.set("dave", dave);
    const meRes = await api("dave", "/api/me");
    expect(meRes.status).toBe(200);
    const me = await meRes.json();
    expect(me.user.email).toBe(dave.email.toLowerCase());
    expect(me.workspaces).toEqual([]);
    expect(me.pendingInvites).toHaveLength(1);
    expect(me.pendingInvites[0].id).toBe(created.invite.id);
    expect(me.pendingInvites[0].workspace.id).toBe(workspaceId);
    expect(me.pendingInvites[0].workspace.name).toContain("Inbox");
    expect(me.pendingInvites[0].invitedByName).toBe(alice.name);
    expect(me.pendingInvites[0].token).toBeUndefined();

    const inbox = await (await api("dave", "/api/invites/inbox")).json();
    expect(inbox.invites).toHaveLength(1);
    expect(inbox.invites[0].id).toBe(created.invite.id);

    const hidden = await (await api("mallory", "/api/invites/inbox")).json();
    expect(hidden.invites).toEqual([]);

    const accepted = await api("dave", "/api/invites/accept", {
      method: "POST",
      body: JSON.stringify({ inviteId: me.pendingInvites[0].id }),
    });
    expect(accepted.status).toBe(200);

    const after = await (await api("dave", "/api/me")).json();
    expect(after.pendingInvites).toEqual([]);
    expect(after.workspaces.some((w: { id: string }) => w.id === workspaceId)).toBe(true);
    expect(after.activeWorkspaceId).toBe(workspaceId);
  }, 30_000);
});
