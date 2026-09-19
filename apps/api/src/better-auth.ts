import { networkInterfaces } from "node:os";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { bearer } from "better-auth/plugins";
import * as schema from "./db/schema.js";
import type { AppDb } from "./queries.js";

export type Auth = ReturnType<typeof createAuth>;

function lanHosts() {
  const hosts: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      const v4 = a.family === "IPv4" || (a.family as unknown) === 4;
      if (!v4 || a.internal || a.address.startsWith("169.254.")) continue;
      hosts.push(`${a.address}:3001`, `${a.address}:5173`, `${a.address}:8081`);
    }
  }
  return hosts;
}

export function createAuth(db: AppDb) {
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  const googleId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  return betterAuth({
    baseURL: {
      allowedHosts: [
        "localhost:3001",
        "localhost:5173",
        "localhost:8081",
        "127.0.0.1:3001",
        "127.0.0.1:5173",
        "127.0.0.1:8081",
        ...lanHosts(),
        ...(process.env.AUTH_ALLOWED_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean) ?? []),
      ],
      fallback: process.env.BETTER_AUTH_URL || "http://localhost:3001",
    },
    secret,
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
      webOrigin,
      "http://localhost:5173",
      "http://localhost:3001",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:3001",
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
    plugins: [expo(), bearer()],
    advanced: {
      trustedProxyHeaders: true,
    },
  });
}
