/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // installable and usable offline; installing also helps keep the microphone permission (D15)
    VitePWA({
      registerType: "autoUpdate",
      // registered in main.tsx, only over http(s) (not in the desktop app)
      injectRegister: false,
      includeAssets: ["icon.svg", "apple-touch-icon.png", "favicon-32.png", "worklets/*.js", "popout.html"],
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
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,wasm}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/popout\.html/],
        runtimeCaching: [
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
  // Tone.js, React and Dockview make up most of the main chunk; editors and WASM load lazily
  build: { chunkSizeWarningLimit: 1100 },
  server: {
    port: 5173,
    strictPort: true,
    // tests write files there (golden levels, results): a change would reload every open page
    watch: { ignored: ["**/e2e/**", "**/e2e-desktop/**", "**/test-results/**", "**/release/**"] },
  },
  preview: { port: 4173, strictPort: true },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
