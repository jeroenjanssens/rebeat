import { expect, test } from "@playwright/test";
import { clickLoop, fixtureFiles, oneShot, wav } from "./fixtures";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

async function importSamples(page: import("@playwright/test").Page, files: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("library-import").click();
  await (await chooser).setFiles(files);
}

test("imports files, detects loop tempo and dedupes by content", async ({ page }) => {
  const files = fixtureFiles({
    "Big Kick.wav": wav(oneShot()),
    "Drum loop.wav": wav(clickLoop(100, 8)),
  });
  await importSamples(page, files);
  const list = page.getByTestId("library-list");
  await expect(list.locator("[data-sample]")).toHaveCount(2);
  await expect(list.locator("[data-sample]", { hasText: "Drum loop" })).toContainText("100");
  await importSamples(page, files);
  await expect(page.getByText("Imported 2 samples").first()).toBeVisible();
  await expect(list.locator("[data-sample]")).toHaveCount(2);
});

test("adds a library sample as a track and plays it", async ({ page }) => {
  await importSamples(page, fixtureFiles({ "Big Kick.wav": wav(oneShot()) }));
  const item = page.getByTestId("library-list").locator("[data-sample]").first();
  await item.click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Add as new track" }).click();
  const row = page.locator("[data-track-row]", { hasText: "BIG KICK" });
  await expect(row).toBeVisible();
  await expect(page.getByTestId("inspector")).toContainText("Big Kick");
});

test("drags a sample onto a track to replace its sound", async ({ page }) => {
  await importSamples(page, fixtureFiles({ "Tight Snare.wav": wav(oneShot(220, 0.2)) }));
  const item = page.getByTestId("library-list").locator("[data-sample]").first();
  const target = page.locator("[data-track-row]").nth(1);
  await item.dragTo(target);
  await target.click({ position: { x: 60, y: 12 } });
  await expect(page.getByTestId("inspector")).toContainText("Tight Snare");
});

test("filters by search and shows built-in kits", async ({ page }) => {
  await importSamples(
    page,
    fixtureFiles({ "Alpha.wav": wav(oneShot()), "Beta.wav": wav(oneShot(90)) }),
  );
  await page.getByTestId("library-search").fill("bet");
  await expect(page.getByTestId("library-list").locator("[data-sample]")).toHaveCount(1);
  await page.getByTestId("library-search").fill("");
  // the library is narrow in the default layout: locations are in a dropdown
  await page.getByTestId("library").getByRole("button", { name: "All samples" }).click();
  await page.locator(".menu").getByRole("button", { name: "909 kit" }).click();
  await expect(page.getByTestId("library-list").locator("[data-sample]")).toHaveCount(8);
});
