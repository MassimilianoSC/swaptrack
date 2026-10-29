import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const projectId = "demo-swaptrack";

// DEVELOPMENT ONLY (DECISIONS c3): the emulators are reached through the dev server, same origin.
const to = (port: number, extra: ProxyOptions = {}): ProxyOptions => ({ target: `http://127.0.0.1:${port}`, changeOrigin: true, ...extra });
const emulatorProxy: Record<string, ProxyOptions> = {
  "/identitytoolkit.googleapis.com": to(9099),
  "/securetoken.googleapis.com": to(9099),
  "/emulator": to(9099),
  "/google.firestore.v1.Firestore": to(8180, { ws: true }),
  "/v1/projects": to(8180),
  "/v0/b": to(9199),
  "/__functions": to(5001, { rewrite: (p) => p.replace(/^\/__functions/, `/${projectId}/europe-west1`) }),
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
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    hmr: process.env.VITE_HMR_CLIENT_PORT ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) } : undefined,
    proxy: emulatorProxy,
  },
});
