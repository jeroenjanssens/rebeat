import { expect, test, type Page } from "@playwright/test";
import { midiKeyboard, openApp } from "./helpers";

type W = {
  __midi: (d: number[]) => void;
  __rebeat: {
    engine: {
      masterLevel(): number[];
      trackSynth(
        t: unknown,
      ): { controls: Record<string, number>; modulation(): number[] | null } | undefined;
    };
    store: {
      getState(): {
        project: { tracks: { id: string; name: string; mode: string }[] };
        setUi(p: object): void;
        commit(fn: (p: { tracks: { name: string; sound?: unknown }[] }) => void): void;
      };
    };
    commands: () => { id: string; run(): void }[];
  };
};

const selectBass = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.name === "Bass")!.id });
  });

const controls = (page: Page) =>
  page.evaluate(() => {
    const r = (window as never as W).__rebeat;
    const bass = r.store.getState().project.tracks.find((t) => t.name === "Bass");
    return r.engine.trackSynth(bass)!.controls;
  });

const peak = (page: Page, ms = 400) =>
  page.evaluate(async (ms) => {
    const r = (window as never as W).__rebeat;
    let max = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      max = Math.max(max, ...r.engine.masterLevel());
      await new Promise((res) => setTimeout(res, 20));
    }
    return max;
  }, ms);

test("pitch bend, the mod wheel and aftertouch from MIDI reach the synth", async ({ page }) => {
  await midiKeyboard(page);
  await selectBass(page);
  const send = (d: number[]) => page.evaluate((d) => (window as never as W).__midi(d), d);
  await send([0xe0, 0x7f, 0x7f]); // bend fully up
  await send([0xb0, 1, 127]); // mod wheel up
  await send([0xd0, 64]); // channel pressure
  await expect.poll(() => controls(page)).toMatchObject({ pitchbend: 1, modwheel: 1 });
  expect((await controls(page)).aftertouch).toBeCloseTo(64 / 127);
  await send([0xe0, 0x00, 0x40]); // back to the middle
  await expect.poll(async () => (await controls(page)).pitchbend).toBeCloseTo(0, 2);
});

test("the sustain pedal keeps released notes sounding until it comes up", async ({ page }) => {
  await midiKeyboard(page);
  await selectBass(page);
  const send = (d: number[]) => page.evaluate((d) => (window as never as W).__midi(d), d);
  await send([0xb0, 64, 127]); // pedal down
  await send([0x90, 48, 100]);
  await page.waitForTimeout(150);
  await send([0x80, 48, 0]);
  await page.waitForTimeout(600);
  // the acid bass is short when released: with the pedal down it still sounds
  expect(await peak(page)).toBeGreaterThan(0.02);
  await send([0xb0, 64, 0]); // pedal up
  await expect.poll(() => peak(page, 200), { timeout: 5000 }).toBeLessThan(0.005);
});

test("the editor's wheels and knob rings show modulation", async ({ page }) => {
  await openApp(page);
  await selectBass(page);
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "panel.synth-editor")!
      .run(),
  );
  const editor = page.getByTestId("synth-editor");
  await editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();
  // a matrix slot: LFO 1 → filter 1 cutoff (the last one: the first may be Movement's)
  const matrix = editor.getByTestId("mod-matrix");
  await matrix.locator('[data-hint="synth.matrix.source"]').last().selectOption("lfo1");
  await matrix.locator('[data-hint="synth.matrix.dest"]').last().selectOption("filter1.cutoff");
  await matrix.getByLabel("Slot 8 amount").fill("0.5");
  const cutoff = editor.locator('[data-hint="synth.filters.cutoff"]').first();
  await expect(cutoff.locator("[data-mod-ring]")).toHaveCount(1);
  // while a note plays, the live dot shows where the cutoff is now
  await page.mouse.move(0, 0);
  const key = editor.getByTestId("keyboard").locator('[data-key="36"]');
  const b = (await key.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 8);
  await page.mouse.down();
  await expect(cutoff.locator("[data-live-dot]")).toHaveCSS("opacity", "1");
  await page.mouse.up();

  // the bend wheel springs back; the mod wheel stays
  const mod = editor.getByTestId("mod-wheel");
  const m = (await mod.boundingBox())!;
  await page.mouse.click(m.x + m.width / 2, m.y + 2);
  const bend = editor.getByTestId("bend-wheel");
  const w = (await bend.boundingBox())!;
  await page.mouse.move(w.x + w.width / 2, w.y + 2);
  await page.mouse.down();
  await expect.poll(async () => (await controls(page)).pitchbend).toBeGreaterThan(0.9);
  await page.mouse.up();
  await expect.poll(async () => (await controls(page)).pitchbend).toBe(0);
  expect((await controls(page)).modwheel).toBeGreaterThan(0.9);
});
