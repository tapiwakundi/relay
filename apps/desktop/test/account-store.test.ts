import { createAccountVault, COOKIE_KEY, CACHE_KEY, cookieHeaderFromJson, type AccountVaultBackend } from "../src/main/account-store";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

function memoryBackend(legacy: Record<string, string> = {}): AccountVaultBackend & { store: { vault: unknown } } {
  const store: { vault: unknown } = { vault: null };
  return {
    store,
    read: () => store.vault as never,
    write: (state) => {
      store.vault = JSON.parse(JSON.stringify(state));
    },
    readLegacy: (key) => legacy[key],
    writeLegacy: (key, value) => {
      legacy[key] = value;
    },
    deleteLegacy: (key) => {
      delete legacy[key];
    },
  };
}

describe("desktop account vault", () => {
  it("migrates a legacy single session without dropping the cookie", () => {
    const legacy: Record<string, string> = { [COOKIE_KEY]: "encrypted-cookie" };
    const vault = createAccountVault(memoryBackend(legacy));
    assert.equal(vault.getBlob(COOKIE_KEY), "encrypted-cookie");
    vault.setBlob(COOKIE_KEY, "encrypted-cookie-2");
    const result = vault.commit({ id: "u1", email: "a@x.com", name: "Ada" });
    assert.equal(result.duplicate, false);
    assert.equal(vault.getBlob(COOKIE_KEY), "encrypted-cookie-2");
    assert.equal(legacy[COOKIE_KEY], undefined);
    assert.equal(vault.list()[0]?.email, "a@x.com");
  });

  it("isolates pending add-account blobs from the active account", () => {
    const vault = createAccountVault(memoryBackend());
    vault.commit({ id: "u1", email: "a@x.com", name: "Ada" });
    vault.setBlob(COOKIE_KEY, "cookie-a");
    vault.beginAdd();
    vault.beginAdd();
    vault.setBlob(COOKIE_KEY, "cookie-b");
    assert.equal(vault.get("u1")?.blobs[COOKIE_KEY], "cookie-a");
    vault.commit({ id: "u2", email: "b@x.com", name: "Bob" });
    assert.equal(vault.get("u1")?.blobs[COOKIE_KEY], "cookie-a");
    assert.equal(vault.get("u2")?.blobs[COOKIE_KEY], "cookie-b");
    assert.equal(vault.activeId(), "u2");
  });

  it("switches back to an existing account instead of duplicating it", () => {
    const vault = createAccountVault(memoryBackend());
    vault.commit({ id: "u1", email: "a@x.com", name: "Ada" });
    vault.setBlob(COOKIE_KEY, "cookie-a");
    vault.beginAdd();
    vault.setBlob(COOKIE_KEY, "cookie-new");
    const result = vault.commit({ id: "u1", email: "a@x.com", name: "Ada" });
    assert.equal(result.duplicate, true);
    assert.equal(vault.activeId(), "u1");
    assert.equal(vault.get("u1")?.blobs[COOKIE_KEY], "cookie-a");
    assert.equal(vault.list().length, 1);
  });

  it("sign-out of one account keeps the other active", () => {
    const vault = createAccountVault(memoryBackend());
    vault.commit({ id: "u1", email: "a@x.com", name: "Ada" });
    vault.beginAdd();
    vault.commit({ id: "u2", email: "b@x.com", name: "Bob" });
    const next = vault.remove("u2");
    assert.equal(next, "u1");
    assert.equal(vault.activeId(), "u1");
    assert.deepEqual(
      vault.list().map((a) => a.id),
      ["u1"],
    );
  });

  it("serializes stored cookie json into a header", () => {
    const header = cookieHeaderFromJson(
      JSON.stringify({ "better-auth.session_token": { value: "tok+1", expires: null } }),
    );
    assert.equal(header, "better-auth.session_token=tok%2B1");
  });

  it("keeps cache blobs alongside cookies", () => {
    const vault = createAccountVault(memoryBackend());
    vault.commit({ id: "u1", email: "a@x.com", name: "Ada" });
    vault.setBlob(COOKIE_KEY, "c");
    vault.setBlob(CACHE_KEY, "cache");
    vault.setActive("u1");
    assert.equal(vault.getBlob(CACHE_KEY), "cache");
  });

  it("routes API cookies from the requested account, not the active one", () => {
    const vault = createAccountVault(memoryBackend());
    vault.commit({ id: "u1", email: "a@x.com", name: "Ada" });
    vault.setBlob(
      COOKIE_KEY,
      JSON.stringify({ "better-auth.session_token": { value: "tok-a", expires: null } }),
    );
    vault.beginAdd();
    vault.setBlob(
      COOKIE_KEY,
      JSON.stringify({ "better-auth.session_token": { value: "tok-b", expires: null } }),
    );
    vault.commit({ id: "u2", email: "b@x.com", name: "Bob" });
    assert.equal(vault.activeId(), "u2");
    assert.equal(
      cookieHeaderFromJson(vault.get("u1")?.blobs[COOKIE_KEY]),
      "better-auth.session_token=tok-a",
    );
    assert.equal(
      cookieHeaderFromJson(vault.get("u2")?.blobs[COOKIE_KEY]),
      "better-auth.session_token=tok-b",
    );
  });

  it("a 401-style drop of one account leaves the other signed in", () => {
    const vault = createAccountVault(memoryBackend());
    vault.commit({ id: "u1", email: "a@x.com", name: "Ada" });
    vault.setBlob(COOKIE_KEY, "cookie-a");
    vault.beginAdd();
    vault.commit({ id: "u2", email: "b@x.com", name: "Bob" });
    vault.setBlob(COOKIE_KEY, "cookie-b");
    const next = vault.remove("u2");
    assert.equal(next, "u1");
    assert.equal(vault.get("u1")?.blobs[COOKIE_KEY], "cookie-a");
    assert.equal(vault.get("u2"), null);
  });
});
