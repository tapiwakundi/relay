import { networkInterfaces } from "node:os";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { bearer } from "better-auth/plugins";
import { electron } from "@better-auth/electron";
import { skipOAuthStateCookieCheck } from "./auth-forwarded.js";
import * as schema from "./db/schema.js";
import type { AppDb } from "./db/index.js";

export type Auth = ReturnType<typeof createAuth>;

function lanHosts() {
  const hosts: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      const v4 = a.family === "IPv4" || (a.family as unknown) === 4;
      if (!v4 || a.internal || a.address.startsWith("169.254.")) continue;
      hosts.push(`${a.address}:3001`, `${a.address}:8081`);
    }
  }
  return hosts;
}

export function createAuth(db: AppDb) {
  const apiOrigin = (process.env.BETTER_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const googleId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  let publicHost = "";
  try {
    const url = new URL(apiOrigin);
    publicHost = url.host;
  } catch {
    publicHost = "";
  }

  return betterAuth({
    baseURL: {
      allowedHosts: [
        "localhost:3001",
        "localhost:8081",
        "127.0.0.1:3001",
        "127.0.0.1:8081",
        ...(publicHost ? [publicHost, publicHost.split(":")[0]!] : []),
        ...lanHosts(),
        ...(process.env.AUTH_ALLOWED_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean) ?? []),
      ],
      fallback: apiOrigin,
    },
    secret,
    account: {
      identityStrategy: "provider-id",
      skipStateCookieCheck: skipOAuthStateCookieCheck(apiOrigin),
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    trustedOrigins: [
      apiOrigin,
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:8081",
      "com.endurancelabs.relaydesktop:/",
      "com.endurancelabs.relayapp:/",
      "relay://",
      "exp://",
      "exp+relay://",
      ...lanHosts().map((host) => `http://${host}`),
    ],
    emailAndPassword: { enabled: true },
    socialProviders:
      googleId && googleSecret
        ? {
            google: {
              clientId: googleId,
              clientSecret: googleSecret,
              prompt: "select_account",
            },
          }
        : {},
    plugins: [expo(), bearer(), electron()],
    advanced: {
      trustedProxyHeaders: true,
    },
  });
}
