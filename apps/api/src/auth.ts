import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  const url = process.env.NEON_AUTH_JWKS_URL;
  if (!url) throw new Error("NEON_AUTH_JWKS_URL is not set");
  jwks ??= createRemoteJWKSet(new URL(url));
  return jwks;
}

function bearerToken(headers: Headers) {
  const auth = headers.get("authorization") ?? headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function getAuthUser(headers: Headers): Promise<AuthUser | null> {
  const token = bearerToken(headers);
  if (!token) return null;

  const base = process.env.NEON_AUTH_BASE_URL ?? "";
  const origin = base ? new URL(base).origin : undefined;
  const attempts = [
    { issuer: origin },
    { issuer: base || undefined },
    {},
  ];

  let payload: Record<string, unknown> | null = null;
  for (const opts of attempts) {
    try {
      const result = await jwtVerify(token, getJwks(), {
        ...(opts.issuer ? { issuer: opts.issuer } : {}),
      });
      payload = result.payload as Record<string, unknown>;
      break;
    } catch {
      /* try next issuer */
    }
  }
  if (!payload?.sub) return null;

  const name =
    (typeof payload.name === "string" && payload.name) ||
    (typeof payload.email === "string" && payload.email.split("@")[0]) ||
    "User";
  const email = typeof payload.email === "string" ? payload.email : "";
  return { id: String(payload.sub), name, email, image: imageFromClaims(payload) };
}

function imageFromClaims(payload: Record<string, unknown>): string | null {
  const nested = payload.user;
  const extra =
    nested && typeof nested === "object" ? (nested as Record<string, unknown>) : null;
  const candidates = [payload.picture, payload.image, payload.avatar, extra?.image, extra?.picture];
  for (const value of candidates) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}
