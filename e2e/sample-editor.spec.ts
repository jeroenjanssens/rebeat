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
    // a path the browser resolves (the dev server serves sources), not the test runner
    const path = "/src/storage/db.ts";
    const { db } = await import(/* @vite-ignore */ path);
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

test("Apply after an audio edit changes the sample in place", async ({ page }) => {
  await openLoopInEditor(page);
  const editor = page.getByTestId("sample-editor");
  const db = async () =>
    page.evaluate(async () => {
      const path = "/src/storage/db.ts";
      const { db } = await import(/* @vite-ignore */ path);
      const s = await db.samples.toArray();
      return s.map((x: { id: string; duration: number }) => ({ id: x.id, duration: x.duration }));
    });
  const [before] = await db();
  // select the first second and crop to it
  const wave = page.getByTestId("waveform");
  const box = (await wave.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await editor.getByRole("button", { name: "Crop", exact: true }).click();
  await editor.getByTestId("editor-apply").click();
  await expect(page.getByText(/^Applied/).first()).toBeVisible();
  const after = await db();
  expect(after).toHaveLength(1);
  expect(after[0].id).toBe(before.id);
  expect(after[0].duration).toBeLessThan(before.duration * 0.5);
  // the editor stays on the same sample
  await expect(page.getByTestId("sample-editor")).toBeVisible();
});

test("re-importing the original file after an in-place edit adds it again", async ({ page }) => {
  const files = fixtureFiles({ "Break.wav": wav(clickLoop(100, 8)) });
  const importIt = async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("library-import").click();
    await (await chooser).setFiles(files);
  };
  await importIt();
  await page.getByTestId("library-list").locator("[data-sample]").first().dblclick();
  const editor = page.getByTestId("sample-editor");
  await editor.getByRole("button", { name: "Strip silence", exact: true }).click();
  await editor.getByTestId("editor-apply").click();
  await expect(page.getByText(/^Applied/).first()).toBeVisible();
  await importIt();
  await expect(page.getByTestId("library-list").locator("[data-sample]")).toHaveCount(2);
});
