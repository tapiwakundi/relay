function hostnameOf(host: string) {
  return host.split("/")[0]?.split(":")[0] ?? "";
}

export function isLoopbackHost(host: string) {
  const hostname = hostnameOf(host);
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function isPrivateOrLoopbackHost(host: string) {
  const hostname = hostnameOf(host);
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * TestFlight used to send x-forwarded-host: localhost so Google's callback
 * matched a local Cloud Console URI. On Render that spoofs the public origin
 * and Safari opens localhost on the phone. Drop loopback forwards unless the
 * request itself is local/LAN.
 */
export function sanitizeAuthRequest(req: Request): Request {
  const host = req.headers.get("host") ?? "";
  const forwardedHost = req.headers.get("x-forwarded-host") ?? "";
  if (!forwardedHost || isPrivateOrLoopbackHost(host)) return req;
  if (!isLoopbackHost(forwardedHost)) return req;
  const headers = new Headers(req.headers);
  headers.delete("x-forwarded-host");
  if ((headers.get("x-forwarded-proto") ?? "").toLowerCase() === "http") {
    headers.set("x-forwarded-proto", "https");
  }
  return new Request(req, { headers });
}
