import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

type Patch = {
  osc: { shape: number }[];
  envs: { attack: number; attackCurve: number; curve: number; sustain: number }[];
  lfos: { shape: string }[];
};
type W = {
  __rebeat: {
    store: {
      getState(): {
        project: { tracks: { id: string; name: string; instrument?: { patch?: Patch } }[] };
        setUi(p: object): void;
      };
    };
    commands: () => { id: string; run(): void }[];
  };
};

const patch = (page: Page) =>
  page.evaluate(
    () =>
      (window as never as W).__rebeat.store
        .getState()
        .project.tracks.find((t) => t.name === "Bass")!.instrument?.patch,
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

test.beforeEach(async ({ page }) => openApp(page));

test("sections follow the signal and stay folded", async ({ page }) => {
  const editor = await openAdvanced(page);
  const groups = await editor
    .locator("[data-group]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-group")));
  expect(groups).toEqual(["osc", "filters", "envs", "lfos", "matrix", "voice"]);
  // a live scope and spectrum of the synth
  await expect(editor.locator('[data-hint="synth.scope"] canvas')).toBeVisible();
  await expect(editor.locator('[data-hint="synth.spectrum"] canvas')).toBeVisible();
  // fold the oscillators: their boxes go, and stay gone after a reload
  await editor.locator('[data-group="osc"] [data-hint="synth.group"]').click();
  await expect(editor.locator('[data-section="Oscillator 1"]')).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => (window as never as W).__rebeat?.store);
  const again = await openAdvanced(page);
  await expect(again.locator('[data-group="filters"] [data-section="Filter 1"]')).toBeVisible();
  await expect(again.locator('[data-section="Oscillator 1"]')).toHaveCount(0);
});

test("drag an envelope's points and curves", async ({ page }) => {
  const editor = await openAdvanced(page);
  const amp = editor.locator('[data-section="Amp envelope"]');
  const view = amp.getByTestId("envelope-view");
  await view.scrollIntoViewIfNeeded();
  const drag = async (point: string, dx: number, dy: number) => {
    const b = (await view.locator(`[data-point="${point}"]`).boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2);
    await page.mouse.move(x + dx, y + dy);
    await page.mouse.up();
  };
  await drag("a", 40, 0);
  await expect.poll(async () => (await patch(page))?.envs[0].attack).toBeGreaterThan(0.02);
  // the attack's curve: down = slower start
  await drag("ac", 0, 12);
  await expect.poll(async () => (await patch(page))?.envs[0].attackCurve).toBeGreaterThan(0.2);
  // the decay's curve: up = falls faster
  const before = (await patch(page))!.envs[0].curve;
  await drag("dc", 0, -8);
  await expect.poll(async () => (await patch(page))?.envs[0].curve).toBeGreaterThan(before);
});

test("an oscillator's shape is one click on its picture", async ({ page }) => {
  const editor = await openAdvanced(page);
  const shapes = editor.locator('[data-section="Oscillator 1"] [data-hint="synth.osc.shape"]');
  // the four shapes and halfway between each
  await expect(shapes.getByRole("radio")).toHaveCount(7);
  // the acid bass is a saw
  await expect(shapes.getByRole("radio", { name: "Saw", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await shapes.getByRole("radio", { name: "Pulse", exact: true }).click();
  await expect.poll(async () => (await patch(page))?.osc[0].shape).toBe(3);
  await expect(shapes.getByRole("radio", { name: "Pulse", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(shapes.getByRole("radio", { name: "Saw", exact: true })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await shapes.getByRole("radio", { name: "Between sine and triangle" }).click();
  await expect.poll(async () => (await patch(page))?.osc[0].shape).toBe(0.5);
  // no dial for it any more
  await expect(editor.locator('[data-section="Oscillator 1"] [title^="Shape:"]')).toHaveCount(0);
});

test("LFOs show their shape", async ({ page }) => {
  const editor = await openAdvanced(page);
  const lfo = editor.locator('[data-section="LFO 1"]');
  const line = lfo.getByTestId("lfo-view").locator("polyline");
  await lfo.scrollIntoViewIfNeeded();
  const sine = await line.getAttribute("points");
  await lfo.locator('[data-hint="synth.lfo.shape"]').selectOption("square");
  await expect.poll(async () => (await patch(page))?.lfos[0].shape).toBe("square");
  const square = await line.getAttribute("points");
  expect(square).not.toBe(sine);
  // a square only takes two values
  const ys = new Set(square!.split(" ").map((p) => p.split(",")[1]));
  expect(ys.size).toBe(2);
});
