import { expect, test, type Page } from "@playwright/test";
import { clickLoop, fixtureFiles, wav } from "./fixtures";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

async function openLoopInEditor(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("library-import").click();
  await (await chooser).setFiles(fixtureFiles({ "Break.wav": wav(clickLoop(100, 8)) }));
  await page.getByTestId("library-list").locator("[data-sample]").first().dblclick();
  await expect(page.getByTestId("sample-editor")).toBeVisible();
  await expect(page.getByTestId("waveform")).toBeVisible();
}

test("applies non-destructive settings to the library sample", async ({ page }) => {
  await openLoopInEditor(page);
  const editor = page.getByTestId("sample-editor");
  await editor.getByRole("button", { name: "Reverse", exact: true }).click();
  await editor.getByRole("button", { name: "Normalize", exact: true }).click();
  await editor.getByTestId("editor-apply").click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  const settings = await page.evaluate(async () => {
    const { db } = await import("/src/storage/db.ts");
    const s = await db.samples.toArray();
    return s[0].settings as { reverse: boolean; normalize: boolean };
  });
  expect(settings.reverse).toBe(true);
  expect(settings.normalize).toBe(true);
});

test("slices a loop into new drum tracks that play its rhythm", async ({ page }) => {
  await openLoopInEditor(page);
  const editor = page.getByTestId("sample-editor");
  await editor.getByRole("button", { name: "Slice", exact: true }).click();
  await editor.getByRole("button", { name: "Equal grid" }).click();
  const before = await page.locator("[data-track-row]").count();
  await editor.getByTestId("slices-to-tracks").click();
  await expect(page.locator("[data-track-row]")).toHaveCount(before + 8, { timeout: 15000 });
});
