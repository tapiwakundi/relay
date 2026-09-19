import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  preview: {
    buckets: {
      "relay-storage": { access: "private" },
    },
  },
});
