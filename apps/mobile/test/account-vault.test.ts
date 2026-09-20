import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMobileAccountVault, splitChunks, joinChunks, type KvStore } from "../src/lib/account-vault";

function memoryStore(initial: Record<string, string> = {}): KvStore {
  const data = { ...initial };
  return {
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => {
      data[key] = value;
    },
    deleteItem: async (key) => {
      delete data[key];
    },
  };
}

describe("mobile account vault", () => {
  it("chunks and reassembles oversized session blobs", () => {
    const blob = "x".repeat(5000);
    const parts = splitChunks(blob, 1800);
    assert.equal(parts.length, 3);
    assert.equal(joinChunks(parts), blob);
  });

  it("isolates credentials per account and keeps the other after sign-out", async () => {
    const vault = createMobileAccountVault(memoryStore());
    await vault.upsert({
      id: "u1",
      email: "a@x.com",
      name: "Ada",
      image: null,
      activeWorkspaceId: "ws-a",
      unreadTotal: 0,
      mentionTotal: 0,
      token: "tok-a",
      cookie: "cookie-a",
    });
    await vault.upsert({
      id: "u2",
      email: "b@x.com",
      name: "Bob",
      image: null,
      activeWorkspaceId: "ws-b",
      unreadTotal: 2,
      mentionTotal: 1,
      token: "tok-b",
      cookie: "cookie-b",
    });
    await vault.setActive("u1");
    assert.equal((await vault.credentials("u1"))?.token, "tok-a");
    assert.equal((await vault.credentials("u2"))?.token, "tok-b");
    const next = await vault.remove("u1");
    assert.equal(next, "u2");
    assert.equal(await vault.credentials("u1"), null);
    assert.equal((await vault.list()).map((a) => a.id).join(), "u2");
  });

  it("does not duplicate an existing user id", async () => {
    const vault = createMobileAccountVault(memoryStore());
    await vault.upsert({
      id: "u1",
      email: "a@x.com",
      name: "Ada",
      image: null,
      activeWorkspaceId: null,
      unreadTotal: 0,
      mentionTotal: 0,
      token: "old",
      cookie: "old-c",
    });
    await vault.upsert({
      id: "u1",
      email: "a@x.com",
      name: "Ada Lovelace",
      image: null,
      activeWorkspaceId: "ws-a",
      unreadTotal: 0,
      mentionTotal: 0,
      token: "new",
      cookie: "new-c",
    });
    assert.equal((await vault.list()).length, 1);
    assert.equal((await vault.list())[0]?.name, "Ada Lovelace");
    assert.equal((await vault.credentials("u1"))?.token, "new");
  });

  it("migrates a validated legacy session only when the vault is empty", async () => {
    const vault = createMobileAccountVault(memoryStore());
    const session = {
      id: "u1",
      email: "a@x.com",
      name: "Ada",
      image: null,
      activeWorkspaceId: "ws-a",
      unreadTotal: 0,
      mentionTotal: 0,
      token: "legacy-token",
      cookie: "legacy-cookie",
    };
    assert.equal(await vault.migrateIfEmpty(null), false);
    assert.equal(await vault.migrateIfEmpty(session), true);
    assert.equal((await vault.list()).length, 1);
    assert.equal((await vault.activeId()), "u1");
    assert.equal((await vault.credentials("u1"))?.token, "legacy-token");
    assert.equal(
      await vault.migrateIfEmpty({ ...session, id: "u2", token: "other" }),
      false,
    );
    assert.equal((await vault.list()).length, 1);
    assert.equal((await vault.credentials("u1"))?.token, "legacy-token");
  });
});
