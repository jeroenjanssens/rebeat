/**
 * E2E: the keys play the Grand Piano by default, and remember what you pick (D166).
 */
import { expect, test } from "@playwright/test";

test("the keys play the Grand Piano at first, and remember what you pick (D166)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as { __REBEAT_TEST_MIC__?: boolean }).__REBEAT_TEST_MIC__ = true;
    // a fresh start: only the welcome skipped, nothing about the keys
    if (!localStorage.getItem("rebeat.settings"))
      localStorage.setItem(
        "rebeat.settings",
        JSON.stringify({ state: { onboarded: true }, version: 1 }),
      );
  });
  await page.goto("/");
  await page.getByTestId("audio-overlay").click();
  await page.locator('[data-testid="audio-status"][data-status="running"]').waitFor();
  const chip = page.getByTestId("keys-chip");
  await expect(chip).toContainText(/Grand Piano|Loading/);
  // pick "follow the selected track": after a reload it's still that
  await chip.click();
  await page.locator(".menu .menu-item", { hasText: "Follow selected track" }).click();
  await expect(chip).not.toContainText("Grand Piano");
  await page.reload();
  await page.getByTestId("audio-overlay").click();
  await page.locator('[data-testid="audio-status"][data-status="running"]').waitFor();
  await expect(page.getByTestId("keys-chip")).not.toContainText("Grand Piano");
});

test("the Keys menu opens the library: a family, then its sounds (D167)", async ({ page }) => {
  await page.addInitScript(() => {
    (window as { __REBEAT_TEST_MIC__?: boolean }).__REBEAT_TEST_MIC__ = true;
    if (!localStorage.getItem("rebeat.settings"))
      localStorage.setItem(
        "rebeat.settings",
        JSON.stringify({
          state: { onboarded: true, keysTarget: { kind: "selected" } },
          version: 1,
        }),
      );
  });
  await page.goto("/");
  await page.getByTestId("audio-overlay").click();
  await page.locator('[data-testid="audio-status"][data-status="running"]').waitFor();
  const chip = page.getByTestId("keys-chip");
  const item = (text: string) => page.locator(".menu .menu-item", { hasText: text }).first();
  await chip.click();
  await item("Library ▸").click();
  await expect(item("General MIDI ▸")).toBeVisible();
  await expect(item("Samples ▸")).toBeVisible();
  // General MIDI's sounds under their groups
  await item("General MIDI ▸").click();
  await expect(page.locator(".menu .label", { hasText: "Organ" })).toBeVisible();
  await item("← Back").click();
  await item("Synths ▸").click();
  await item("Supersaw").click();
  await expect(chip).toContainText("Supersaw");
});
