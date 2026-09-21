import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

export const LOCAL_APP_ENV = "local";
export const PROD_APP_ENV = "prod";
export const LOCAL_API_URL = "http://localhost:3001";
export const PROD_API_URL = "https://relay-api-rsck.onrender.com";

export function resolveDesktopAppEnv(command: "build" | "serve") {
  const requested = (process.env.APP_ENV ?? "").trim();
  if (requested === LOCAL_APP_ENV || requested === PROD_APP_ENV) return requested;
  return command === "build" ? PROD_APP_ENV : LOCAL_APP_ENV;
}

export function desktopEnvFile(appEnv: string) {
  return appEnv === LOCAL_APP_ENV ? ".env.local" : `.env.${appEnv}`;
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isPrivateOrLoopbackHost(hostname: string) {
  if (isLoopbackHost(hostname)) return true;
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function assertDesktopApiUrl(appEnv: string, origin: string) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`RELAY_API_URL must be a valid URL (got ${origin || "(empty)"})`);
  }

  const host = url.hostname;
  if (appEnv === LOCAL_APP_ENV) {
    if (url.protocol === "https:" || !isPrivateOrLoopbackHost(host)) {
      throw new Error(
        `[desktop] Refusing APP_ENV=local with RELAY_API_URL=${origin} — expected ${LOCAL_API_URL} from .env.local`,
      );
    }
    return;
  }

  if (url.protocol !== "https:" || isPrivateOrLoopbackHost(host)) {
    throw new Error(
      `[desktop] Refusing APP_ENV=${appEnv} with RELAY_API_URL=${origin} — expected an https URL from ${desktopEnvFile(appEnv)}`,
    );
  }
}

export function loadDesktopEnv(root: string, appEnv: string) {
  const file = desktopEnvFile(appEnv);
  const path = resolve(root, file);
  if (appEnv === LOCAL_APP_ENV && !existsSync(path)) {
    writeFileSync(path, `# Local desktop runs. Packaged builds load .env.prod.\nRELAY_API_URL=${LOCAL_API_URL}\n`);
  }
  if (!existsSync(path)) {
    throw new Error(`[desktop] Missing ${file} (needed for RELAY_API_URL)`);
  }
  config({ path, override: true });
  const origin = (process.env.RELAY_API_URL ?? "").trim().replace(/\/$/, "");
  if (!origin) {
    throw new Error(`[desktop] ${file} must set RELAY_API_URL`);
  }
  assertDesktopApiUrl(appEnv, origin);
  return { appEnv, file, origin };
}
