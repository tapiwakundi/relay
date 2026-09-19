import { createAuthClient } from "better-auth/react";

const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

export const authClient = createAuthClient({
  ...(apiBase ? { baseURL: apiBase } : {}),
  fetchOptions: {
    credentials: "include",
    auth: {
      type: "Bearer",
      token: () => (typeof localStorage === "undefined" ? undefined : localStorage.getItem("relay.bearer") || undefined),
    },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) localStorage.setItem("relay.bearer", token);
    },
  },
});

function tokenFrom(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { token?: unknown; session?: { token?: unknown } };
  if (typeof data.token === "string" && data.token) return data.token;
  if (typeof data.session?.token === "string" && data.session.token) return data.session.token;
  return typeof localStorage === "undefined" ? null : localStorage.getItem("relay.bearer");
}

export async function getAccessToken() {
  const { data, error } = await authClient.getSession();
  if (!error) {
    const fromSession = tokenFrom(data);
    if (fromSession) return fromSession;
  }
  return typeof localStorage === "undefined" ? null : localStorage.getItem("relay.bearer");
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    ...init,
    credentials: "include",
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
  const { data, error } = await authClient.getSession();
  if (error || !data?.user) return null;
  return data;
}

export async function signInEmail(email: string, password: string) {
  return authClient.signIn.email({ email, password });
}

export async function signUpEmail(name: string, email: string, password: string) {
  return authClient.signUp.email({ name, email, password });
}

export async function signInGoogle() {
  return authClient.signIn.social({
    provider: "google",
    callbackURL: window.location.origin + "/",
  });
}

export async function signOut() {
  localStorage.removeItem("relay.bearer");
  await authClient.signOut();
}
