import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { fixtureFiles } from "./fixtures";
import { openApp } from "./helpers";

type Patch = {
  osc: { on: boolean; shape: number; retrigger: boolean; level: number }[];
  filters: { cutoff: number; reso: number }[];
  output: { volume: number };
};
type T = {
  id: string;
  name: string;
  params: Record<string, number>;
  instrument?: { preset: string; from?: string; name?: string; patch?: Patch };
};
type W = {
  __rebeat: {
    store: {
      getState(): { project: { tracks: T[] }; setUi(p: object): void };
    };
    synths: { id: string; patch: Patch }[];
    commands: () => { id: string; run(): void }[];
  };
};

const bass = (page: Page) =>
  page.evaluate(() =>
    (window as never as W).__rebeat.store.getState().project.tracks.find((t) => t.name === "Bass")!,
  );
const factory = (page: Page) =>
  page.evaluate(() => (window as never as W).__rebeat.synths.find((s) => s.id === "acid")!.patch);

async function openAdvanced(page: Page) {
  await page.evaluate(() => {
    const r = (window as never as W).__rebeat;
    const s = r.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.name === "Bass")!.id });
    r.commands()
      .find((c) => c.id === "panel.synth-editor")!
      .run();
  });
  const editor = page.getByTestId("synth-editor");
  await editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();
  return editor;
}
const menu = async (page: Page, item: string) => {
  await page.getByTestId("synth-more").click();
  await page.locator(".menu").getByRole("button", { name: item }).click();
};

test.beforeEach(async ({ page }) => openApp(page));

test("A/B compares two versions of the sound", async ({ page }) => {
  const editor = await openAdvanced(page);
  const ab = editor.getByTestId("synth-ab");
  await expect(ab.getByRole("button", { name: "A" })).toHaveAttribute("data-active", "true");
  const original = (await factory(page)).osc[0].retrigger;
  await ab.getByRole("button", { name: "B" }).click();
  await editor.locator('[data-hint="synth.osc.retrigger"]').first().click();
  await expect
    .poll(async () => (await bass(page)).instrument?.patch?.osc[0].retrigger)
    .toBe(!original);
  await ab.getByRole("button", { name: "A" }).click();
  await expect
    .poll(async () => (await bass(page)).instrument?.patch?.osc[0].retrigger)
    .toBe(original);
  await ab.getByRole("button", { name: "B" }).click();
  await expect
    .poll(async () => (await bass(page)).instrument?.patch?.osc[0].retrigger)
    .toBe(!original);
});

test("randomize, only the sections you leave on, and init", async ({ page }) => {
  await openAdvanced(page);
  const before = await factory(page);
  await page.getByTestId("synth-more").click();
  const r = page.getByTestId("randomize");
  // only the filters
  for (const g of ["Oscillators", "Envelopes", "LFOs", "Matrix"])
    await r.getByRole("button", { name: g, exact: true }).click();
  await r.getByLabel("Randomize amount").fill("1");
  await r.getByRole("button", { name: "Randomize" }).click();
  await expect.poll(async () => (await bass(page)).instrument?.patch).toBeTruthy();
  const after = (await bass(page)).instrument!.patch!;
  expect(after.osc[0].shape).toBe(before.osc[0].shape);
  expect(after.output.volume).toBe(before.output.volume);
  expect(after.filters[0].reso).not.toBe(before.filters[0].reso);
  // the choices are remembered
  await page.getByTestId("synth-more").click();
  await expect(r.getByRole("button", { name: "Oscillators", exact: true })).toHaveAttribute(
    "data-active",
    "false",
  );
  await page.keyboard.press("Escape");
  // init: a plain saw
  await menu(page, "Init patch");
  await expect.poll(async () => (await bass(page)).instrument?.patch?.filters[0].cutoff).toBe(8000);
  expect((await bass(page)).instrument?.patch?.osc[0].shape).toBe(2);
});

test("copy a block's settings to another of its kind", async ({ page }) => {
  const editor = await openAdvanced(page);
  await editor.locator('[data-section="Oscillator 1"] [data-hint="synth.copy"]').click();
  await expect(
    editor.locator('[data-section="Oscillator 1"] [data-hint="synth.paste"]'),
  ).toHaveCount(0);
  await editor.locator('[data-section="Oscillator 2"] [data-hint="synth.paste"]').click();
  await expect.poll(async () => (await bass(page)).instrument?.patch?.osc[1].on).toBe(true);
  const p = (await bass(page)).instrument!.patch!;
  expect(p.osc[1].shape).toBe(p.osc[0].shape);
  expect(p.osc[1].level).toBe(p.osc[0].level);
  // filters only paste on filters
  await expect(editor.locator('[data-section="Filter 1"] [data-hint="synth.paste"]')).toHaveCount(
    0,
  );
});

test("export a synth as .rbsynth and import it, also into the library", async ({ page }) => {
  await openAdvanced(page);
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState() as unknown as {
      commit(fn: (p: { tracks: T[] }) => void): void;
    };
    s.commit((p) => void (p.tracks.find((t) => t.name === "Bass")!.params["sound.macro1"] = 0.9));
  });
  const download = page.waitForEvent("download");
  await menu(page, "Export .rbsynth…");
  const file = await download;
  expect(file.suggestedFilename()).toBe("Mono · Acid Bass.rbsynth");
  const data = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(data).toMatchObject({ format: "rebeat-synth", version: 1, name: "Mono · Acid Bass" });
  expect(data.macros[0]).toBe(0.9);

  // the editor's Import puts it on the track (and in Your instruments)
  const [path] = fixtureFiles({
    "Squelch.rbsynth": Buffer.from(JSON.stringify({ ...data, name: "Squelch" })),
  });
  const chooser = page.waitForEvent("filechooser");
  await menu(page, "Import .rbsynth…");
  await (await chooser).setFiles(path);
  await expect.poll(async () => (await bass(page)).instrument?.name).toBe("Squelch");
  expect((await bass(page)).instrument?.from).toMatch(/^user:/);
  expect((await bass(page)).params["sound.macro1"]).toBe(0.9);

  // the library's import takes them too
  const [other] = fixtureFiles({
    "Wobble.rbsynth": Buffer.from(JSON.stringify({ ...data, name: "Wobble" })),
  });
  const libChooser = page.waitForEvent("filechooser");
  await page.getByTestId("library-import").click();
  await (await libChooser).setFiles(other);
  await expect(page.getByText("Added 1 instrument from Wobble.rbsynth").first()).toBeVisible();
});
