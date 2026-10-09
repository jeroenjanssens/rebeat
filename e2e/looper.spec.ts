import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type T = { name: string; sound?: { sampleId?: string }; layers?: unknown[] };
const tracks = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as never as { __rebeat: { store: { getState(): { project: { tracks: T[] } } } } }
    ).__rebeat.store.getState();
    return JSON.parse(JSON.stringify(s.project.tracks)) as T[];
  });

test("records a loop on the armed track, then an overdub layer", async ({ page }) => {
  await page.getByTestId("project-name").click();
  await page.getByRole("button", { name: /Loop station/ }).click();
  await expect(page.getByTestId("project-name")).toContainText("Loop station");
  await page.evaluate(() => {
    const s = (
      window as never as {
        __rebeat: {
          store: {
            getState(): { setUi(p: object): void; commit(f: (p: { bpm: number }) => void): void };
          };
        };
      }
    ).__rebeat.store.getState();
    s.commit((p) => void (p.bpm = 240));
    s.setUi({ loopBars: 1 });
  });
  await page.keyboard.press("r");
  await expect
    .poll(async () => (await tracks(page)).find((t) => t.name === "Loop 1")?.sound?.sampleId, {
      timeout: 15000,
    })
    .toBeTruthy();
  await expect(page.getByTestId("play")).toHaveText(/Stop/);
  await page.keyboard.press("r");
  await expect
    .poll(async () => (await tracks(page)).find((t) => t.name === "Loop 1")?.layers?.length, {
      timeout: 15000,
    })
    .toBe(1);
});

test("records into the library's Recordings folder", async ({ page }) => {
  const lib = page.getByTestId("library");
  await lib.getByRole("button", { name: "All samples" }).click();
  await page.locator(".menu").getByRole("button", { name: "Recordings" }).click();
  await page.getByTestId("rec-start").click();
  await expect(page.getByTestId("rec-stop")).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByTestId("rec-stop").click();
  await expect(page.getByTestId("library-list").locator("[data-sample]")).toHaveCount(1, {
    timeout: 10000,
  });
});
