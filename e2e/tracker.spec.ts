/**
 * The Tracker panel (PLAN-tracker.md, D265–D277): typing without the mouse, effect commands, the
 * clipboard, MIDI entry, recording while playing.
 */
import { expect, test, type Page } from "@playwright/test";
import { midiKeyboard, openApp } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const rb = <T>(page: Page, fn: (r: Any) => T | Promise<T>) =>
  page.evaluate(`(${fn.toString()})(window.__rebeat)`) as Promise<T>;

/** The edited pattern's steps of a track (by name). */
const steps = (page: Page, name: string) =>
  page.evaluate((name) => {
    const st = (window as Any).__rebeat.store.getState();
    const t = st.project.tracks.find((x: Any) => x.name === name);
    const slot = st.project.slots.find((x: Any) => x.id === st.editSlotId);
    return st.project.patterns[slot.patternId].lanes[t.id].steps as Any[];
  }, name);

/** Open the tracker and give it the keyboard, the cursor on a track (Tab from the selected one). */
async function openTracker(page: Page, track: string) {
  await rb(page, (r) =>
    r
      .commands()
      .find((c: Any) => c.id === "panel.tracker")
      .run(),
  );
  const tracker = page.getByTestId("tracker");
  await tracker.waitFor();
  await tracker.focus();
  const tabs = await page.evaluate((name) => {
    const st = (window as Any).__rebeat.store.getState();
    const i = st.project.tracks.findIndex((x: Any) => x.name === name);
    const sel = st.project.tracks.findIndex((x: Any) => x.id === st.selectedTrackId);
    return i - Math.max(0, sel);
  }, track);
  for (let i = 0; i < Math.abs(tabs); i++)
    await page.keyboard.press(tabs > 0 ? "Tab" : "Shift+Tab");
  await expect(page.getByTestId("tracker-status")).toContainText(track.toUpperCase());
}

/** Clear the cursor's track (select its column, clear the block) and go to row 0. */
async function clearTrack(page: Page) {
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Shift+Delete");
  await page.keyboard.press("Home");
}

test.describe("the tracker", () => {
  test("types a drum pattern and a bass line without the mouse", async ({ page }) => {
    await openApp(page);
    await openTracker(page, "Kick");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tracker-edit")).toHaveAttribute("data-on", "true");
    await clearTrack(page);
    await page.keyboard.press("Alt+4");
    for (let i = 0; i < 4; i++) await page.keyboard.press("z");
    const kick = await steps(page, "Kick");
    expect(kick.slice(0, 16).map((s: Any) => (s.on ? "x" : "."))).toEqual(
      "x...x...x...x...".split(""),
    );
    expect(kick[4].pitch).toBe(0);

    await openTracker(page, "Bass");
    await clearTrack(page);
    await page.keyboard.press("Alt+2");
    // octave 2: Z is C2
    await page.keyboard.press("Alt+[");
    await page.keyboard.press("Alt+[");
    await expect(page.getByTestId("tracker-octave")).toHaveText("2");
    for (const k of ["z", "c", "b", ","]) await page.keyboard.press(k);
    const bass = await steps(page, "Bass");
    const notes = [0, 2, 4, 6].map((i) => bass[i].notes?.[0]);
    expect(notes.map((n: Any) => n.pitch)).toEqual([36, 40, 43, 48]);
    expect(notes.map((n: Any) => n.length)).toEqual([2, 2, 2, 10]);
    // a note-off ends the last one
    await page.keyboard.press("Home");
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("1");
    expect((await steps(page, "Bass"))[6].notes[0].length).toBe(2);
    // undo takes it back
    await page.keyboard.press("ControlOrMeta+z");
    expect((await steps(page, "Bass"))[6].notes[0].length).toBe(10);
  });

  test("writes effect commands, and says why it doesn't take FT2's tempo", async ({ page }) => {
    await openApp(page);
    await openTracker(page, "Kick");
    await page.keyboard.press("Escape");
    await clearTrack(page);
    await page.keyboard.press("Alt+0");
    await page.keyboard.press("z");
    // note → volume digits → the effect's letter
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    for (const k of ["r", "0", "3"]) await page.keyboard.press(k);
    let kick = await steps(page, "Kick");
    expect(kick[0].ratchet).toBe(3);
    await page.keyboard.press("Alt+E");
    // Add is 0: the cursor stayed on R03's last digit, the next field is the new column's letter
    await page.keyboard.press("ArrowRight");
    for (const k of ["y", "8", "0"]) await page.keyboard.press(k);
    kick = await steps(page, "Kick");
    expect(kick[0].probability).toBeCloseTo(0x80 / 255);
    // on the command's letter, F is FT2's tempo
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("f");
    await expect(page.getByTestId("tracker-status")).toContainText("Tempo lane");
    // the volume: 40 in hex
    await page.keyboard.press("Home");
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("tracker-status")).toContainText("volume");
    for (const k of ["4", "0"]) await page.keyboard.press(k);
    expect((await steps(page, "Kick"))[0].velocity).toBeCloseTo(64 / 127);
  });

  test("copies, pastes and transposes", async ({ page }) => {
    await openApp(page);
    await openTracker(page, "Bass");
    await page.keyboard.press("Escape");
    await clearTrack(page);
    await page.keyboard.press("Alt+2");
    for (const k of ["z", "c", "b", "m"]) await page.keyboard.press(k);
    await page.keyboard.press("Home");
    for (let i = 0; i < 7; i++) await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("Home");
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+v");
    let bass = await steps(page, "Bass");
    const pitch = (i: number) => bass[i].notes?.[0]?.pitch;
    expect([8, 10, 12, 14].map(pitch)).toEqual([0, 2, 4, 6].map(pitch));
    const first = pitch(8);
    await page.keyboard.press("ControlOrMeta+Shift+ArrowUp");
    bass = await steps(page, "Bass");
    expect(pitch(8)).toBe(first + 12);
  });

  test("a MIDI chord in edit mode fills the note columns", async ({ page }) => {
    await midiKeyboard(page);
    await openTracker(page, "Chords");
    await page.keyboard.press("Escape");
    await clearTrack(page);
    await page.evaluate(() => {
      for (const n of [60, 64, 67]) (window as Any).__midi([0x90, n, 100]);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      for (const n of [60, 64, 67]) (window as Any).__midi([0x80, n, 0]);
    });
    const chords = await steps(page, "Chords");
    expect(chords[0].notes.map((n: Any) => [n.pitch, n.col])).toEqual([
      [60, 0],
      [64, 1],
      [67, 2],
    ]);
    // the velocity came from the keyboard
    expect(chords[0].notes[0].velocity).toBeCloseTo(100 / 127, 2);
  });

  test("records what you play while playing, with its length", async ({ page }) => {
    await openApp(page);
    await openTracker(page, "Bass");
    await page.keyboard.press("Escape");
    await clearTrack(page);
    await page.keyboard.press("Space");
    await expect.poll(() => rb(page, (r) => r.store.getState().playing)).toBe(true);
    await page.waitForTimeout(300);
    await page.keyboard.down("z");
    await page.waitForTimeout(500);
    await page.keyboard.up("z");
    await page.keyboard.press("Space");
    const bass = await steps(page, "Bass");
    const written = bass.flatMap((s: Any) => s.notes ?? []);
    expect(written.length).toBe(1);
    // held for half a second at 112 BPM: a few sixteenths, not the rest of the pattern
    expect(written[0].length).toBeGreaterThanOrEqual(2);
    expect(written[0].length).toBeLessThan(8);
  });
});
