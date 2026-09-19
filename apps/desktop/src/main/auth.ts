import { config } from "dotenv";
import { resolve } from "node:path";
import { app } from "electron";
import { createAuthClient } from "better-auth/client";
import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { APP_ID, AUTH_SCHEME } from "../shared/ipc";

app.setName("Relay");
app.setAppUserModelId(APP_ID);

for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../.env.local"),
]) {
  config({ path, override: false });
}

function apiOrigin() {
  const configured = process.env.RELAY_API_URL || process.env.BETTER_AUTH_URL || "http://localhost:3001";
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
