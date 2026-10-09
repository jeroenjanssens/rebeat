import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type W = {
  __rebeat: {
    engine: { masterLevel(): number[]; clipPosition(id: string): number | null };
    store: {
      getState(): {
        project: { tracks: { id: string; name: string; kind: string }[] };
        setUi(p: object): void;
        commit(fn: (p: never) => void): void;
      };
    };
  };
};

/** The loudest the master gets within `ms`. */
const peak = (page: Page, ms = 1500) =>
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

const select = (page: Page, name: string) =>
  page.evaluate((n) => {
    const s = (window as never as W).__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.name === n)!.id });
  }, name);

test("clicking the drum machine's display plays the track once, with a playhead", async ({
  page,
}) => {
  await page.getByTestId("display-wave").click();
  await expect(page.getByTestId("display-wave").getByTestId("playhead")).toHaveCount(1);
  expect(await peak(page)).toBeGreaterThan(0.05);
});

test("clicking the Inspector's waveform plays it", async ({ page }) => {
  await page.getByTestId("inspector-wave").click();
  await expect(page.getByTestId("inspector-wave").getByTestId("playhead")).toHaveCount(1);
  expect(await peak(page)).toBeGreaterThan(0.05);
});

test("clicking an audio clip plays it once; clicking again stops it", async ({ page }) => {
  const vox = await page.evaluate(
    () =>
      (window as never as W).__rebeat.store
        .getState()
        .project.tracks.find((t) => t.kind === "audio")!.id,
  );
  const pos = () =>
    page.evaluate((id) => (window as never as W).__rebeat.engine.clipPosition(id), vox);
  const clip = page.getByTestId("clip-wave");
  await clip.scrollIntoViewIfNeeded();
  await clip.click();
  await expect.poll(pos).not.toBeNull();
  await clip.click();
  await expect.poll(pos).toBeNull();
});

test("clicking the synth editor's wave plays a note", async ({ page }) => {
  await select(page, "Bass");
  await page.evaluate(() =>
    (window as never as { __rebeat: { commands: () => { id: string; run(): void }[] } }).__rebeat
      .commands()
      .find((c) => c.id === "panel.synth-editor")!
      .run(),
  );
  await page.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();
  await page.getByTestId("synth-wave").click();
  expect(await peak(page)).toBeGreaterThan(0.02);
});

test("a sampler's waveform plays it at its root note", async ({ page }) => {
  // the kick, converted to an instrument track: a sampler of its sample
  await page
    .locator("[data-track-row]")
    .first()
    .locator('[data-hint="dm.track.name"]')
    .click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Instrument", exact: true }).click();
  await page.getByTestId("sampler-wave").click();
  await expect(page.getByTestId("sampler-wave").getByTestId("playhead")).toHaveCount(1);
  expect(await peak(page)).toBeGreaterThan(0.05);
});

test("the piano shows note names, with the octave on every C", async ({ page }) => {
  await select(page, "Chords");
  await page.evaluate(() =>
    (window as never as { __rebeat: { commands: () => { id: string; run(): void }[] } }).__rebeat
      .commands()
      .find((c) => c.id === "panel.synth-editor")!
      .run(),
  );
  const kb = page.getByTestId("keyboard");
  await expect(kb.locator('[data-key="60"]')).toHaveText("C4");
  await expect(kb.locator('[data-key="72"]')).toHaveText("C5");
  await expect(kb.locator('[data-key="62"]')).toHaveText("D");
  await expect(kb.locator('[data-key="61"]')).toHaveText("");
  // the computer key is in the tooltip
  await expect(kb.locator('[data-key="60"]')).toHaveAttribute("title", "C4 (key A)");
});
