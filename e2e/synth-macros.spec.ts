import { expect, test, type Page } from "@playwright/test";
import { midiKeyboard, openApp } from "./helpers";

type Patch = {
  macros: { name: string; value: number; targets: { path: string; min: number; max: number }[] }[];
  filters: { cutoff: number; reso: number }[];
};
type T = {
  id: string;
  name: string;
  params: Record<string, number>;
  sound?: { preset: string; patch?: Patch };
};
type W = {
  __midi: (d: number[]) => void;
  __rebeat: {
    engine: { trackSynth(t: unknown): Record<string, unknown> | undefined };
    store: {
      getState(): {
        project: {
          tracks: T[];
          midiMappings: { target: string }[];
          slots: { id: string; patternId: string }[];
          patterns: Record<
            string,
            { lanes: Record<string, { steps: { on: boolean; locks?: Record<string, number> }[] }> }
          >;
        };
        editSlotId: string;
        setUi(p: object): void;
      };
    };
    commands: () => { id: string; run(): void }[];
  };
};

const bass = (page: Page) =>
  page.evaluate(() =>
    (window as never as W).__rebeat.store.getState().project.tracks.find((t) => t.name === "Bass")!,
  );

async function openEditor(page: Page) {
  await page.evaluate(() => {
    const r = (window as never as W).__rebeat;
    const s = r.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.name === "Bass")!.id });
    r.commands()
      .find((c) => c.id === "panel.synth-editor")!
      .run();
  });
  return page.getByTestId("synth-editor");
}

const dm = (page: Page) => page.locator('[data-panel="drum-machine"]');

test("Basic shows the macros, which are the synth track's SOUND knobs", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.name === "Bass")!.id });
  });
  // the drum machine's SOUND bank: the macros
  await dm(page).getByRole("button", { name: "Sound", exact: true }).click();
  await expect(dm(page).getByText("Cutoff", { exact: true })).toBeVisible();
  await expect(dm(page).getByText("Attack", { exact: true })).toBeVisible();
  const editor = await openEditor(page);
  const macros = editor.getByTestId("synth-macros");
  await expect(macros.locator("svg")).toHaveCount(8);
  await expect(macros.getByText("Cutoff")).toBeVisible();
  await expect(macros.getByText("Movement")).toBeVisible();
  expect((await bass(page)).params["sound.macro1"]).toBeUndefined();
  // where the factory synth rests it
  const rest = await page.evaluate(
    () =>
      (
        window as never as { __rebeat: { synths: { id: string; patch: Patch }[] } }
      ).__rebeat.synths.find((s) => s.id === "acid")!.patch.macros[0].value,
  );
  await macros.getByText("Cutoff").locator("..").locator("svg").hover();
  await page.mouse.wheel(0, -200);
  await expect
    .poll(async () => (await bass(page)).params["sound.macro1"])
    .toBeGreaterThan(rest + 0.01);
  // turning a macro doesn't edit the factory synth
  expect((await bass(page)).sound?.patch).toBeUndefined();

  // the editor remembers the view you used last
  await editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();
  await expect(editor.getByTestId("synth-basic")).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => (window as never as W).__rebeat?.store);
  const again = await openEditor(page);
  await expect(again.getByTestId("mod-matrix")).toBeVisible();
});

test("macro locks on steps reach the synth as the song plays", async ({ page }) => {
  await openApp(page);
  // a step the bass plays
  const index = 0;
  const on = (i: number) =>
    page.evaluate((i) => {
      const s = (window as never as W).__rebeat.store.getState();
      const pat = s.project.patterns[s.project.slots.find((x) => x.id === s.editSlotId)!.patternId];
      const id = s.project.tracks.find((t) => t.name === "Bass")!.id;
      return pat.lanes[id].steps[i].on;
    }, i);
  const pad = page
    .locator("[data-track-row]", { hasText: "BASS" })
    .locator(`[data-pad][data-i="${index}"]`);
  if (!(await on(index))) await pad.click();
  await expect.poll(() => on(index)).toBe(true);
  await pad.click({ modifiers: ["Alt"] });
  await dm(page).getByRole("button", { name: "Sound", exact: true }).click();
  await dm(page).getByText("Cutoff", { exact: true }).locator("..").locator("svg").hover();
  await page.mouse.wheel(0, 300);
  const lock = await page.evaluate((i) => {
    const s = (window as never as W).__rebeat.store.getState();
    const pat = s.project.patterns[s.project.slots.find((x) => x.id === s.editSlotId)!.patternId];
    const id = s.project.tracks.find((t) => t.name === "Bass")!.id;
    return pat.lanes[id].steps[i].locks?.["sound.macro1"];
  }, index);
  expect(lock).toBeLessThan(0.5);
  // listen in on what the engine sends the synth
  await page.evaluate(() => {
    const r = (window as never as W).__rebeat;
    const t = r.store.getState().project.tracks.find((x) => x.name === "Bass");
    const synth = r.engine.trackSynth(t)!;
    const real = synth.lockMacros as (...a: unknown[]) => void;
    const seen: unknown[][] = [];
    Object.assign(window, { __locks: seen });
    synth.lockMacros = (...a: unknown[]) => {
      seen.push(a);
      real(...a);
    };
  });
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "transport.toggle")!
      .run(),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as never as { __locks: [number[], number, number][] }).__locks[0]?.[0][0],
        ),
      { timeout: 10000 },
    )
    .toBeCloseTo(lock!, 5);
});

test("Advanced: rename a macro and give it another target", async ({ page }) => {
  await openApp(page);
  const editor = await openEditor(page);
  await editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();
  const macros = editor.getByTestId("macro-editor");
  await macros.getByLabel("Macro 1 name").fill("Shine");
  await expect.poll(async () => (await bass(page)).sound?.patch?.macros[0].name).toBe("Shine");
  const drive = macros.locator('[data-macro="7"]');
  const before = (await bass(page)).sound!.patch!;
  const count = before.macros[7].targets.length;
  await drive.locator('[data-hint="synth.macro.add"]').selectOption("filters.0.reso");
  await expect
    .poll(async () => (await bass(page)).sound?.patch?.macros[7].targets.length)
    .toBe(count + 1);
  const t = (await bass(page)).sound!.patch!.macros[7].targets.at(-1)!;
  expect(t.path).toBe("filters.0.reso");
  expect(t.max).toBeGreaterThan(t.min);
  // the new name is on the SOUND knob
  await editor.getByTestId("synth-view").getByRole("button", { name: "Basic" }).click();
  await expect(editor.getByTestId("synth-macros").getByText("Shine")).toBeVisible();
});

test("any synth editor knob can be MIDI learned", async ({ page }) => {
  await midiKeyboard(page);
  const editor = await openEditor(page);
  await editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();
  await editor
    .locator('[data-hint="synth.filters.cutoff"]')
    .first()
    .locator("svg")
    .click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "MIDI learn" }).click();
  await page.evaluate(() => (window as never as W).__midi([0xb0, 21, 64]));
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as never as W).__rebeat.store.getState().project.midiMappings.map((m) => m.target),
      ),
    )
    .toContainEqual(expect.stringMatching(/:synth:filters\.0\.cutoff$/));
  await page.evaluate(() => (window as never as W).__midi([0xb0, 21, 127]));
  await expect
    .poll(async () => (await bass(page)).sound?.patch?.filters[0].cutoff)
    .toBeGreaterThan(15000);
  await page.evaluate(() => (window as never as W).__midi([0xb0, 21, 0]));
  await expect
    .poll(async () => (await bass(page)).sound?.patch?.filters[0].cutoff)
    .toBeLessThan(30);
});
