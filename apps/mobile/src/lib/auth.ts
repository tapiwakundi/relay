import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { notifyAccountExpired } from "./session";
import { getActiveWorkspaceId } from "./query";
import { createMobileAccountVault, type StoredAccount } from "./account-vault";
import { accountAuthHeaders } from "./account-headers";
import { localGoogleOAuthHeaders, resolveApiOrigin } from "./api-origin";

const FETCH_TIMEOUT_MS = 12_000;

export function apiOrigin() {
  return resolveApiOrigin({
    env: process.env.EXPO_PUBLIC_API_URL,
    dev: typeof __DEV__ === "undefined" ? true : __DEV__,
    hostUri: Constants.expoConfig?.hostUri ?? "",
  });
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
    fetchOptions: { timeout: FETCH_TIMEOUT_MS },
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
  if (error || !data?.user) return null;
  const cookie = await client.getCookie();
  const token = tokenFrom(data) ?? sessionTokenFromCookie(cookie) ?? "";
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

function isAbortError(err: unknown) {
  return err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const parent = init?.signal;
  const onAbort = () => controller.abort();
  parent?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    parent?.removeEventListener("abort", onAbort);
  }
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
  let res: Response;
  try {
    res = await fetchWithTimeout(`${apiOrigin()}${path}`, { ...init, headers, credentials: "omit" });
  } catch (err) {
    if (isAbortError(err)) throw new Error("Can't reach Relay");
    throw err;
  }
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
  const headers = localGoogleOAuthHeaders(apiOrigin());
  return liveClient().signIn.social({
    provider: "google",
    callbackURL: "/",
    ...(headers ? { fetchOptions: { headers } } : {}),
  });
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
        await fetchWithTimeout(`${apiOrigin()}/api/auth/sign-out`, { method: "POST", headers, credentials: "omit" });
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
