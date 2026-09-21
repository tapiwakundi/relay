export const PRODUCTION_API_ORIGIN = "https://relay-api-rsck.onrender.com";

export function resolveApiOrigin(opts: {
  env?: string | null;
  dev: boolean;
  hostUri?: string;
}) {
  const env = (opts.env ?? "").trim().replace(/\/$/, "");
  const packagerHost = (opts.hostUri ?? "").split(":")[0];
  const attachedToPackager = Boolean(packagerHost);

  if (opts.dev && attachedToPackager) {
    if (env) return env;
    if (packagerHost !== "localhost" && packagerHost !== "127.0.0.1") return `http://${packagerHost}:3001`;
    return "http://localhost:3001";
  }

  if (env && isPublicHttps(env)) return env;
  return PRODUCTION_API_ORIGIN;
}

export function localGoogleOAuthHeaders(origin: string): Record<string, string> | undefined {
  if (isPublicHttps(origin)) return undefined;
  return {
    "x-forwarded-host": "localhost:3001",
    "x-forwarded-proto": "http",
  };
}

export function isPublicHttps(origin: string) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    const host = url.hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch {
    return false;
  }
}
