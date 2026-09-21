import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { sanitizeAuthRequest, skipOAuthStateCookieCheck } from "../src/auth-forwarded.js";
import type { Auth } from "../src/better-auth.js";
import type { AppDb } from "../src/db/index.js";
import { Hub } from "../src/hub.js";

describe("auth forwarded headers", () => {
  it("drops localhost forwards when the request hit a public host", () => {
    const sanitized = sanitizeAuthRequest(
      new Request("https://relay-api-rsck.onrender.com/api/auth/sign-in/social", {
        headers: {
          host: "relay-api-rsck.onrender.com",
          "x-forwarded-host": "localhost:3001",
          "x-forwarded-proto": "http",
        },
      }),
    );
    expect(sanitized.headers.get("x-forwarded-host")).toBeNull();
    expect(sanitized.headers.get("x-forwarded-proto")).toBe("https");
  });

  it("keeps localhost forwards on LAN so simulator Google OAuth still matches Cloud Console", () => {
    const sanitized = sanitizeAuthRequest(
      new Request("http://192.168.1.82:3001/api/auth/sign-in/social", {
        headers: {
          host: "192.168.1.82:3001",
          "x-forwarded-host": "localhost:3001",
          "x-forwarded-proto": "http",
        },
      }),
    );
    expect(sanitized.headers.get("x-forwarded-host")).toBe("localhost:3001");
    expect(sanitized.headers.get("x-forwarded-proto")).toBe("http");
  });

  it("skips the OAuth state cookie only on local and LAN origins", () => {
    expect(skipOAuthStateCookieCheck("http://localhost:3001")).toBe(true);
    expect(skipOAuthStateCookieCheck("http://192.168.1.82:3001")).toBe(true);
    expect(skipOAuthStateCookieCheck("https://relay-api-rsck.onrender.com")).toBe(false);
  });

  it("does not bounce the Expo auth proxy to localhost", async () => {
    const auth = {
      handler: async () => new Response("proxy-ok"),
      api: { getSession: async () => null },
    } as unknown as Auth;
    const app = createApp({ db: {} as AppDb, hub: new Hub(), auth });
    const res = await app.fetch(
      new Request(
        "https://relay-api-rsck.onrender.com/api/auth/expo-authorization-proxy?authorizationURL=https://accounts.google.com",
        { headers: { host: "relay-api-rsck.onrender.com" } },
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.text()).toBe("proxy-ok");
  });
});
