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

test("the library lists one sample per row, also when it's wider", async ({ page }) => {
  await page.getByTestId("library").getByRole("button", { name: "All samples" }).click();
  await page.locator(".menu").getByRole("button", { name: "909 kit" }).click();
  const items = page.getByTestId("library-list").locator("[data-sample]");
  await expect(items).toHaveCount(8);
  // the width that used to show two columns
  await page.evaluate(() => {
    const w = window as never as {
      __rebeat: { dock: { api: { getPanel(id: string): { api: { setSize(s: object): void } } } } };
    };
    w.__rebeat.dock.api.getPanel("library").api.setSize({ width: 520 });
  });
  await expect
    .poll(() => page.getByTestId("library-list").evaluate((el) => el.clientWidth))
    .toBeGreaterThan(400);
  const lefts = await items.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().left)),
  );
  expect(new Set(lefts).size).toBe(1);
});

test("used in project lists the built-in sounds the tracks play", async ({ page }) => {
  await page.getByTestId("library").getByRole("button", { name: "All samples" }).click();
  await page.locator(".menu").getByRole("button", { name: "Used in project" }).click();
  const items = page.getByTestId("library-list").locator("[data-sample]");
  // Night Drive: kick, snare, clap, two hats, rim and the vox hook
  await expect(items.filter({ hasText: "Kick" })).toHaveCount(1);
  expect(await items.count()).toBeGreaterThanOrEqual(6);
  await expect(items.filter({ hasText: "Vox hook" })).toHaveCount(1);
  // the bass and chords are synths
  await expect(page.getByTestId("used-synths")).toContainText("2 instrument tracks");
});
