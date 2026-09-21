const LIVEKIT_HOST = /^(?:[a-z0-9-]+\.)*livekit\.cloud$/i;

export function rewriteIceUrl(url: string, lookup: (host: string) => string | null): string {
  const match = /^(stun|stuns|turn|turns):([^:/?]+)(:\d+)?(\?[^#]*)?$/i.exec(url);
  if (!match) return url;
  const [, scheme, host, port = "", query = ""] = match;
  if (!LIVEKIT_HOST.test(host)) return url;
  const ip = lookup(host);
  if (!ip) return url;
  if (scheme.toLowerCase() === "turns" || scheme.toLowerCase() === "stuns") {
    return `turn:${ip}${port || ":443"}${query || "?transport=tcp"}`;
  }
  return `${scheme}:${ip}${port}${query}`;
}

export function rewriteIceServers<T extends { urls?: string | string[]; url?: string }>(
  servers: T[] | undefined,
  lookup: (host: string) => string | null,
): T[] | undefined {
  if (!servers?.length) return servers;
  return servers.map((server) => {
    const raw = server.urls ?? server.url;
    if (!raw) return server;
    const urls = (Array.isArray(raw) ? raw : [raw]).map((url) => rewriteIceUrl(url, lookup));
    return { ...server, urls };
  });
}
