import { execFileSync } from "node:child_process";

const cache = new Map<string, string | null>();

function ipv4s(text: string) {
  return [...text.matchAll(/(?:ip_address|Address):\s*(\d+\.\d+\.\d+\.\d+)/g)]
    .map((match) => match[1])
    .filter((ip) => ip !== "127.0.0.1");
}

export function lookupHostSync(host: string): string | null {
  if (!/^(?:[a-z0-9-]+\.)*livekit\.cloud$/i.test(host)) return null;
  const cached = cache.get(host);
  if (cached) return cached;
  let ip: string | null = null;
  try {
    const command = process.platform === "darwin" ? "dscacheutil" : "nslookup";
    const args = process.platform === "darwin" ? ["-q", "host", "-a", "name", host] : [host];
    const out = execFileSync(command, args, { encoding: "utf8", timeout: 3000 });
    ip = ipv4s(out)[0] ?? null;
  } catch {
    ip = null;
  }
  cache.set(host, ip);
  return ip;
}
