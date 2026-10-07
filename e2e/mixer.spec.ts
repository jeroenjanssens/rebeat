import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

test("the mixer has a strip per track plus buses and master", async ({ page }) => {
  const tracks = await page.locator("[data-track-row]").count();
  await expect(page.getByTestId("mixer-strip")).toHaveCount(tracks);
  await expect(page.getByTestId("bus-strip")).toHaveCount(2);
  await expect(page.getByTestId("master-strip")).toHaveCount(1);
});

test("adds, bypasses and removes an insert effect in the inspector", async ({ page }) => {
  const insp = page.getByTestId("inspector");
  await insp.getByTestId("add-effect").click();
  await page.locator(".menu").getByRole("button", { name: "Bitcrusher", exact: true }).click();
  await expect(insp.getByText("Bitcrusher", { exact: true })).toBeVisible();
  const count = await page.evaluate(() => {
    const s = (
      window as never as {
        __rebeat: { store: { getState(): { project: { tracks: { effects: unknown[] }[] } } } };
      }
    ).__rebeat.store.getState();
    return s.project.tracks[0].effects.length;
  });
  expect(count).toBe(2);
  await insp.getByTitle("Remove").last().click();
  await expect(insp.getByText("Bitcrusher", { exact: true })).toHaveCount(0);
});

test("the master scope shows the loudness while playing", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+Alt+2");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("loudness")).toContainText(/RMS -\d/, { timeout: 5000 });
});
