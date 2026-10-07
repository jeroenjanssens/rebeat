import type { Page } from "@playwright/test";

/** Open the app with a clean slate and start audio. */
export async function openApp(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.getByTestId("audio-overlay").click();
  await page.getByTestId("audio-status").waitFor();
}
