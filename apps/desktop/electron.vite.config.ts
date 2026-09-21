import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { loadDesktopEnv, resolveDesktopAppEnv } from "./src/env";

export default defineConfig(({ command }) => {
  const appEnv = resolveDesktopAppEnv(command);
  const loaded = loadDesktopEnv(__dirname, appEnv);
  console.log(`[desktop] APP_ENV=${loaded.appEnv} file=${loaded.file} RELAY_API_URL=${loaded.origin}`);

  return {
    main: {
      plugins: [externalizeDepsPlugin({ exclude: ["@relay/shared"] })],
      define: {
        RELAY_PACKAGED_API_URL: JSON.stringify(command === "build" ? loaded.origin : ""),
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
  };
});
