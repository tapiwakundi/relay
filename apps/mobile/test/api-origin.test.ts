import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localGoogleOAuthHeaders, resolveApiOrigin } from "../src/lib/api-origin";

describe("mobile api origin", () => {
  it("uses EXPO_PUBLIC_API_URL as-is", () => {
    assert.equal(resolveApiOrigin("http://localhost:3001"), "http://localhost:3001");
    assert.equal(resolveApiOrigin("http://192.168.1.82:3001/"), "http://192.168.1.82:3001");
    assert.equal(
      resolveApiOrigin("https://relay-api-rsck.onrender.com/"),
      "https://relay-api-rsck.onrender.com",
    );
  });

  it("requires EXPO_PUBLIC_API_URL", () => {
    assert.throws(() => resolveApiOrigin(""), /EXPO_PUBLIC_API_URL is not set/);
    assert.throws(() => resolveApiOrigin(null), /EXPO_PUBLIC_API_URL is not set/);
  });

  it("does not spoof localhost Google callbacks against a public API", () => {
    assert.equal(localGoogleOAuthHeaders("https://relay-api-rsck.onrender.com"), undefined);
    assert.deepEqual(localGoogleOAuthHeaders("http://192.168.1.82:3001"), {
      "x-forwarded-host": "localhost:3001",
      "x-forwarded-proto": "http",
    });
  });
});
