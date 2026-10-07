import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

test("shows the transport bar and the default panels", async ({ page }) => {
  await expect(page.getByTestId("transport")).toBeVisible();
  await expect(page.getByTestId("audio-overlay")).toHaveCount(0);
  for (const panel of ["drum-machine", "library", "inspector", "mixer"])
    await expect(page.locator(`[data-panel="${panel}"]`)).toBeVisible();
});

test("plays and stops with the space bar", async ({ page }) => {
  const play = page.getByTestId("play");
  await expect(play).toHaveText(/Play/);
  await page.keyboard.press("Space");
  await expect(play).toHaveText(/Stop/);
  await page.keyboard.press("Space");
  await expect(play).toHaveText(/Play/);
});

test("opens the command palette and runs a command", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+K");
  const input = page.getByPlaceholder("Type a command…");
  await expect(input).toBeVisible();
  await input.fill("theme midnight");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
});

test("changes the theme in the settings and keeps it after a reload", async ({ page }) => {
  await page.getByTestId("open-settings").click();
  await page.getByTestId("theme-select").selectOption("ember");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
});

test("maximizes the active panel and restores it", async ({ page }) => {
  await page.locator('[data-panel="drum-machine"]').click({ position: { x: 600, y: 20 } });
  await page.keyboard.press("ControlOrMeta+Shift+M");
  await expect(page.locator('[data-panel="library"]')).toBeHidden();
  await page.keyboard.press("ControlOrMeta+Shift+M");
  await expect(page.locator('[data-panel="library"]')).toBeVisible();
});

test("toggles a step pad and undoes it", async ({ page }) => {
  const pad = page.locator('[data-panel="drum-machine"] [data-pad][data-i="1"]').first();
  await expect(pad).not.toHaveClass(/\bon\b/);
  await pad.click();
  await expect(pad).toHaveClass(/\bon\b/);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(pad).not.toHaveClass(/\bon\b/);
});

test("shows the welcome on the first run only", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/");
  await page.getByTestId("audio-overlay").click();
  await page.getByTestId("welcome-demo").click();
  await expect(page.getByTestId("welcome-demo")).toHaveCount(0);
  await page.reload();
  await page.getByTestId("audio-overlay").click();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("welcome-demo")).toHaveCount(0);
  await page.close();
});
