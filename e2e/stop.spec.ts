import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

type W = {
  __rebeat: {
    engine: { masterLevel(): number[] };
    store: { getState(): { playing: boolean } };
  };
};

/** The loudest master level over `ms`, sampled every animation frame. */
const loudest = (page: Page, ms: number) =>
  page.evaluate(async (ms) => {
    const r = (window as never as W).__rebeat;
    let max = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      max = Math.max(max, ...r.engine.masterLevel());
      await new Promise(requestAnimationFrame);
    }
    return max;
  }, ms);

async function playAWhile(page: Page) {
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.evaluate(() => (window as never as W).__rebeat.store.getState().playing))
    .toBe(true);
  // the demo's chords go to the reverb, the vocal to the delay: tails to cut
  await expect.poll(() => loudest(page, 300), { timeout: 8000 }).toBeGreaterThan(0.05);
  await page.waitForTimeout(1500);
}

test.beforeEach(async ({ page }) => openApp(page));

test("Space stops everything at once: no notes, no reverb or delay tails (D99)", async ({
  page,
}) => {
  await playAWhile(page);
  await page.keyboard.press("Space");
  // a moment for the fade (5 ms) and the analyser's window (23 ms)
  await page.waitForTimeout(60);
  // −80 dB
  expect(await loudest(page, 1200)).toBeLessThan(0.0001);
});

test("playing again right after a stop starts from silence, without the old tails", async ({
  page,
}) => {
  await playAWhile(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  await page.keyboard.press("Space");
  // the first notes start 60 ms after play: before that, nothing of what played before
  expect(await loudest(page, 40)).toBeLessThan(0.0001);
});

test("with the setting on, the tails ring out after stop", async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      "rebeat.settings",
      JSON.stringify({ state: { onboarded: true, ringOutOnStop: true }, version: 1 }),
    ),
  );
  await page.reload();
  await openApp(page);
  await playAWhile(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(60);
  expect(await loudest(page, 400)).toBeGreaterThan(0.001);
});
