import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const projectId = "demo-swaptrack";
// Dev server port, dedicated to SwapTrack (REGISTRO D-22); playwright.config.ts reads it from here.
export const DEV_PORT = 3010;
// The emulator ports come from firebase.json only (REGISTRO D-21): one source of truth.
const emulators = JSON.parse(readFileSync(new URL("./firebase.json", import.meta.url), "utf8")).emulators as Record<string, { port: number }>;

// DEVELOPMENT ONLY (DECISIONS c3): the emulators are reached through the dev server, same origin.
const to = (emulator: string, extra: ProxyOptions = {}): ProxyOptions => ({ target: `http://127.0.0.1:${emulators[emulator].port}`, changeOrigin: true, ...extra });
const emulatorProxy: Record<string, ProxyOptions> = {
  "/identitytoolkit.googleapis.com": to("auth"),
  "/securetoken.googleapis.com": to("auth"),
  "/emulator": to("auth"),
  "/google.firestore.v1.Firestore": to("firestore", { ws: true }),
  "/v1/projects": to("firestore"),
  "/v0/b": to("storage"),
  "/__functions": to("functions", { rewrite: (p) => p.replace(/^\/__functions/, `/${projectId}/europe-west1`) }),
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./functions/src/shared", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "SwapTrack",
        short_name: "SwapTrack",
        start_url: "/",
        display: "standalone",
        background_color: "#1E1E1E",
        theme_color: "#1E1E1E",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2,wasm}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/__/, /^\/v0\//, /^\/v1\//, /^\/emulator/, /googleapis/],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: DEV_PORT,
    strictPort: true,
    allowedHosts: true,
    hmr: process.env.VITE_HMR_CLIENT_PORT ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) } : undefined,
    proxy: emulatorProxy,
  },
});
