import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { fixtureFiles, wav } from "./fixtures";
import { openApp } from "./helpers";

type Patch = {
  source: string;
  osc: { type: string; table: string; position: number; tables: string[] }[];
  envs: { sustain: number }[];
  physical: { exciter: { type: string; position: number }; resonator: { model: string } };
};
type W = {
  __rebeat: {
    store: {
      getState(): {
        project: {
          tracks: { id: string; name: string; sound?: { patch?: Patch } }[];
          automation?: { target: string }[];
        };
        setUi(p: object): void;
      };
    };
    engine: { masterLevel(): number[] };
    commands: () => { id: string; run(): void }[];
    hints: Record<string, unknown>;
    synths: { id: string; patch: Patch }[];
    renderPatch(
      patch: unknown,
      notes: [number, number, number][],
      seconds: number,
    ): Promise<AudioBuffer>;
  };
};

const patch = (page: Page) =>
  page.evaluate(
    () =>
      (window as never as W).__rebeat.store
        .getState()
        .project.tracks.find((t) => t.name === "Bass")!.sound?.patch,
  );

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
  const advanced = editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" });
  if ((await advanced.getAttribute("data-active")) !== "true") await advanced.click();
  return editor;
}

/** The loudest the master got over a while. */
const peak = (page: Page, ms = 800) =>
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

/** Hint ids on screen without an entry. */
const missingHints = (page: Page) =>
  page.evaluate(() => {
    const { hints } = (window as never as W).__rebeat;
    const shown = [...document.querySelectorAll<HTMLElement>("[data-hint]")].map(
      (e) => e.dataset.hint!,
    );
    return [...new Set(shown)].filter((id) => !hints[id]);
  });

test.beforeEach(async ({ page }) => openApp(page));

test("a wavetable oscillator: pick a table, scrub it in one undo step, hold a note, automate it", async ({
  page,
}) => {
  const editor = await openAdvanced(page);
  const osc1 = editor.locator('[data-section="Oscillator 1"]');
  await osc1
    .locator('[data-switch="osc.0.type"]')
    .getByRole("button", { name: "Wavetable" })
    .click();
  await expect.poll(async () => (await patch(page))?.osc[0].type).toBe("wavetable");
  await editor.getByTestId("wt-table-0").click();
  await page.locator(".menu").getByRole("button", { name: "Vowels", exact: true }).click();
  await expect.poll(async () => (await patch(page))?.osc[0].table).toBe("factory:vowels");
  const picture = editor.getByTestId("wt-picture").locator("svg").first();
  await expect(editor.getByTestId("wt-picture")).toContainText("frame 1 / 64");

  // scrub: drag sideways, and one undo takes the whole drag back
  const box = (await picture.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 30 + i * 12, box.y + box.height / 2);
  await page.mouse.up();
  const scrubbed = (await patch(page))!.osc[0].position;
  expect(scrubbed).toBeGreaterThan(0.2);
  await page.mouse.click(5, 300);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await patch(page))?.osc[0].position).toBe(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(async () => (await patch(page))?.osc[0].position).toBeCloseTo(scrubbed, 5);

  // Hold: a note sounds while you scrub, without a key
  await editor.getByTestId("synth-hold").first().click();
  await expect.poll(() => peak(page), { timeout: 10000 }).toBeGreaterThan(0.01);
  await editor.getByTestId("synth-hold").first().click();

  // automate Position from the picture's menu
  await picture.click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Automate", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        ((window as never as W).__rebeat.store.getState().project.automation ?? []).map(
          (l) => l.target,
        ),
      ),
    )
    .toContainEqual(expect.stringMatching(/:synth:osc\.0\.position$/));

  // slots: keep Vowels in a slot, pick another table; the slots show (Automate showed the
  // timeline: back to the editor)
  await openAdvanced(page);
  await editor.getByTestId("wt-table-0").click();
  await page
    .locator(".menu")
    .getByRole("button", { name: /Add Vowels to a new slot/ })
    .click();
  await editor.getByTestId("wt-table-0").click();
  await page.locator(".menu").getByRole("button", { name: "PWM", exact: true }).click();
  await expect(editor.getByTestId("wt-slots-0")).toContainText("Vowels");
  expect((await patch(page))!.osc[0]).toMatchObject({
    table: "factory:pwm",
    tables: ["factory:vowels"],
  });
  expect(await missingHints(page)).toEqual([]);
});

test("your table from a WAV file: cut into cycles, played, carried by the .rebeat file", async ({
  page,
}) => {
  const editor = await openAdvanced(page);
  const osc1 = editor.locator('[data-section="Oscillator 1"]');
  await osc1
    .locator('[data-switch="osc.0.type"]')
    .getByRole("button", { name: "Wavetable" })
    .click();
  // a tone that brightens over a second: 220 Hz, its harmonics coming in
  const sr = 44100;
  const tone = Float32Array.from({ length: sr }, (_, i) => {
    const t = (i * 220) / sr;
    const x = i / sr;
    return 0.5 * Math.sin(2 * Math.PI * t) + 0.3 * x * Math.sin(6 * Math.PI * t);
  });
  const chooser = page.waitForEvent("filechooser");
  await editor.getByTestId("wt-table-0").click();
  await page.locator(".menu").getByRole("button", { name: "Import a file…" }).click();
  await (await chooser).setFiles(fixtureFiles({ "Bright tone.wav": wav(tone) }));
  const dialog = page.getByTestId("wavetable-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cycles" })).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(dialog).toContainText("single cycles of A3");
  await dialog.getByTestId("wavetable-save").click();
  await expect.poll(async () => (await patch(page))?.osc[0].table).toMatch(/^user:/);
  await expect(editor.getByTestId("wt-table-0")).toContainText("Bright tone");
  // it plays (its frames reach the synth)
  await editor.getByTestId("synth-hold").first().click();
  await expect.poll(() => peak(page), { timeout: 10000 }).toBeGreaterThan(0.01);
  await editor.getByTestId("synth-hold").first().click();

  // the .rebeat file carries it
  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+Shift+E");
  const zip = unzipSync(new Uint8Array(readFileSync(await (await download).path())));
  expect(Object.keys(zip).some((k) => k.startsWith("wavetables/"))).toBe(true);
  expect(Object.keys(zip)).toContain("wavetables.json");
});

test("offline renders play the tables, not the analog stand-in", async ({ page }) => {
  const diff = await page.evaluate(async () => {
    const r = (window as never as W).__rebeat;
    const base = r.synths.find((s) => s.id === "wt-vowel-pad")!.patch;
    const missing = JSON.parse(JSON.stringify(base));
    for (const o of missing.osc) o.table = "user:not-here";
    const a = await r.renderPatch(base, [[57, 0.05, 0.6]], 0.7);
    const b = await r.renderPatch(missing, [[57, 0.05, 0.6]], 0.7);
    const x = a.getChannelData(0);
    const y = b.getChannelData(0);
    let d = 0;
    let level = 0;
    for (let i = 0; i < x.length; i++) {
      d = Math.max(d, Math.abs(x[i] - y[i]));
      level = Math.max(level, Math.abs(x[i]));
    }
    return { d, level };
  });
  expect(diff.level).toBeGreaterThan(0.01);
  expect(diff.d).toBeGreaterThan(diff.level * 0.2);
});

test("a physical model: switch the source, play it, drag where it's excited, change the resonator", async ({
  page,
}) => {
  const editor = await openAdvanced(page);
  await editor
    .locator('[data-switch="source"]')
    .getByRole("button", { name: "Physical model" })
    .click();
  await expect.poll(async () => (await patch(page))?.source).toBe("physical");
  // it decays by itself: the amp envelope holds
  expect((await patch(page))!.envs[0].sustain).toBe(1);
  await expect(editor.locator('[data-group="osc"]')).toContainText("Physical model");
  await expect(editor.locator('[data-section="Oscillator 1"]')).toHaveCount(0);

  await editor.getByTestId("synth-hold").first().click();
  await expect.poll(() => peak(page), { timeout: 10000 }).toBeGreaterThan(0.005);
  await editor.getByTestId("synth-hold").first().click();

  // drag the exciter's marker along the string
  const before = (await patch(page))!.physical.exciter.position;
  const marker = editor.locator('[data-marker="position"] line');
  const m = (await marker.boundingBox())!;
  const pic = (await editor.getByTestId("phys-picture").boundingBox())!;
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
  await page.mouse.down();
  await page.mouse.move(pic.x + pic.width * 0.5, m.y + m.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await patch(page))!.physical.exciter.position)
    .not.toBeCloseTo(before, 2);

  await editor.locator('[data-switch="physical.resonator.model"]').selectOption({ label: "Bell" });
  await expect.poll(async () => (await patch(page))?.physical.resonator.model).toBe("bell");
  await editor
    .locator('[data-switch="physical.exciter.type"]')
    .selectOption({ label: "Oscillators" });
  // the oscillators play into the resonator: they show again
  await expect(editor.locator('[data-section="Oscillator 1"]')).toHaveCount(1);
  expect(await missingHints(page)).toEqual([]);
});
