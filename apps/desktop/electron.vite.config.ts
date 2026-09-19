import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
});
