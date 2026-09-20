import type { ApiRequest } from "../../../shared/ipc";
import { getActiveAccountId, getActiveWorkspaceId } from "./query";

async function requestBody(init?: RequestInit): Promise<Pick<ApiRequest, "body" | "form">> {
  const body = init?.body;
  if (body == null) return {};
  if (typeof body === "string") return { body };
  if (body instanceof FormData) {
    const form: ApiRequest["form"] = [];
    for (const [field, value] of body.entries()) {
      if (value instanceof File) {
        form.push({
          field,
          name: value.name,
          type: value.type,
          data: new Uint8Array(await value.arrayBuffer()),
        });
      } else {
        form.push({ field, text: value });
      }
    }
    return { form };
  }
  throw new Error("Unsupported request body");
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const payload = await requestBody(init);
  const headers: Record<string, string> = {};
  const workspaceId = getActiveWorkspaceId();
  if (workspaceId) headers["x-relay-workspace-id"] = workspaceId;
  const response = await window.relayDesktop.api({
    path,
    method: init?.method,
    headers,
    accountId: getActiveAccountId() ?? undefined,
    ...payload,
  });
  if (response.status === 401) throw new Error("unauthorized");
  if (response.status >= 400) throw new Error(response.body || `Request failed (${response.status})`);
  if (!response.body) return {} as T;
  return JSON.parse(response.body) as T;
}

export async function getSession() {
  const user = await window.relayDesktop.getUser();
  return user ? { user } : null;
}

export async function signInEmail(email: string, password: string, add = false) {
  return window.relayDesktop.signInEmail(email, password, { add });
}

export async function signUpEmail(name: string, email: string, password: string, add = false) {
  return window.relayDesktop.signUpEmail(name, email, password, { add });
}

export async function signInGoogle(add = false): Promise<{ error: { message: string } | null }> {
  try {
    await window.relayDesktop.requestAuth({ provider: "google", add });
    return { error: null };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : "Google sign-in failed" } };
  }
}

export async function signOut(accountId?: string) {
  await window.relayDesktop.signOut(accountId);
}
