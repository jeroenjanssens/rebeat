import { expect, test, type Page } from "@playwright/test";
import { openApp, waitForProject } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type T = {
  id: string;
  name: string;
  effects: { name: string }[];
  params: Record<string, number>;
  instrument?: {
    source: string;
    preset: string;
    name?: string;
    from?: string;
    patch?: { version: number; osc: { retrigger: boolean }[]; filters: { cutoff: number }[] };
  };
};
type W = {
  __rebeat: {
    store: { getState(): { project: { tracks: T[] } } };
    synths: { id: string; patch: { osc: { retrigger: boolean }[] } }[];
  };
};
const track = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (window as never as W).__rebeat.store.getState().project.tracks.find((t) => t.name === n)!,
    name,
  );
const row = (page: Page, name: string) => page.locator("[data-track-row]", { hasText: name });

test("shape a synth, save it to the library and use it on another track", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await row(page, "BASS").locator('[data-hint="dm.track.name"]').click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Edit synth…" }).click();
  const editor = page.getByTestId("synth-editor");
  await expect(editor).toBeVisible();
  await editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();

  // the first edit copies the factory synth onto the track
  await editor.locator('[data-hint="synth.osc.retrigger"]').first().click();
  let bass = await track(page, "Bass");
  expect(bass.instrument?.preset).toBe("acid");
  expect(bass.instrument?.patch?.version).toBe(2);
  expect(bass.instrument?.patch?.osc[0].retrigger).toBe(true);
  // the factory synth didn't change
  const factory = await page.evaluate(
    () =>
      (window as never as W).__rebeat.synths.find((s) => s.id === "acid")!.patch.osc[0].retrigger,
  );
  expect(factory).toBe(false);
  await expect(editor.getByText("edited")).toBeVisible();

  // a knob
  const cutoff = editor.locator('[data-hint="synth.filters.cutoff"] svg').first();
  await cutoff.scrollIntoViewIfNeeded();
  const box = (await cutoff.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 5 });
  await page.mouse.up();
  bass = await track(page, "Bass");
  expect(bass.instrument!.patch!.filters[0].cutoff).toBeGreaterThan(200);

  // play it from the keyboard
  await editor.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("a");

  // save
  await editor.getByTestId("synth-save").click();
  await editor.getByTestId("synth-save-name").fill("My Acid");
  await editor.getByTestId("synth-save-ok").click();
  await expect(page.getByText("Saved “My Acid” to Your instruments").first()).toBeVisible();
  bass = await track(page, "Bass");
  expect(bass.instrument?.name).toBe("My Acid");

  // it's in the library; drag it onto the chords
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page
    .locator(".menu")
    .getByRole("button", { name: "Your instruments", exact: true })
    .click();
  const mine = page
    .getByTestId("library-list")
    .locator("[data-instrument]", { hasText: "My Acid" });
  await expect(mine).toHaveCount(1);
  await mine.dragTo(row(page, "CHORDS"));
  await expect.poll(async () => (await track(page, "Chords")).instrument?.name).toBe("My Acid");
  const chords = await track(page, "Chords");
  expect(chords.instrument?.patch?.osc[0].retrigger).toBe(true);
  // the sound comes with the effects it was saved with
  expect(chords.effects.map((e) => e.name)).toEqual(bass.effects.map((e) => e.name));

  // still there after a reload
  await page.reload();
  await page.getByTestId("audio-overlay").click();
  await waitForProject(page);
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page
    .locator(".menu")
    .getByRole("button", { name: "Your instruments", exact: true })
    .click();
  await expect(
    page.getByTestId("library-list").locator("[data-instrument]", { hasText: "My Acid" }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("revert brings the factory synth back", async ({ page }) => {
  await row(page, "BASS").locator('[data-hint="dm.track.name"]').click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Edit synth…" }).click();
  const editor = page.getByTestId("synth-editor");
  await editor
    .locator('[data-hint="synth.voice.mode"]')
    .getByRole("button", { name: "Poly" })
    .click();
  expect((await track(page, "Bass")).instrument?.patch).toBeTruthy();
  await editor.locator('[data-hint="synth.revert"]').click();
  await expect.poll(async () => (await track(page, "Bass")).instrument?.patch).toBeUndefined();
  // and Start from swaps the synth
  await editor.getByTestId("synth-start").selectOption("reese");
  expect((await track(page, "Bass")).instrument?.preset).toBe("reese");
});

test("any instrument track's sound can be saved from its menu", async ({ page }) => {
  await row(page, "CHORDS").locator('[data-hint="dm.track.name"]').click({ button: "right" });
  await page.getByTestId("save-sound-name").fill("Night Pad");
  await page.getByTestId("save-sound-name").press("Enter");
  await expect(page.getByText("Saved “Night Pad” to Your instruments").first()).toBeVisible();
  expect((await track(page, "Chords")).instrument?.from).toMatch(/^user:/);
});

test("the editor's keyboard holds notes until you let go", async ({ page }) => {
  await row(page, "CHORDS").locator('[data-hint="dm.track.name"]').click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Edit synth…" }).click();
  const level = () =>
    page.evaluate(() =>
      Math.max(
        ...(
          window as never as { __rebeat: { engine: { masterLevel(): number[] } } }
        ).__rebeat.engine.masterLevel(),
      ),
    );
  const key = page.getByTestId("keyboard").locator('[data-key="60"]');
  const b = (await key.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 8);
  await page.mouse.down();
  await expect(key).toHaveAttribute("style", /var\(--accent\)/);
  // a pad keeps sounding while the key is held
  await page.waitForTimeout(1500);
  await expect.poll(level, { timeout: 3000 }).toBeGreaterThan(0.01);
  await page.mouse.up();
  await expect(key).not.toHaveAttribute("style", /var\(--accent\)/);
  // and fades out after its release
  await expect.poll(level, { timeout: 8000 }).toBeLessThan(0.005);

  // the computer keys play it too, anywhere in the editor
  await page.getByTestId("synth-editor").click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("a");
  await expect(page.getByTestId("keyboard").locator('[data-key="60"]')).toHaveAttribute(
    "style",
    /var\(--accent\)/,
  );
  await page.keyboard.up("a");
});
