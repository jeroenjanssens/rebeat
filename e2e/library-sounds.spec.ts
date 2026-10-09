import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

const lib = (page: Page) => page.getByTestId("library");
const list = (page: Page) => page.getByTestId("library-list");
const go = async (page: Page, location: string) => {
  await lib(page).locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: location, exact: true }).click();
};
const filter = async (page: Page, type: string) => {
  await lib(page).locator('[data-hint="library.filter"]').click();
  await page.locator(".menu").getByRole("button", { name: type, exact: true }).click();
};

test.beforeEach(async ({ page }) => openApp(page));

test("the locations: All and yours first, then instruments, samples and kits (D95)", async ({
  page,
}) => {
  await lib(page).locator('[data-hint="library.location"]').click();
  const labels = await page.locator(".menu .menu-item").allInnerTexts();
  const names = labels.map((l) => l.trim());
  const at = (n: string) => names.indexOf(n);
  expect(names.slice(0, 5)).toEqual([
    "All",
    "Favorites",
    "Used in project",
    "Your sounds",
    "Recordings",
  ]);
  expect(at("Synths")).toBeLessThan(at("All samples"));
  expect(at("All samples")).toBeLessThan(at("909 kit"));
  expect(at("909 kit")).toBeLessThan(at("Online kits"));
});

test("the type filter picks synths, sampled instruments, one-shots or loops", async ({ page }) => {
  await go(page, "All");
  await filter(page, "Synths");
  await expect(list(page).locator("[data-instrument]")).toHaveCount(37);
  await expect(list(page).locator("[data-sample]:not([data-instrument])")).toHaveCount(0);
  await filter(page, "Sampled instruments");
  await expect(list(page).locator('[data-instrument^="synth:"]')).toHaveCount(0);
  await expect(list(page).locator('[data-instrument="smplr:piano"]')).toBeVisible();
});

test("used in project lists samples, synths and sampled instruments under headings", async ({
  page,
}) => {
  await go(page, "Used in project");
  const sections = list(page).getByTestId("library-section");
  await expect(sections).toHaveText(["Samples", "Synths"]);
});

test("a search in All finds kit sounds and instruments too", async ({ page }) => {
  await go(page, "All");
  await lib(page)
    .getByPlaceholder(/Search/)
    .fill("acid");
  await expect(list(page).locator('[data-instrument="synth:acid"]')).toBeVisible();
  await lib(page)
    .getByPlaceholder(/Search/)
    .fill("909 kick");
  await expect(list(page).locator('[data-sample="kit:909:kick"]')).toBeVisible();
});
