import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // CI runners render audio in software and are much slower than a laptop
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    actionTimeout: process.env.CI ? 30_000 : 0,
    // the fake microphone (see the launch flags) needs the permission granted up front
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 950 } } }],
  webServer: {
    command: "pnpm vite --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
  },
});
