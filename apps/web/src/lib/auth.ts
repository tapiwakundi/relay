import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;

export const authClient = authUrl
  ? createAuthClient(authUrl, {
      adapter: BetterAuthReactAdapter(),
    })
  : null;

function tokenFrom(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as {
    token?: unknown;
    session?: { token?: unknown };
  };
  if (typeof data.token === "string" && data.token.includes(".")) return data.token;
  if (typeof data.session?.token === "string" && data.session.token.includes(".")) {
    return data.session.token;
  }
  return null;
}

export async function getAccessToken() {
  if (!authClient) return null;
  const { data, error } = await authClient.token();
  const fromToken = tokenFrom(data);
  if (!error && fromToken) return fromToken;

  const session = await authClient.getSession();
  return tokenFrom(session.data);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function getSession() {
  if (!authClient) return null;
  const { data, error } = await authClient.getSession();
  if (error || !data?.user) return null;
  return data;
}

export async function signInEmail(email: string, password: string) {
  if (!authClient) throw new Error("Neon Auth URL is missing");
  return authClient.signIn.email({ email, password });
}

export async function signUpEmail(name: string, email: string, password: string) {
  if (!authClient) throw new Error("Neon Auth URL is missing");
  return authClient.signUp.email({ name, email, password });
}

export async function signInGoogle() {
  if (!authClient) throw new Error("Neon Auth URL is missing");
  return authClient.signIn.social({
    provider: "google",
    callbackURL: window.location.origin + "/",
  });
}

export async function signOut() {
  await authClient?.signOut();
}
