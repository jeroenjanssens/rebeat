/** Loading a Fast Tracker 2 module (D279–D283): the project, its samples, and it plays. */
import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";
import { writeXm, type XmSpec } from "../src/library/xm/write";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const C4 = 49;

/** Two instruments: a drum on every 4th row, a looped bass line with a key-off. */
function module(): Buffer {
  const rows = Array.from({ length: 16 }, () => [] as XmSpec["patterns"][0][0]);
  for (let r = 0; r < 16; r += 4) rows[r][0] = { note: C4, instrument: 1 };
  rows[0][1] = { note: C4 - 24, instrument: 2 };
  rows[6][1] = { note: 97 };
  rows[8][1] = { note: C4 - 19, instrument: 2 };
  let seed = 1;
  const noise = Float32Array.from({ length: 3000 }, (_, i) => {
    seed = (seed * 16807) % 2147483647;
    return ((seed / 2147483647) * 2 - 1) * (1 - i / 3000);
  });
  const saw = Float32Array.from({ length: 64 }, (_, i) => i / 32 - 1);
  const spec: XmSpec = {
    name: "Chip tune",
    channels: 2,
    speed: 6,
    bpm: 125,
    orders: [0, 0],
    patterns: [rows],
    instruments: [
      { name: "Snare", samples: [{ data: noise }] },
      { name: "Bass", samples: [{ data: saw, loopStart: 0, loopLength: 64, loopType: 1 }] },
    ],
  };
  return Buffer.from(writeXm(spec));
}

test("loads an .xm module as a new project that plays", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("ControlOrMeta+O");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Import .rebeat or .xm/ }).click();
  await (await chooser).setFiles({ name: "chip.xm", mimeType: "audio/x-xm", buffer: module() });
  await expect(page.getByTestId("project-name")).toContainText("Chip tune");

  const shape = await page.evaluate(() => {
    const st = (window as Any).__rebeat.store.getState();
    const p = st.project;
    const bass = p.tracks.find((t: Any) => t.name === "Bass");
    const lane = p.patterns[p.slots[0].patternId].lanes[bass.id];
    return {
      tracks: p.tracks.map((t: Any) => `${t.name}:${t.mode}`),
      slots: p.slots.length,
      clones: p.slots[0].patternId === p.slots[1].patternId,
      bass: lane.steps[0].notes,
      sampled: p.tracks.every(
        (t: Any) => typeof t.sound?.sampleId === "string" && !t.sound.sampleId.startsWith("xm:"),
      ),
    };
  });
  expect(shape.tracks).toEqual(["Snare:hits", "Bass:notes"]);
  expect(shape.slots).toBe(2);
  expect(shape.clones).toBe(true);
  expect(shape.bass).toEqual([{ pitch: 36, length: 6, velocity: 1 }]);
  expect(shape.sampled).toBe(true);

  // the samples are in the library, under FT2
  await expect
    .poll(() =>
      page.evaluate(async () => {
        // the dev server serves the app's modules: the library's records in IndexedDB
        const path = "/src/storage/db.ts";
        const db = (await import(/* @vite-ignore */ path)).db;
        return (await db.samples.toArray()).filter((s: Any) => s.folder === "FT2/Chip tune").length;
      }),
    )
    .toBe(2);

  // the bass sounds where FT2 plays it: its 64-frame cycle is 131 Hz at C-4 (8363 Hz), so 33 Hz
  // at C-2
  const hz = await page.evaluate(async () => {
    const r = (window as Any).__rebeat;
    const p = r.store.getState().project;
    const bass = p.tracks.find((t: Any) => t.name === "Bass");
    const b: AudioBuffer = await r.renderProject(p, { soloTrackId: bass.id, tail: 0 });
    const x = b.getChannelData(0);
    // cycles over the note's first half second (with hysteresis: a saw's edge rings)
    let n = 0;
    let up = false;
    const end = Math.round(b.sampleRate * 0.5);
    for (let i = 0; i < end; i++) {
      if (!up && x[i] > 0.05) {
        up = true;
        n++;
      } else if (up && x[i] < -0.05) up = false;
    }
    return n / 0.5;
  });
  expect(hz).toBeGreaterThan(29);
  expect(hz).toBeLessThan(37);

  // it plays
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.evaluate(() => Math.max(...(window as Any).__rebeat.engine.masterLevel())), {
      timeout: 4000,
    })
    .toBeGreaterThan(0.01);
  await page.keyboard.press("Space");
});
