import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

test("every panel's tab shows its icon, editor tabs too (D101)", async ({ page }) => {
  // a synth editor tab for a track, besides the panels of the default layout
  await page
    .locator("[data-track-row]", { hasText: "BASS" })
    .locator('[data-hint="dm.track.name"]')
    .click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Edit sound…" }).click();
  await expect(page.getByTestId("synth-editor")).toBeVisible();
  const tabs = page.locator(".dv-tab");
  const n = await tabs.count();
  expect(n).toBeGreaterThan(4);
  for (let i = 0; i < n; i++) await expect(tabs.nth(i).getByTestId("tab-icon")).toHaveCount(1);
});
