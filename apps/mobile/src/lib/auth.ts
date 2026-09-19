import { createAuthClient } from "@neondatabase/auth";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { notifySignedOut } from "./session";

WebBrowser.maybeCompleteAuthSession();

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

const AUTH_URL = process.env.EXPO_PUBLIC_NEON_AUTH_URL;

export const authClient = AUTH_URL ? createAuthClient(AUTH_URL) : null;

function tokenFrom(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { token?: unknown; session?: { token?: unknown } };
  if (typeof data.token === "string" && data.token.includes(".")) return data.token;
  if (typeof data.session?.token === "string" && data.session.token.includes(".")) return data.session.token;
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
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiOrigin()}${path}`, { ...init, headers });
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
  if (!authClient) throw new Error("EXPO_PUBLIC_NEON_AUTH_URL is missing");
  return authClient.signIn.email({ email, password });
}

export async function signUpEmail(name: string, email: string, password: string) {
  if (!authClient) throw new Error("EXPO_PUBLIC_NEON_AUTH_URL is missing");
  return authClient.signUp.email({ name, email, password });
}

export async function signInGoogle() {
  if (!authClient) throw new Error("EXPO_PUBLIC_NEON_AUTH_URL is missing");
  const callbackURL = Linking.createURL("/");
  const result = await authClient.signIn.social({
    provider: "google",
    callbackURL,
  });
  const url = (result.data as { url?: string } | null)?.url;
  if (url) {
    await WebBrowser.openAuthSessionAsync(url, callbackURL);
  }
  return result;
}

export async function signOut() {
  await authClient?.signOut();
}

export async function getSession() {
  if (!authClient) return null;
  const { data, error } = await authClient.getSession();
  if (error || !data?.user) return null;
  return data;
}
