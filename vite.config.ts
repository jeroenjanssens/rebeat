/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  // everything is served from the root; set BASE to build for a subdirectory
  base: process.env.BASE ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    // installable and usable offline; installing also helps keep the microphone permission (D15)
    VitePWA({
      registerType: "autoUpdate",
      // registered in main.tsx, only over http(s) (not in the desktop app)
      injectRegister: false,
      includeAssets: [
        "icon.svg",
        "apple-touch-icon.png",
        "favicon-32.png",
        "worklets/*.js",
        "popout.html",
      ],
      manifest: {
        name: "Rebeat",
        short_name: "Rebeat",
        description: "A browser music IDE: drum machine, loop station, sample library and editor.",
        theme_color: "#101114",
        background_color: "#08090b",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,wasm}"],
        // the beatbox model's runtime (and the model, which isn't matched) download only when
        // the Beatbox panel is used, then stay cached (D109)
        globIgnores: ["**/ort-wasm*.wasm", "**/model.worker-*.js"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/\/popout\.html/],
        // a new version takes over open tabs at once (they reload into it)
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /\/models\/beatbox\/|ort-wasm[^/]*\.wasm$|model\.worker-[^/]*\.js$/.test(
                url.pathname,
              ),
            handler: "CacheFirst",
            options: {
              cacheName: "rebeat-models",
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // online kits and sampled instruments: keep what was downloaded once
            urlPattern: ({ url }) =>
              /raw\.githubusercontent\.com|smpldsnds|danigb|gleitz\.github\.io|cdn/.test(url.href),
            handler: "CacheFirst",
            options: {
              cacheName: "rebeat-sounds",
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // ANALYZE=1 pnpm build  →  stats.html  (bundle treemap; P11.6)
  ...(process.env.ANALYZE ? { plugins: [visualizer({ open: true, gzipSize: true })] } : {}),
  // Tone.js and Dockview make up most of the entry bundle; editors and WASM load lazily.
  // The limit sits just above the entry chunk (≈1,220 kB): a warning means it grew.
  build: { chunkSizeWarningLimit: 1250 },
  // the beatbox model's runtime is imported on first use; found then, Vite would optimize it and
  // reload every open page (the beatbox e2e tests failed on a fresh dev server)
  optimizeDeps: { include: ["onnxruntime-web/wasm"] },
  server: {
    port: 5173,
    strictPort: true,
    // tests write files there (golden levels, results): a change would reload every open page
    watch: {
      ignored: [
        "**/e2e/**",
        "**/e2e-desktop/**",
        "**/test-results/**",
        "**/release/**",
        "**/.claude/**",
      ],
    },
  },
  preview: { port: 4173, strictPort: true },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
