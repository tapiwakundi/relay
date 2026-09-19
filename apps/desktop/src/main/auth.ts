import { config } from "dotenv";
import { resolve } from "node:path";
import { app } from "electron";
import { createAuthClient } from "better-auth/client";
import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { APP_ID, AUTH_SCHEME } from "../shared/ipc";

app.setName("Relay");
app.setAppUserModelId(APP_ID);

if (!app.isPackaged) {
  const appDir = resolve(__dirname, "../..");
  config({ path: resolve(appDir, ".env") });
  config({ path: resolve(appDir, ".env.local"), override: true });
}

function apiOrigin() {
  if (app.isPackaged) {
    const packaged = RELAY_PACKAGED_API_URL.replace(/\/$/, "");
    if (!packaged) {
      throw new Error("This Relay build is missing RELAY_API_URL.");
    }
    return packaged;
  }
  const configured = process.env.RELAY_API_URL || "http://localhost:3001";
  return configured.replace(/\/$/, "");
}

export const API_ORIGIN = apiOrigin();

export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  plugins: [
    electronClient({
      signInURL: `${API_ORIGIN}/desktop/callback`,
      protocol: { scheme: AUTH_SCHEME },
      storage: storage(),
      userImageProxy: { enabled: false },
    }),
  ],
});
