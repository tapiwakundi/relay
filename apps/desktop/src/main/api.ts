import { API_ORIGIN } from "./auth";
import { cookieForAccount, dropInvalidAccount, getActiveAccountId } from "./accounts";
import type { ApiRequest, ApiResponse } from "../shared/ipc";

const MAX_BYTES = 50 * 1024 * 1024;

function assertPath(path: string) {
  if (!path.startsWith("/api/") || path.includes("://") || path.includes("..")) {
    throw new Error("Invalid API path");
  }
}

export async function proxyApi(request: ApiRequest): Promise<ApiResponse> {
  assertPath(request.path);
  const headers = new Headers();
  const accountId = request.accountId ?? getActiveAccountId();
  const cookie = cookieForAccount(accountId);
  if (cookie) headers.set("cookie", cookie);
  if (request.headers) {
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.set(key, value);
    }
  }
  let body: BodyInit | undefined;
  if (request.form) {
    const form = new FormData();
    for (const part of request.form) {
      if ("data" in part) {
        if (part.data.byteLength > MAX_BYTES) throw new Error("File is too large");
        form.append(part.field, new Blob([Buffer.from(part.data)], { type: part.type }), part.name);
      } else {
        form.append(part.field, part.text);
      }
    }
    body = form;
  } else if (request.body != null) {
    headers.set("content-type", "application/json");
    body = request.body;
  }
  const response = await fetch(new URL(request.path, API_ORIGIN), {
    method: request.method ?? "GET",
    headers,
    body,
  });
  const payload = { status: response.status, body: await response.text() };
  if (payload.status === 401 && accountId) void dropInvalidAccount(accountId);
  return payload;
}
