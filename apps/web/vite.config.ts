import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    force: true
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": apiProxyTarget,
      "/images": apiProxyTarget
    }
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": apiProxyTarget,
      "/images": apiProxyTarget
    }
  }
});
