import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { notifyAccountExpired } from "./session";
import { getActiveWorkspaceId } from "./query";
import { createMobileAccountVault, type StoredAccount } from "./account-vault";
import { accountAuthHeaders } from "./account-headers";

export function apiOrigin() {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  const hostUri = Constants.expoConfig?.hostUri ?? "";
  const host = hostUri.split(":")[0];
  if (host && host !== "localhost" && host !== "127.0.0.1") return `http://${host}:3001`;
  return "http://localhost:3001";
}

export function wsOrigin() {
  return apiOrigin().replace(/^http/, "ws") + "/ws";
}

const kv = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  deleteItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const accountVault = createMobileAccountVault(kv);

export function makeAuthClient(prefix: string) {
  return createAuthClient({
    baseURL: apiOrigin(),
    plugins: [
      expoClient({
        scheme: "relay",
        storagePrefix: prefix,
        storage: SecureStore,
      }),
    ],
  });
}

export const authClient = makeAuthClient("relay");
export const pendingAuthClient = makeAuthClient("relay.pending");

let activeAccountId: string | null = null;
let adding = false;

export function getActiveAccountId() {
  return activeAccountId;
}

export function setActiveAccountId(id: string | null) {
  activeAccountId = id;
}

export function setAddingAccount(value: boolean) {
  adding = value;
}

export function isAddingAccount() {
  return adding;
}

export function liveClient() {
  return adding ? pendingAuthClient : authClient;
}

function tokenFrom(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { token?: unknown; session?: { token?: unknown } };
  if (typeof data.token === "string" && data.token) return data.token;
  if (typeof data.session?.token === "string" && data.session.token) return data.session.token;
  return null;
}

function sessionTokenFromCookie(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name.endsWith(".session_token")) continue;
    const value = part.slice(separator + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export async function extractCredentials(client = liveClient()): Promise<StoredAccount | null> {
  const { data, error } = await client.getSession();
  const cookie = await client.getCookie();
  const token = tokenFrom(data) ?? sessionTokenFromCookie(cookie) ?? "";
  // #region agent log
  fetch("http://127.0.0.1:7660/ingest/d411e104-0031-4050-914e-31602e54b52b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6e3817" },
    body: JSON.stringify({
      sessionId: "6e3817",
      runId: "pre-fix",
      hypothesisId: "H4",
      location: "apps/mobile/src/lib/auth.ts:extractCredentials",
      message: "extractCredentials session",
      data: {
        adding,
        hasUser: Boolean(data?.user),
        hasError: Boolean(error),
        errorName: error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : null,
        hasCookie: Boolean(cookie),
        hasToken: Boolean(token),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (error || !data?.user) return null;
  if (!token && !cookie) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name,
    image: data.user.image ?? null,
    activeWorkspaceId: null,
    unreadTotal: 0,
    mentionTotal: 0,
    token,
    cookie,
  };
}

export async function getAccessToken(accountId = activeAccountId) {
  if (accountId) {
    const creds = await accountVault.credentials(accountId);
    if (creds?.token) return creds.token;
  }
  const { data, error } = await liveClient().getSession();
  if (error) return null;
  if (!data?.user) return null;
  return tokenFrom(data) ?? sessionTokenFromCookie(await liveClient().getCookie());
}

export async function api<T>(path: string, init?: RequestInit, accountId?: string): Promise<T> {
  const id = accountId ?? activeAccountId;
  const creds = id ? await accountVault.credentials(id) : null;
  const token = creds?.token || (await getAccessToken(id));
  const cookie = creds?.cookie || (await liveClient().getCookie());
  const headers = new Headers(init?.headers);
  const workspaceId = getActiveWorkspaceId();
  if (workspaceId) headers.set("x-relay-workspace-id", workspaceId);
  const auth = accountAuthHeaders({ token: token ?? "", cookie: cookie ?? "" });
  for (const [key, value] of Object.entries(auth)) headers.set(key, value);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiOrigin()}${path}`, { ...init, headers, credentials: "omit" });
  if (res.status === 401) {
    notifyAccountExpired(id);
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function signInEmail(email: string, password: string) {
  return liveClient().signIn.email({ email, password });
}

export async function signUpEmail(name: string, email: string, password: string) {
  return liveClient().signUp.email({ name, email, password });
}

export async function signInGoogle() {
  const origin = apiOrigin();
  const callbackDefault = Linking.createURL("/");
  const callbackScheme = Linking.createURL("/", { scheme: "relay" });
  const expoOrigin = Linking.createURL("", { scheme: "relay" });
  // #region agent log
  fetch("http://127.0.0.1:7660/ingest/d411e104-0031-4050-914e-31602e54b52b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6e3817" },
    body: JSON.stringify({
      sessionId: "6e3817",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "apps/mobile/src/lib/auth.ts:signInGoogle:start",
      message: "google sign-in start",
      data: { origin, adding, callbackDefault, callbackScheme, expoOrigin },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  try {
    const result = await liveClient().signIn.social({
      provider: "google",
      callbackURL: "/",
      fetchOptions: {
        headers: {
          "x-forwarded-host": "localhost:3001",
          "x-forwarded-proto": "http",
        },
      },
    });
    let urlHost: string | null = null;
    const url = result.data && typeof result.data === "object" && "url" in result.data ? (result.data as { url?: unknown }).url : null;
    if (typeof url === "string") {
      try {
        urlHost = new URL(url).host;
      } catch {
        urlHost = "unparseable";
      }
    }
    // #region agent log
    fetch("http://127.0.0.1:7660/ingest/d411e104-0031-4050-914e-31602e54b52b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6e3817" },
      body: JSON.stringify({
        sessionId: "6e3817",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "apps/mobile/src/lib/auth.ts:signInGoogle:result",
        message: "google sign-in result",
        data: {
          hasError: Boolean(result.error),
          errorMessage: result.error?.message ?? null,
          dataKeys: result.data && typeof result.data === "object" ? Object.keys(result.data) : [],
          redirect: result.data && typeof result.data === "object" && "redirect" in result.data ? Boolean((result.data as { redirect?: unknown }).redirect) : null,
          urlHost,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return result;
  } catch (err) {
    // #region agent log
    fetch("http://127.0.0.1:7660/ingest/d411e104-0031-4050-914e-31602e54b52b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6e3817" },
      body: JSON.stringify({
        sessionId: "6e3817",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "apps/mobile/src/lib/auth.ts:signInGoogle:throw",
        message: "google sign-in threw",
        data: { name: err instanceof Error ? err.name : "unknown", message: err instanceof Error ? err.message : String(err) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw err;
  }
}

export async function signOutClient(client = liveClient()) {
  await client.signOut();
}

export async function signOut() {
  const id = activeAccountId;
  if (id) {
    const creds = await accountVault.credentials(id);
    if (creds?.token || creds?.cookie) {
      try {
        const headers = new Headers(accountAuthHeaders(creds));
        await fetch(`${apiOrigin()}/api/auth/sign-out`, { method: "POST", headers, credentials: "omit" });
      } catch {
        /* ignore */
      }
    }
  }
  await liveClient().signOut().catch(() => null);
}

export async function getSession() {
  if (activeAccountId) {
    const creds = await accountVault.credentials(activeAccountId);
    if (creds?.token) {
      try {
        const me = await api<{ user: { id: string; email: string; name: string; image: string | null } }>("/api/me", undefined, activeAccountId);
        return { user: me.user, session: { token: creds.token } };
      } catch {
        return null;
      }
    }
  }
  const { data, error } = await liveClient().getSession();
  if (error || !data?.user) return null;
  return data;
}
