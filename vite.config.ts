import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { ensureLocalApiToken } from "./server/local-auth.mjs";

const devApiToken = ensureLocalApiToken(resolve("data"));

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5177,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4317",
        headers: { authorization: `Bearer ${devApiToken}` }
      }
    }
  }
});

