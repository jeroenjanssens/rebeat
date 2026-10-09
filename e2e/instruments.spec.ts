import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type S = {
  project: {
    tracks: { id: string; name: string; sound?: { preset: string }; arp?: { on: boolean } }[];
    patterns: Record<
      string,
      { lanes: Record<string, { steps: { notes?: { pitch: number }[] }[] }> }
    >;
  };
  editSlotId: string;
  setUi(p: object): void;
};
const getState = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as never as { __rebeat: { store: { getState(): S } } }
    ).__rebeat.store.getState();
    return JSON.parse(JSON.stringify({ project: s.project, editSlotId: s.editSlotId })) as S;
  });

async function selectBass(page: Page) {
  await page.locator("[data-track-row]", { hasText: "BASS" }).getByText("BASS").click();
}

test("draws and deletes a note in the piano roll", async ({ page }) => {
  await selectBass(page);
  await page.getByText("Piano roll", { exact: true }).click();
  const roll = page.getByTestId("piano-roll");
  await expect(roll).toBeVisible();
  const before = await roll.locator("[data-note]").count();
  const canvas = roll.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  // click on an empty spot of the visible grid area
  await page.mouse.click(box.x + 5, (await roll.boundingBox())!.y + 70);
  await expect(roll.locator("[data-note]")).toHaveCount(before + 1);
  await page.keyboard.press("Delete");
  await expect(roll.locator("[data-note]")).toHaveCount(before);
});

test("changes the synth preset and turns on the arpeggiator", async ({ page }) => {
  await selectBass(page);
  const insp = page.getByTestId("inspector");
  await insp.getByTestId("synth-preset").selectOption("sub");
  await insp.getByTestId("arp-toggle").click();
  const s = await getState(page);
  const bass = s.project.tracks.find((t) => t.name === "Bass")!;
  expect(bass.sound?.preset).toBe("sub");
  expect(bass.arp?.on).toBe(true);
  await expect(page.locator("[data-track-row]", { hasText: "BASS" })).toBeVisible();
});

test("chord mode enters a chord from one key in the pad view", async ({ page }) => {
  await page.locator("[data-track-row]", { hasText: "CHORDS" }).getByText("CHORDS").click();
  await page.keyboard.press("V");
  await page.getByRole("button", { name: "Triads" }).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("a"); // C
  const s = await getState(page);
  const slot = (s.project as unknown as { slots: { id: string; patternId: string }[] }).slots.find(
    (x) => x.id === s.editSlotId,
  )!;
  const chords = s.project.tracks.find((t) => t.name === "Chords")!;
  const steps = s.project.patterns[slot.patternId].lanes[chords.id].steps;
  const step = steps.find((x, i) => i > 0 && x.notes?.length === 3);
  expect(step?.notes?.map((n) => n.pitch)).toEqual([48, 51, 55]);
});

test("the velocity lane sets the notes' velocities on an instrument track", async ({ page }) => {
  type S = {
    project: {
      tracks: { id: string; mode: string }[];
      slots: { id: string; patternId: string }[];
      patterns: Record<
        string,
        { lanes: Record<string, { steps: { on: boolean; notes?: { velocity: number }[] }[] }> }
      >;
    };
    editSlotId: string;
    setUi(p: object): void;
  };
  await page.evaluate(() => {
    const s = (
      window as never as { __rebeat: { store: { getState(): S } } }
    ).__rebeat.store.getState();
    const bass = s.project.tracks.find((t) => t.mode === "notes")!;
    s.setUi({
      selectedTrackId: bass.id,
      lanes: { velocity: true },
      editSlotId: s.project.slots[1].id,
    });
  });
  const bars = page.locator(
    '[data-panel="drum-machine"] [data-hint="dm.param-lane.bars"] [data-lane-i]',
  );
  await bars.last().scrollIntoViewIfNeeded();
  const first = (await bars.first().boundingBox())!;
  const last = (await bars.last().boundingBox())!;
  await page.mouse.move(first.x + 2, first.y + first.height - 4);
  await page.mouse.down();
  await page.mouse.move(last.x + 4, last.y + last.height - 4, { steps: 30 });
  await page.mouse.up();
  const top = await page.evaluate(() => {
    const s = (
      window as never as { __rebeat: { store: { getState(): S } } }
    ).__rebeat.store.getState();
    const bass = s.project.tracks.find((t) => t.mode === "notes")!;
    const slot = s.project.slots.find((x) => x.id === s.editSlotId)!;
    return s.project.patterns[slot.patternId].lanes[bass.id].steps
      .filter((x) => x.on && x.notes?.length)
      .map((x) => Math.max(...x.notes!.map((n) => n.velocity)));
  });
  expect(top.length).toBeGreaterThan(2);
  for (const v of top) expect(v).toBeLessThan(0.3);
});

test("the piano roll's note menu acts on all selected notes", async ({ page }) => {
  await page.locator("[data-track-row]", { hasText: "CHORDS" }).getByText("CHORDS").click();
  await page.getByText("Piano roll", { exact: true }).click();
  const roll = page.getByTestId("piano-roll");
  const notes = roll.locator("[data-note]");
  await expect(notes.first()).toBeAttached();
  const count = await notes.count();
  expect(count).toBeGreaterThan(3);
  await notes.first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await notes.nth(1).click({ button: "right" });
  const menu = page.locator(".menu");
  await expect(menu).toContainText(`${count} selected notes`);
  await menu.getByRole("button", { name: "Length 2" }).click();
  const lengths = await page.evaluate(() => {
    type S = {
      project: {
        tracks: { id: string; name: string }[];
        slots: { id: string; patternId: string }[];
        patterns: Record<
          string,
          { lanes: Record<string, { steps: { notes?: { length: number }[] }[] }> }
        >;
      };
      editSlotId: string;
    };
    const s = (
      window as never as { __rebeat: { store: { getState(): S } } }
    ).__rebeat.store.getState();
    const chords = s.project.tracks.find((t) => t.name === "Chords")!;
    const slot = s.project.slots.find((x) => x.id === s.editSlotId)!;
    return s.project.patterns[slot.patternId].lanes[chords.id].steps.flatMap((x) =>
      (x.notes ?? []).map((n) => n.length),
    );
  });
  expect(lengths).toHaveLength(count);
  expect(new Set(lengths)).toEqual(new Set([2]));

  await notes.first().click({ button: "right" });
  await menu.getByRole("button", { name: `Delete ${count} notes` }).click();
  await expect(notes).toHaveCount(0);
});

test("the track menu shows and changes a step track's sound", async ({ page }) => {
  const name = page
    .locator("[data-track-row]", { hasText: "BASS" })
    .locator('[data-hint="dm.track.name"]');
  const picker = page.getByTestId("sound-picker");
  const bass = async () => (await getState(page)).project.tracks.find((t) => t.name === "Bass")!;
  await name.click({ button: "right" });
  // the default synth, named after what it really plays
  await expect(picker.getByTestId("current-sound")).toHaveText("Mono · Acid Bass");
  await expect(
    picker.getByTestId("sound-kind").getByRole("button", { name: "Synth" }),
  ).toHaveAttribute("data-active", "true");
  await picker.locator("[data-sound]", { hasText: "Mono · Sub Bass" }).click();
  expect((await bass()).sound).toEqual({ source: "synth", preset: "sub" });

  await name.click({ button: "right" });
  await expect(picker.getByTestId("current-sound")).toHaveText("Mono · Sub Bass");
  await picker
    .getByTestId("sound-kind")
    .getByRole("button", { name: "Sample", exact: true })
    .click();
  await picker.getByTestId("sound-search").fill("909 kick");
  await picker.locator("[data-sound]").first().click();
  expect((await bass()).sound).toMatchObject({ source: "sample", sampleId: "kit:909:kick" });

  await name.click({ button: "right" });
  await expect(picker.getByTestId("current-sound")).toHaveText("909 Kick");
  await picker
    .getByTestId("sound-kind")
    .getByRole("button", { name: "Sampled instrument" })
    .click();
  await picker.locator(`[data-sound="smplr:piano"]`).click();
  expect((await bass()).sound).toEqual({ source: "smplr", preset: "piano" });
  await expect(
    page.locator('[data-panel="drum-machine"]').getByText("Grand Piano").first(),
  ).toBeVisible();
});
