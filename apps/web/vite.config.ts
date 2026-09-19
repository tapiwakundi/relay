import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, "../.."),
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host;
            if (host) proxyReq.setHeader("X-Forwarded-Host", host);
            proxyReq.setHeader("X-Forwarded-Proto", "http");
          });
        },
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  preview: {
    port: 5173,
  },
});
