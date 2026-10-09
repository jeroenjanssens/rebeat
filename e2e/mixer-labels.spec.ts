import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

test("every label in the mixer's strips fits its box", async ({ page }) => {
  await page.evaluate(() =>
    (
      window as never as {
        __rebeat: { dock: { api: { getPanel(id: string): { api: { maximize(): void } } } } };
      }
    ).__rebeat.dock.api
      .getPanel("mixer")
      .api.maximize(),
  );
  const mixer = page.locator('[data-panel="mixer"]');
  await expect(mixer.getByText("Rev", { exact: true }).first()).toBeVisible();
  const overflowing = await mixer.evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>(".label, button")]
      .filter((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent),
  );
  expect(overflowing).toEqual([]);
  // the short names in the FX buttons, the full ones in their tooltips
  await expect(mixer.getByText("Dly·Rev").first()).toBeVisible();
});
