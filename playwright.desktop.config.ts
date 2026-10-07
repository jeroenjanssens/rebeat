import { defineConfig } from "@playwright/test";

/** Desktop app tests: run `just build` and compile electron/ first (see `just e2e-desktop`). */
export default defineConfig({
  testDir: "e2e-desktop",
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
});
