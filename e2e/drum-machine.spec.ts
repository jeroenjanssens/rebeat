import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

const dm = (page: Page) => page.locator('[data-panel="drum-machine"]');

async function peakWhilePlaying(page: Page, ms = 1200) {
  return page.evaluate(async (ms) => {
    const r = (window as never as { __rebeat: { engine: { masterLevel(): number[] } } }).__rebeat;
    let peak = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      peak = Math.max(peak, ...r.engine.masterLevel());
      await new Promise((res) => setTimeout(res, 20));
    }
    return peak;
  }, ms);
}

test("makes sound when playing and is silent when stopped", async ({ page }) => {
  await page.waitForFunction(() => "__rebeat" in window);
  await page.keyboard.press("Space");
  expect(await peakWhilePlaying(page)).toBeGreaterThan(0.1);
  await page.keyboard.press("Space");
  // reverb and delay tails ring out after stopping
  await expect.poll(() => peakWhilePlaying(page, 300), { timeout: 10000 }).toBeLessThan(0.01);
});

test("moves the step cursor with the arrow keys and toggles with Enter", async ({ page }) => {
  await page.keyboard.press("ArrowRight"); // shows the cursor
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const cursor = dm(page).locator(".pad.cursor");
  await expect(cursor).toHaveCount(1);
  await expect(cursor).toHaveAttribute("data-i", "2");
  const wasOn = await cursor.evaluate((el) => el.classList.contains("on"));
  await page.keyboard.press("Enter");
  await expect(cursor).toHaveClass(wasOn ? /^(?!.*\bon\b)/ : /\bon\b/);
  await page.keyboard.press("Escape");
  await expect(dm(page).locator(".pad.cursor")).toHaveCount(0);
});

test("writes steps from keyboard pads in the pad view (step entry)", async ({ page }) => {
  await page.keyboard.press("V");
  await expect(dm(page).locator("[data-pad-track]").first()).toBeVisible();
  // Z = pad 1 (kick); place the cursor on the kick track first
  await dm(page).locator("[data-pad-track]").first().click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const before = await dm(page).locator(".pad.on").count();
  await page.keyboard.press("z");
  await expect.poll(() => dm(page).locator(".pad.on").count()).not.toBe(before);
});

test("converts a track type from its context menu", async ({ page }) => {
  const header = page.locator("[data-track-row] >> text=KICK").first();
  await header.click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Instrument", exact: true }).click();
  await expect(page.locator("[data-track-row]").first().locator(".note").first()).toBeVisible();
});

test("sets a parameter lock on a selected step", async ({ page }) => {
  const pad = dm(page).locator('[data-pad][data-i="0"]').first();
  await pad.click({ modifiers: ["Alt"] });
  await dm(page).getByRole("button", { name: "Sound", exact: true }).click();
  const tune = dm(page).getByText("Tune", { exact: true }).locator("..").locator("svg");
  await tune.hover();
  await page.mouse.wheel(0, -100);
  const locks = await page.evaluate(() => {
    const s = (
      window as never as {
        __rebeat: {
          store: {
            getState(): {
              project: {
                tracks: { id: string }[];
                slots: { id: string; patternId: string }[];
                patterns: Record<
                  string,
                  { lanes: Record<string, { steps: { locks?: Record<string, number> }[] }> }
                >;
              };
              editSlotId: string;
            };
          };
        };
      }
    ).__rebeat.store.getState();
    const pat = s.project.patterns[s.project.slots.find((x) => x.id === s.editSlotId)!.patternId];
    return pat.lanes[s.project.tracks[0].id].steps[0].locks;
  });
  expect(locks?.["sound.tune"]).toBeGreaterThan(0.5);
  await expect(pad.locator(".lock")).toBeVisible();
});

test("right-drag erases steps; right-click opens the step menu", async ({ page }) => {
  const kickPads = dm(page).locator("[data-track-row]").first().locator("[data-pad]");
  // the intro kick plays on steps 0, 4, 8, 12
  const a = (await kickPads.nth(0).boundingBox())!;
  const b = (await kickPads.nth(4).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await expect(kickPads.nth(0)).not.toHaveClass(/\bon\b/);
  await expect(kickPads.nth(4)).not.toHaveClass(/\bon\b/);
  await kickPads.nth(8).click({ button: "right" });
  await expect(page.locator(".menu").getByText("Probability")).toBeVisible();
});

test("double-click in a lane resets a step; Alt+double-click the whole lane", async ({ page }) => {
  type S = {
    project: {
      tracks: { id: string }[];
      slots: { id: string; patternId: string }[];
      patterns: Record<
        string,
        { lanes: Record<string, { steps: { velocity: number; on: boolean }[] }> }
      >;
    };
    editSlotId: string;
    past: unknown[];
    setUi(p: object): void;
  };
  const read = () =>
    page.evaluate(() => {
      const s = (
        window as never as { __rebeat: { store: { getState(): S } } }
      ).__rebeat.store.getState();
      const slot = s.project.slots.find((x) => x.id === s.editSlotId)!;
      const steps = s.project.patterns[slot.patternId].lanes[s.project.tracks[0].id].steps;
      return { v: steps.filter((x) => x.on).map((x) => x.velocity), undo: s.past.length };
    });
  await page.evaluate(() =>
    (window as never as { __rebeat: { store: { getState(): S } } }).__rebeat.store
      .getState()
      .setUi({ lanes: { velocity: true } }),
  );
  const bars = dm(page).locator('[data-hint="dm.param-lane.bars"] [data-lane-i]');
  const first = (await read()).v.length;
  expect(first).toBeGreaterThan(1);
  // draw low velocities on every lit step
  const box = (await bars.first().boundingBox())!;
  const last = (await bars.nth(15).boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(last.x + 4, last.y + last.height - 3, { steps: 20 });
  await page.mouse.up();
  await expect.poll(async () => Math.max(...(await read()).v)).toBeLessThan(0.3);

  // the kick's first step is on
  await page.waitForTimeout(700);
  const before = (await read()).undo;
  await bars.first().dblclick();
  await expect.poll(async () => (await read()).v[0]).toBeCloseTo(0.8);
  const after = await read();
  expect(Math.max(...after.v.slice(1))).toBeLessThan(0.3);
  expect(after.undo).toBe(before + 1);

  await page.waitForTimeout(700);
  await bars.nth(4).dblclick({ modifiers: ["Alt"] });
  await expect.poll(async () => Math.min(...(await read()).v)).toBeCloseTo(0.8);
  for (const v of (await read()).v) expect(v).toBeCloseTo(0.8);
});
