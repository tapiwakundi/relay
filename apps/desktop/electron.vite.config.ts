import { resolve } from "node:path";
import { config } from "dotenv";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

for (const name of [".env", ".env.local"] as const) {
  config({ path: resolve(__dirname, name), override: name === ".env.local" });
}

function packagedApiUrl(command: "build" | "serve") {
  const configured = (process.env.RELAY_API_URL ?? "").trim().replace(/\/$/, "");
  if (command !== "build") return configured;

  if (!configured) {
    throw new Error("RELAY_API_URL is required to package the desktop app (https origin of the production API).");
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("RELAY_API_URL must be a valid URL.");
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new Error("RELAY_API_URL must be an https origin for packaged builds.");
  }

  return configured;
}

export default defineConfig(({ command }) => ({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@relay/shared"] })],
    define: {
      RELAY_PACKAGED_API_URL: JSON.stringify(packagedApiUrl(command)),
    },
    resolve: {
      alias: {
        "@relay/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        "@relay/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
        "@shared": resolve(__dirname, "src/shared/ipc.ts"),
      },
    },
    plugins: [react()],
  },
}));
