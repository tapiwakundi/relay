export function resolveApiOrigin(env = process.env.EXPO_PUBLIC_API_URL) {
  const origin = (env ?? "").trim().replace(/\/$/, "");
  if (!origin) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }
  return origin;
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
