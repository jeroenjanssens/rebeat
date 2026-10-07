import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type S = {
  project: {
    tracks: { id: string; name: string; instrument?: { preset: string }; arp?: { on: boolean } }[];
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
  expect(bass.instrument?.preset).toBe("sub");
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
