import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// In dev the browser talks to Vite, and Vite passes /api and /ws to a real ZeroClaw:
// ZEROCLAW_URL, from the shell or .env.local, default a ZeroClaw on this machine.
// In production nginx does the same job (deploy/nginx.conf.template).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = process.env.ZEROCLAW_URL ?? env.ZEROCLAW_URL ?? "http://127.0.0.1:42617";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5273,
      proxy: {
        "/api": { target, changeOrigin: true },
        "/ws": { target, changeOrigin: true, ws: true },
      },
    },
  };
});
