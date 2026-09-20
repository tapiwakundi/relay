import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { notifySignedOut } from "./session";
import { getActiveWorkspaceId } from "./query";

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

export const authClient = createAuthClient({
  baseURL: apiOrigin(),
  plugins: [
    expoClient({
      scheme: "relay",
      storagePrefix: "relay",
      storage: SecureStore,
    }),
  ],
});

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

export async function getAccessToken() {
  const { data, error } = await authClient.getSession();
  if (error) return null;
  if (!data?.user) return null;
  return tokenFrom(data) ?? sessionTokenFromCookie(await authClient.getCookie());
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const cookie = await authClient.getCookie();
  const headers = new Headers(init?.headers);
  const workspaceId = getActiveWorkspaceId();
  if (workspaceId) headers.set("x-relay-workspace-id", workspaceId);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (cookie) headers.set("Cookie", cookie);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiOrigin()}${path}`, { ...init, headers, credentials: "omit" });
  if (res.status === 401) {
    notifySignedOut();
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
  return authClient.signIn.email({ email, password });
}

export async function signUpEmail(name: string, email: string, password: string) {
  return authClient.signUp.email({ name, email, password });
}

export async function signInGoogle() {
  // Google rejects private-IP redirect URIs (`192.168.x.x`) with
  // "device_id and device_name are required". The Cloud Console client is a
  // Web application registered at localhost, so tell Better Auth to build
  // Google's callback as http://localhost:3001/api/auth/callback/google.
  // iOS Simulator can reach the Mac on localhost; a physical phone cannot
  // (use email sign-in, or a public tunnel, for on-device Google).
  return authClient.signIn.social({
    provider: "google",
    callbackURL: "/",
    fetchOptions: {
      headers: {
        "x-forwarded-host": "localhost:3001",
        "x-forwarded-proto": "http",
      },
    },
  });
}

export async function signOut() {
  await authClient.signOut();
}

export async function getSession() {
  const { data, error } = await authClient.getSession();
  if (error || !data?.user) return null;
  return data;
}
