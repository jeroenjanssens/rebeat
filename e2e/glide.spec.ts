import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type W = {
  __rebeat: {
    perf: { getState(): { filter: number } };
    store: {
      getState(): {
        past: unknown[];
        project: { tracks: { params: Record<string, number> }[] };
      };
    };
    commands: () => { id: string; run(): void }[];
  };
};

/** Values of `read` every frame for `ms` after `act`. */
async function sample(page: Page, read: string, ms: number) {
  return page.evaluate(
    async ({ read, ms }) => {
      const r = (window as never as W).__rebeat;
      const get = new Function("r", `return ${read}`) as (r: W["__rebeat"]) => number;
      const out: number[] = [];
      const end = performance.now() + ms;
      while (performance.now() < end) {
        out.push(get(r));
        await new Promise((res) => requestAnimationFrame(res));
      }
      return out;
    },
    { read, ms },
  );
}

async function drag(page: Page, selector: string, dy: number) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 10 });
  await page.mouse.up();
}

test("double-clicking the performance filter glides back to open", async ({ page }) => {
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "panel.performance")!
      .run(),
  );
  const knob = '[data-hint="perf.filter"] svg';
  await page.locator(knob).waitFor();
  await page.locator(knob).first().scrollIntoViewIfNeeded();
  await drag(page, knob, -120);
  const high = await page.evaluate(() => (window as never as W).__rebeat.perf.getState().filter);
  expect(high).toBeGreaterThan(0.9);

  const [values] = await Promise.all([
    sample(page, "r.perf.getState().filter", 600),
    page.locator(knob).first().dblclick(),
  ]);
  const between = values.filter((v) => v < high - 0.02 && v > 0.52);
  // several in-between frames, not a jump
  expect(between.length).toBeGreaterThan(3);
  expect(values.at(-1)).toBe(0.5);
});

test("a glide is one undo step", async ({ page }) => {
  const knob = '[data-panel="drum-machine"] [data-hint="param.sound.tune"] svg';
  await drag(page, knob, -60);
  const tune = () =>
    page.evaluate(
      () => (window as never as W).__rebeat.store.getState().project.tracks[0].params["sound.tune"],
    );
  expect(await tune()).toBeGreaterThan(0.6);
  await page.waitForTimeout(700);
  const before = await page.evaluate(
    () => (window as never as W).__rebeat.store.getState().past.length,
  );
  await page.locator(knob).first().dblclick();
  await expect.poll(tune).toBe(0.5);
  await page.waitForTimeout(400);
  const after = await page.evaluate(
    () => (window as never as W).__rebeat.store.getState().past.length,
  );
  expect(after).toBe(before + 1);
});
