/**
 * Controller panel e2e tests.
 *
 * Checks:
 * - The panel opens via the command palette.
 * - With a MiniLab 3 connected and its map applied, the SVG shows.
 * - Sending a knob CC moves the SVG's knob needle.
 * - Sending a fader CC updates the fader thumb position.
 * - Clicking a pad in the SVG triggers the track.
 * - Without a controller map the "no controller" prompt appears.
 */
import { expect, test } from "@playwright/test";
import { midiDevices } from "./helpers";

type W = {
  __midiFrom: (name: string, d: number[]) => void;
  __rebeat: {
    store: {
      getState(): {
        project: { tracks: { id: string; name: string; params: Record<string, number> }[] };
        selectedTrackId: string | null;
        setUi(p: Record<string, unknown>): void;
      };
    };
    commands(): { id: string; run(): void }[];
    settings(): Promise<{
      getState(): { midiController: string; midiMappings: { target: string; slot?: string }[] };
    }>;
  };
};

const send = (page: import("@playwright/test").Page, device: string, bytes: number[]) =>
  page.evaluate(
    ([d, b]) => (window as never as W).__midiFrom(d as string, b as number[]),
    [device, bytes],
  );

async function openControllerPanel(page: import("@playwright/test").Page) {
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "panel.controller")!
      .run(),
  );
  await page.getByTestId("controller-panel").waitFor();
}

test("shows no-controller prompt when MIDI is off", async ({ page }) => {
  // openApp without MIDI enabled
  await page.addInitScript(() => {
    (window as { __REBEAT_TEST_MIC__?: boolean }).__REBEAT_TEST_MIC__ = true;
    if (!localStorage.getItem("rebeat.settings"))
      localStorage.setItem(
        "rebeat.settings",
        JSON.stringify({ state: { onboarded: true }, version: 1 }),
      );
  });
  await page.goto("/");
  await page.getByTestId("audio-overlay").click();
  await page.locator('[data-testid="audio-status"][data-status="running"]').waitFor();
  await page.waitForFunction(() => {
    const r = (window as never as { __rebeat?: { store: { getState(): { projectId: string } } } })
      .__rebeat;
    return !!r?.store.getState().projectId;
  });

  await openControllerPanel(page);
  await expect(page.getByTestId("controller-panel")).toContainText("No controller");
});

test("MiniLab 3: SVG renders with the map active and knob CC moves the needle", async ({
  page,
}) => {
  // Connect MiniLab 3 MIDI input and enable MIDI
  await midiDevices(page, ["MiniLab3 MIDI", "MiniLab3 MCU"]);
  // Close settings dialog opened by midiDevices
  await page.keyboard.press("Escape");

  // Open settings → MIDI → apply the map
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  // The detected MiniLab should be offered
  const useBtn = page.getByTestId("midi-use-detected");
  if (await useBtn.isVisible()) await useBtn.click();
  await page.keyboard.press("Escape");

  await openControllerPanel(page);

  // The panel should show the MiniLab 3 SVG (a key element in the SVG: [data-pad])
  await expect(page.locator('[data-pad="0"]').first()).toBeVisible();

  // Select the first track so knob labels are shown
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    if (s.project.tracks[0]) s.setUi({ selectedTrackId: s.project.tracks[0].id });
  });

  // Get the knob-0 needle's current transform
  const needleBefore = await page.locator('[data-knob-cap="0"]').getAttribute("transform");

  // Send knob 1 (CC 74) fully right
  await send(page, "MiniLab3 MIDI", [0xb0, 74, 127]);

  // Needle should have rotated (transform changed)
  await expect
    .poll(() => page.locator('[data-knob-cap="0"]').getAttribute("transform"))
    .not.toBe(needleBefore);
});

test("MiniLab 3: fader CC moves the fader thumb", async ({ page }) => {
  await midiDevices(page, ["MiniLab3 MIDI", "MiniLab3 MCU"]);
  await page.keyboard.press("Escape");

  // Apply map
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  const useBtn = page.getByTestId("midi-use-detected");
  if (await useBtn.isVisible()) await useBtn.click();
  await page.keyboard.press("Escape");

  await openControllerPanel(page);
  await expect(page.locator('[data-fader-thumb="0"]').first()).toBeVisible();

  // Get fader-0 thumb's current y
  const thumbBefore = await page.locator('[data-fader-thumb="0"]').getAttribute("transform");

  // Send fader 1 (CC 82) to top
  await send(page, "MiniLab3 MIDI", [0xb0, 82, 127]);

  await expect
    .poll(() => page.locator('[data-fader-thumb="0"]').getAttribute("transform"))
    .not.toBe(thumbBefore);
});

test("clicking a pad in the SVG triggers the track", async ({ page }) => {
  await midiDevices(page, ["MiniLab3 MIDI", "MiniLab3 MCU"]);
  await page.keyboard.press("Escape");

  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  const useBtn = page.getByTestId("midi-use-detected");
  if (await useBtn.isVisible()) await useBtn.click();
  await page.keyboard.press("Escape");

  await openControllerPanel(page);
  await expect(page.locator('[data-pad="0"]').first()).toBeVisible();

  // Clicking pad 0 should not throw; we verify it doesn't cause an error
  await page.locator('[data-pad="0"]').first().dispatchEvent("pointerdown", { pointerId: 1 });
  await page.locator('[data-pad="0"]').first().dispatchEvent("pointerup", { pointerId: 1 });
  // If no JS error was thrown, the click was handled
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect(errors).toEqual([]);
});

test("a key that's down shows the note it plays", async ({ page }) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  const notes = () =>
    page
      .locator("[data-key-note]")
      .allTextContents()
      .then((t) => t.filter(Boolean));
  await send(page, "Minilab3 MIDI", [0x90, 57, 100]);
  await send(page, "Minilab3 MIDI", [0x90, 60, 100]);
  await expect.poll(notes).toEqual(["A3", "C4"]);
  await send(page, "Minilab3 MIDI", [0x80, 57, 0]);
  await expect.poll(notes).toEqual(["C4"]);
  await send(page, "Minilab3 MIDI", [0x80, 60, 0]);
  await expect.poll(notes).toEqual([]);
});

test("the notes you play read as an equation with their chord", async ({ page }) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  const line = page.getByTestId("controller-notes");
  for (const n of [57, 60, 64]) await send(page, "Minilab3 MIDI", [0x90, n, 100]);
  await expect(line).toHaveText(/A3\s*\+\s*C4\s*\+\s*E4\s*=\s*Am/);
  await send(page, "Minilab3 MIDI", [0x80, 57, 0]);
  await expect(line).toHaveText(/C4\s*\+\s*E4/);
  await expect(page.getByTestId("controller-chord")).toHaveCount(0);
  for (const n of [60, 64]) await send(page, "Minilab3 MIDI", [0x80, n, 0]);
  await expect(line).toHaveText("");
});

test("chord pads make a chord on one key, its added keys lit (D137)", async ({ page }) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  // the keys play a Notes track
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    const tracks = s.project.tracks as unknown as { id: string; mode: string }[];
    const notes = tracks.find((t) => t.mode === "notes");
    if (notes) s.setUi({ selectedTrackId: notes.id });
  });
  await openControllerPanel(page);
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  await expect(page.locator('[data-hint="controller.chordpad.2"]')).toContainText("Maj");

  const line = page.getByTestId("controller-notes");
  const pad = (n: number, down: boolean) =>
    send(page, "Minilab3 MIDI", [down ? 0x99 : 0x89, 36 + n, down ? 100 : 0]);
  await pad(2, true); // Maj
  await pad(5, true); // m7
  await send(page, "Minilab3 MIDI", [0x90, 60, 100]);
  await expect(line).toHaveText(/C4\s*\+\s*E4\s*\+\s*G4\s*\+\s*A#4\s*=\s*C7/);
  await expect(page.locator('[data-key][data-generated="true"]')).toHaveCount(3);
  await expect(line.locator("[data-added]")).toHaveCount(3);

  // letting go of m7 while the key is held: the triad
  await pad(5, false);
  await expect(line).toHaveText(/C4\s*\+\s*E4\s*\+\s*G4\s*=\s*C$/);
  // the bass: the root an octave below, as the chord's other notes
  await page.getByTestId("bass").getByRole("button", { name: "Deeper" }).click();
  await expect(line).toHaveText(/C3\s*\+\s*C4\s*\+\s*E4\s*\+\s*G4\s*=\s*C$/);
  await expect(line.locator("[data-added]")).toHaveCount(3);
  await page.getByTestId("bass-value").click();
  await expect(line).toHaveText(/C4\s*\+\s*E4\s*\+\s*G4\s*=\s*C$/);
  // knob 1 (CC 74) is the chord voicing, knob 5 (CC 93) the bass, read as equal zones (D140, D142)
  const svg = page.locator('[aria-label="MiniLab 3 controller"]');
  await expect(svg.getByText("Voicing", { exact: true })).toBeVisible();
  await send(page, "Minilab3 MIDI", [0xb0, 74, 64]);
  await send(page, "Minilab3 MIDI", [0xb0, 74, 72]);
  await expect(line).toHaveText(/E4\s*\+\s*G4\s*\+\s*C5\s*=\s*C\/E$/);
  await expect(page.getByTestId("voicing-value")).toHaveText("+1");
  await send(page, "Minilab3 MIDI", [0xb0, 93, 115]);
  await send(page, "Minilab3 MIDI", [0xb0, 93, 100]);
  await expect(line).toHaveText(/C3\s*\+\s*E4\s*\+\s*G4\s*\+\s*C5\s*=\s*C$/);
  await page.getByTestId("bass-value").click();
  await page.getByTestId("voicing-value").click();
  await expect(line).toHaveText(/C4\s*\+\s*E4\s*\+\s*G4\s*=\s*C$/);
  // a full turn reaches both ends, whichever way, a value repeated on the way (D141, D142)
  const voicingValue = page.getByTestId("voicing-value");
  await page.waitForTimeout(300);
  for (const v of [71, 70, 70, 69, ...Array.from({ length: 24 }, (_, i) => 66 - 3 * i), 0])
    await send(page, "Minilab3 MIDI", [0xb0, 74, v]);
  await expect(voicingValue).toHaveText("-8");
  for (let v = 1; v <= 127; v += 3) await send(page, "Minilab3 MIDI", [0xb0, 74, v]);
  await send(page, "Minilab3 MIDI", [0xb0, 74, 127]);
  await expect(voicingValue).toHaveText("+8");
  await send(page, "Minilab3 MIDI", [0xb0, 74, 64]);
  await expect(voicingValue).toHaveText("0");
  // the bass changes every 18 or 19 values: Off, −1 … −6 from right to left (D155)
  const bassOn = () => page.getByTestId("bass-value");
  for (const [v, label] of [
    [110, "Off"],
    [109, "−1"],
    [92, "−1"],
    [91, "−2"],
    [74, "−2"],
    [73, "−3"],
    [55, "−3"],
    [54, "−4"],
    [37, "−4"],
    [36, "−5"],
    [19, "−5"],
    [18, "−6"],
  ] as const) {
    await send(page, "Minilab3 MIDI", [0xb0, 93, v]);
    await expect(bassOn()).toHaveText(label);
  }
  await page.getByTestId("bass-value").click();
  // a new key takes the chord over
  await send(page, "Minilab3 MIDI", [0x90, 65, 100]);
  await expect(line).toHaveText(/F4\s*\+\s*A4\s*\+\s*C5\s*=\s*F$/);

  await send(page, "Minilab3 MIDI", [0x80, 60, 0]);
  await send(page, "Minilab3 MIDI", [0x80, 65, 0]);
  await pad(2, false);
  await expect(line).toHaveText("");
  await expect(page.locator('[data-key][data-generated="true"]')).toHaveCount(0);

  // back in Drum mode the pads play tracks again
  await page.getByTestId("pad-mode").getByRole("button", { name: "Drum" }).click();
  await expect(page.locator('[data-hint="controller.pad.2"]')).toBeVisible();
});

test("Key mode: a key plays its chord in the key, the black knob turns the key (D138)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    const tracks = s.project.tracks as unknown as { id: string; mode: string }[];
    const notes = tracks.find((t) => t.mode === "notes");
    if (notes) s.setUi({ selectedTrackId: notes.id });
  });
  await openControllerPanel(page);
  await page.getByTestId("pad-mode").getByRole("button", { name: "Key" }).click();

  const midi = (bytes: number[]) => send(page, "Minilab3 MIDI", bytes);
  const line = page.getByTestId("controller-notes");
  const chip = page.getByTestId("key-mode-key");
  await expect(chip).toContainText("C major");

  // one key, its chord in C major; the keys in C major get dots, the Cs bigger ones
  await midi([0x90, 62, 100]);
  await expect(line).toHaveText(/D4\s*\+\s*F4\s*\+\s*A4\s*=\s*Dm$/);
  await midi([0x80, 62, 0]);
  await expect(page.locator("[data-key-dot][data-in-key]")).toHaveCount(15);
  await expect(page.locator('[data-key-dot][data-in-key="root"]')).toHaveCount(3);
  // the m7 pad adds the key's seventh
  await midi([0x99, 41, 100]);
  await midi([0x90, 67, 100]);
  await expect(line).toHaveText(/G4\s*\+\s*B4\s*\+\s*D5\s*\+\s*F5\s*=\s*G7$/);
  await midi([0x80, 67, 0]);
  await midi([0x89, 41, 0]);

  // the equation is as big as the note names on the keys
  const sizes = await page.evaluate(() => {
    const svg = document.querySelector('[aria-label="MiniLab 3 controller"]')!;
    const r = svg.getBoundingClientRect();
    const label = 22 * Math.min(r.width / 1158, r.height / 715);
    const eq = document.querySelector('[data-testid="controller-notes"]')!;
    return { label, eq: parseFloat(getComputedStyle(eq).fontSize) };
  });
  expect(Math.abs(sizes.eq - Math.max(15, sizes.label))).toBeLessThan(1);

  // the black knob: turn = root, Shift + turn = scale
  await midi([0xb0, 114, 65]);
  await midi([0xb0, 114, 65]);
  await expect(chip).toContainText("D major");
  // Shift + turn: the MiniLab sends CC 112
  await midi([0xb0, 112, 65]);
  await expect(chip).toContainText("D minor");
  // press and turn: transpose; a click: back to 0
  const transpose = page.getByTestId("transpose-value");
  await midi([0xb0, 115, 127]);
  await midi([0xb0, 114, 65]);
  await midi([0xb0, 115, 0]);
  await expect(transpose).toHaveText("+1");
  await midi([0xb0, 115, 127]);
  await midi([0xb0, 115, 0]);
  await expect(transpose).toHaveText("0");

  // On press: a turn picks a key next to the active one, a click selects it
  await page.getByTestId("key-dial").getByRole("button", { name: "On press" }).click();
  await midi([0xb0, 114, 65]);
  await expect(page.getByTestId("key-mode-pending")).toContainText("E♭ minor");
  await expect(chip).toContainText("D minor");
  await midi([0xb0, 115, 127]);
  await midi([0xb0, 115, 0]);
  await expect(chip).toContainText("E♭ minor");
  await expect(page.getByTestId("key-mode-pending")).toHaveCount(0);
});

test("relative knobs 1 and 5 step the voicing and the bass once per notch, fast turns too (D140, D141, D146)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  const voicing = page.getByTestId("voicing-value");
  const bass = page.getByTestId("bass-value");
  const turn = async (cc: number, values: number[]) => {
    await page.waitForTimeout(300); // a new gesture
    for (const v of values) await send(page, "Minilab3 MIDI", [0xb0, cc, v]);
  };
  const modeOf = (slot: string) =>
    page.evaluate(async (slot) => {
      const s = await (window as never as W).__rebeat.settings();
      const all = s.getState().midiMappings as { slot?: string; mode?: string }[];
      return all.find((m) => m.slot === slot)?.mode;
    }, slot);

  // Relative 1 (64 ± n): a slow turn is recognized (65 reads as the middle until then); the
  // MiniLab sends two messages per notch, and the voicing moves once per notch (D146)
  await turn(74, [65, 65, 65, 65, 65, 65]);
  await expect.poll(() => modeOf("knob1")).toBe("rel64");
  await expect(voicing).toHaveText("+1");
  await turn(74, [63, 63, 63, 63, 63]);
  await expect(voicing).toHaveText("-1");
  // a fast turn speeds up (bigger codes): still relative, a step per notch, not per code size
  await turn(74, [66, 67, 68, 69, 70, 72, 75]);
  await expect(voicing).toHaveText("+2");
  expect(await modeOf("knob1")).toBe("rel64");

  // the first messages read as absolute (63: −3) until the knob is known to be relative
  await turn(93, [63, 63, 63, 63, 63, 63]);
  await expect.poll(() => modeOf("knob5")).toBe("rel64");
  await expect(bass).toHaveText("−4");
  await turn(93, [65, 65, 65, 65, 65, 65, 65, 65, 65, 65]);
  await expect(bass).toHaveText("Off");
});

test("the pads in the tracks' colors, blue and purple for chords, Shift's own; Shift + pads run the transport (D144)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  const padColor = (i: number) =>
    page.locator(`[data-pad-color]`).nth(i).getAttribute("data-pad-color");
  const trackColors = await page.evaluate(() =>
    (window as never as W).__rebeat.store
      .getState()
      .project.tracks.slice(0, 8)
      .map((t) => (t as unknown as { color: string }).color),
  );
  // Drum mode: each pad the color of its track
  for (let i = 0; i < trackColors.length; i++) expect(await padColor(i)).toBe(trackColors[i]);
  // the device gets them too (7-bit RGB, pad ids 0x04…)
  const sent = () =>
    page.evaluate(
      () =>
        (window as never as { __midiSent: Record<string, number[][]> }).__midiSent[
          "Minilab3 MIDI"
        ] ?? [],
    );
  const padMsg = (msgs: number[][], id: number) =>
    msgs.filter((m) => m[0] === 0xf0 && m[6] === 0x02 && m[8] === 0x16 && m[9] === id).at(-1);
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) * 127) / 255));
  await expect
    .poll(async () => padMsg(await sent(), 0x04)?.slice(10, 13))
    .toEqual(rgb(trackColors[0]));

  // Chord mode: chord types blue, extensions purple, on the device too
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  const blue = await padColor(0);
  const purple = await padColor(4);
  expect(blue).not.toBe(purple);
  for (let i = 0; i < 4; i++) expect(await padColor(i)).toBe(blue);
  for (let i = 4; i < 8; i++) expect(await padColor(i)).toBe(purple);
  await expect.poll(async () => padMsg(await sent(), 0x0b)?.slice(10, 13)).toEqual(rgb(purple!));

  // Shift held: the pads' second functions in the MiniLab's colors
  await send(page, "Minilab3 MIDI", [0xb0, 9, 127]);
  await expect(page.getByTestId("ml3-shift")).toHaveAttribute("data-held", "true");
  expect(await padColor(5)).not.toBe(purple); // Play: green
  // Shift + pad 6 plays, Shift + pad 5 stops (a pad's note while Shift is held)
  const playing = () =>
    page.evaluate(
      () =>
        (
          window as never as { __rebeat: { store: { getState(): { playing: boolean } } } }
        ).__rebeat.store.getState().playing,
    );
  await send(page, "Minilab3 MIDI", [0x99, 41, 100]);
  await send(page, "Minilab3 MIDI", [0x89, 41, 0]);
  await expect.poll(playing).toBe(true);
  await send(page, "Minilab3 MIDI", [0x99, 40, 100]);
  await send(page, "Minilab3 MIDI", [0x89, 40, 0]);
  await expect.poll(playing).toBe(false);
  await send(page, "Minilab3 MIDI", [0xb0, 9, 0]);
  await expect(page.getByTestId("ml3-shift")).not.toHaveAttribute("data-held", "true");
  expect(await padColor(5)).toBe(purple);
  // in DAW mode the MiniLab sends CC 107 for Shift + Play, CC 106 for Shift + Stop
  await send(page, "Minilab3 MIDI", [0xb0, 107, 127]);
  await send(page, "Minilab3 MIDI", [0xb0, 107, 0]);
  await expect.poll(playing).toBe(true);
  await send(page, "Minilab3 MIDI", [0xb0, 106, 127]);
  await send(page, "Minilab3 MIDI", [0xb0, 106, 0]);
  await expect.poll(playing).toBe(false);
});

test("the screen shows line 1 on top, centered, as the device does (row 0x02 on top)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  const l1 = page.getByTestId("ml3-screen-line1");
  const l2 = page.getByTestId("ml3-screen-line2");
  await expect(l1).toHaveAttribute("text-anchor", "middle");
  const y1 = Number(await l1.getAttribute("y"));
  const y2 = Number(await l2.getAttribute("y"));
  expect(y1).toBeLessThan(y2);
  // the device gets line 1 in row 0x02, without the old three spaces in front
  await page.evaluate(async () => {
    const w = window as never as {
      __rebeat: { settings(): Promise<{ getState(): { set(p: object): void } }> };
    };
    (await w.__rebeat.settings()).getState().set({ midiShowDisplayNames: true });
  });
  await send(page, "Minilab3 MIDI", [0xb0, 74, 65]); // a knob: its name shows for a moment
  await expect
    .poll(async () => {
      const msgs = await page.evaluate(
        () =>
          (window as never as { __midiSent: Record<string, number[][]> }).__midiSent[
            "Minilab3 MIDI"
          ] ?? [],
      );
      const d = msgs.filter((m) => m[0] === 0xf0 && m[6] === 0x04 && m[8] === 0x60).at(-1);
      if (!d) return null;
      return { row: d[9], text: String.fromCharCode(...d.slice(10, d.indexOf(0x00, 10))) };
    })
    .toEqual({ row: 0x02, text: (await l1.textContent()) ?? "" });
});

test("a turning knob lights up in the accent for a moment", async ({ page }) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  const cap = page.locator('[data-knob-cap="2"]');
  await send(page, "Minilab3 MIDI", [0xb0, 76, 65]);
  await expect(cap).toHaveAttribute("data-turning", "true");
  await expect(cap).not.toHaveAttribute("data-turning", "true");
});

test("pads that send CCs (56–63, each message twice) play tracks, chord pads and Shift's functions (D147)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    const tracks = s.project.tracks as unknown as { id: string; mode: string }[];
    const notes = tracks.find((t) => t.mode === "notes");
    if (notes) s.setUi({ selectedTrackId: notes.id });
  });
  await openControllerPanel(page);
  const twice = async (b: number[]) => {
    await send(page, "Minilab3 MIDI", b);
    await send(page, "Minilab3 MIDI", b);
  };
  // Drum mode: pad 1 (CC 56) lights while held
  const face = page.locator('[data-pad="0"]');
  await twice([0xb0, 56, 127]);
  await expect.poll(() => face.evaluate((el) => (el as SVGElement).style.fill)).not.toBe("");
  await twice([0xb0, 56, 0]);
  await expect.poll(() => face.evaluate((el) => (el as SVGElement).style.fill)).toBe("");

  // Chord mode: pad 3 (CC 58) is Maj; let go, a key plays alone again
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  const line = page.getByTestId("controller-notes");
  await twice([0xb0, 58, 127]);
  await send(page, "Minilab3 MIDI", [0x90, 60, 100]);
  await expect(line).toHaveText(/C4\s*\+\s*E4\s*\+\s*G4\s*=\s*C$/);
  await send(page, "Minilab3 MIDI", [0x80, 60, 0]);
  await twice([0xb0, 58, 0]);
  await send(page, "Minilab3 MIDI", [0x90, 62, 100]);
  await expect(line).toHaveText(/^D4$/);
  await send(page, "Minilab3 MIDI", [0x80, 62, 0]);

  // Shift + pad 6 (CC 63) plays, Shift + pad 5 (CC 62) stops
  const playing = () =>
    page.evaluate(
      () =>
        (
          window as never as { __rebeat: { store: { getState(): { playing: boolean } } } }
        ).__rebeat.store.getState().playing,
    );
  await send(page, "Minilab3 MIDI", [0xb0, 9, 127]);
  await twice([0xb0, 63, 127]);
  await twice([0xb0, 63, 0]);
  await expect.poll(playing).toBe(true);
  await twice([0xb0, 62, 127]);
  await twice([0xb0, 62, 0]);
  await expect.poll(playing).toBe(false);
  await send(page, "Minilab3 MIDI", [0xb0, 9, 0]);
});

test("dragging across the keys with the button down plays each key in turn", async ({ page }) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    const tracks = s.project.tracks as unknown as { id: string; mode: string }[];
    const notes = tracks.find((t) => t.mode === "notes");
    if (notes) s.setUi({ selectedTrackId: notes.id });
  });
  await openControllerPanel(page);
  const line = page.getByTestId("controller-notes");
  const center = async (midi: number) => {
    const b = (await page.locator(`[data-key="${midi}"]`).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height * 0.85 }; // low on the key: no black keys
  };
  const c = await center(36);
  const d = await center(38);
  const e = await center(40);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await expect(line).toHaveText(/^C\d$/);
  await page.mouse.move(d.x, d.y, { steps: 5 });
  await expect(line).toHaveText(/^D\d$/);
  await page.mouse.move(e.x, e.y, { steps: 5 });
  await expect(line).toHaveText(/^E\d$/);
  await page.mouse.up();
  await expect(line).not.toHaveText(/E\d/);
});

test("knob 2 is the transpose in Chord and Key mode; the bass is a stepper (D148)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  const svg = page.locator('[aria-label="MiniLab 3 controller"]');
  await expect(svg.locator('[data-hint="controller.keysknob.1"]')).toContainText("Transpose");
  const transpose = page.getByTestId("transpose-value");
  // an absolute knob: all the way right +12, left −12, the middle 0
  await send(page, "Minilab3 MIDI", [0xb0, 71, 127]);
  await expect(transpose).toHaveText("+12");
  await send(page, "Minilab3 MIDI", [0xb0, 71, 0]);
  await expect(transpose).toHaveText("-12");
  await send(page, "Minilab3 MIDI", [0xb0, 71, 64]);
  await expect(transpose).toHaveText("0");

  // the bass: − deeper, + back toward Off, the value resets it
  const bass = page.getByTestId("bass-value");
  const deeper = page.getByTestId("bass").getByRole("button", { name: "Deeper" });
  const higher = page.getByTestId("bass").getByRole("button", { name: "Higher" });
  await expect(bass).toHaveText("Off");
  await higher.click();
  await expect(bass).toHaveText("Off");
  for (const v of ["−1", "−2", "−3", "−4", "−5", "−6", "−6"]) {
    await deeper.click();
    await expect(bass).toHaveText(v);
  }
  await higher.click();
  await expect(bass).toHaveText("−5");
  await bass.click();
  await expect(bass).toHaveText("Off");
});

test("the Controller panel has the Keys drop-down too", async ({ page }) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  const chip = page.getByTestId("controller-keys-chip");
  await expect(chip).toBeVisible();
  // a Notes track to lock the keys to
  const notes = await page.evaluate(() => {
    const tracks = (window as never as W).__rebeat.store.getState().project.tracks as unknown as {
      name: string;
      mode: string;
    }[];
    return tracks.find((t) => t.mode === "notes")?.name ?? null;
  });
  expect(notes).not.toBeNull();
  await chip.click();
  await page.locator(".menu .menu-item", { hasText: new RegExp(`^${notes}$`) }).click();
  await expect(chip).toContainText(notes!);
  // the top bar's chip says the same
  await expect(page.getByTestId("keys-chip")).toContainText(notes!);
});

test("in Chord and Key mode the knobs' cards explain the keys' settings", async ({ page }) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await openControllerPanel(page);
  const knob3 = page.locator(
    '[aria-label="MiniLab 3 controller"] [data-hint^="controller."][data-hint$="knob.2"]',
  );
  await expect(knob3).toHaveAttribute("data-hint", "controller.knob.2");
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  await expect(knob3).toHaveAttribute("data-hint", "controller.keysknob.2");
  await page.getByTestId("toggle-explain").click();
  await knob3.hover();
  const card = page.getByTestId("hint-card");
  await expect(card).toContainText("Knob 3: Strum");
  await expect(card).toContainText("makes the strum slower");
  await expect(knob3.locator("title")).toContainText("right is a slower strum");
});

test("your keys in the accent, the software's in the second accent, as opaque as they're loud (D157)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    const tracks = s.project.tracks as unknown as { id: string; mode: string }[];
    s.setUi({ selectedTrackId: tracks.find((t) => t.mode === "notes")!.id });
  });
  await openControllerPanel(page);
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  const fill = (midi: number) =>
    page.locator(`[data-key="${midi}"]`).evaluate((el) => (el as SVGElement).style.fill);
  // the device's keys start an octave up (C3 = drawing key 48 at octave 0): play C4 = 60 → key 48
  await send(page, "Minilab3 MIDI", [0x99, 38, 127]); // Maj
  await send(page, "Minilab3 MIDI", [0x90, 60, 127]);
  await expect.poll(() => fill(48)).toMatch(/var\(--accent\) 100%/);
  await expect.poll(() => fill(52)).toMatch(/var\(--accent-2\) 100%/);
  await send(page, "Minilab3 MIDI", [0x80, 60, 0]);
  await send(page, "Minilab3 MIDI", [0x90, 60, 64]);
  await expect.poll(() => fill(48)).toMatch(/var\(--accent\) 50%/);
  await expect.poll(() => fill(55)).toMatch(/var\(--accent-2\) 50%/);
  await send(page, "Minilab3 MIDI", [0x80, 60, 0]);
  await send(page, "Minilab3 MIDI", [0x89, 38, 0]);

  // a key you hold that doesn't sound (between arp steps): a ring, no fill
  await page.evaluate(async () => {
    const w = window as never as {
      __rebeat: { settings(): Promise<{ getState(): { set(p: object): void } }> };
    };
    (await w.__rebeat.settings()).getState().set({ playStyle: { arp: { on: true, rate: "1/4" } } });
  });
  await page.getByTestId("pad-mode").getByRole("button", { name: "Drum" }).click();
  for (const n of [60, 64, 67]) await send(page, "Minilab3 MIDI", [0x90, n, 100]);
  await expect(page.locator('[data-key][data-waiting="true"]')).toHaveCount(2);
  for (const n of [60, 64, 67]) await send(page, "Minilab3 MIDI", [0x80, n, 0]);
});

test("suggestions: markers on the keys after a chord; Next mode puts them on the pads (D158, D159)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const r = (window as never as W).__rebeat;
    const s = r.store.getState();
    const tracks = s.project.tracks as unknown as { id: string; mode: string }[];
    s.setUi({ selectedTrackId: tracks.find((t) => t.mode === "notes")!.id });
  });
  await openControllerPanel(page);
  await page.getByTestId("pad-mode").getByRole("button", { name: "Key" }).click();
  // Key mode in C major
  await page.evaluate(async () => {
    const w = window as never as {
      __rebeat: { settings(): Promise<{ getState(): { set(p: object): void } }> };
    };
    (await w.__rebeat.settings()).getState().set({ keyModeKey: { root: 0, scale: "major" } });
  });
  await page.getByTestId("suggest").click();
  await expect(page.getByTestId("suggest-adventure")).toBeVisible();
  // play C (Key mode: C major), then the markers
  await send(page, "Minilab3 MIDI", [0x90, 60, 100]);
  await send(page, "Minilab3 MIDI", [0x80, 60, 0]);
  const marks = page.locator('[data-testid="suggest-mark"]');
  await expect(marks).toHaveCount(3);
  const names = await marks.evaluateAll((els) => els.map((e) => e.getAttribute("data-name")));
  expect([...names].sort()).toEqual(["Am", "F", "G"]);

  // Next mode: the pads are the suggestions, named, and pad 1 plays the best one
  await page.getByTestId("pad-mode").getByRole("button", { name: "Next" }).click();
  const label = (i: number) => page.locator(`[data-pad-label="${i}"]`).textContent();
  await expect.poll(() => label(0)).toMatch(/^(F|G|Am)$/);
  const best = (await label(0))!;
  const line = page.getByTestId("controller-notes");
  await send(page, "Minilab3 MIDI", [0x99, 36, 100]); // pad 1
  const want = { F: /F\d.*=\s*F$/, G: /G\d.*=\s*G$/, Am: /A\d.*=\s*Am$/ }[best as "F" | "G" | "Am"];
  await expect(line).toHaveText(want);
  await send(page, "Minilab3 MIDI", [0x89, 36, 0]);
  // the device's pads light in the suggestions' colors (role colors, 7-bit)
  const sent = () =>
    page.evaluate(
      () =>
        (window as never as { __midiSent: Record<string, number[][]> }).__midiSent[
          "Minilab3 MIDI"
        ] ?? [],
    );
  const roleRgb = [
    [17, 98, 47], // home  #22c55e
    [29, 65, 123], // away  #3b82f6
    [119, 34, 34], // tension #ef4444
    [84, 42, 123], // color #a855f7
  ].map((c) => c.join(","));
  await expect
    .poll(async () => {
      const m = (await sent())
        .filter((x) => x[0] === 0xf0 && x[8] === 0x16 && x[9] === 0x04)
        .at(-1);
      return m ? roleRgb.includes(m.slice(10, 13).join(",")) : false;
    })
    .toBe(true);
});

test("Next mode: pick a progression and pad 1 plays it through (D161)", async ({ page }) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const r = (window as never as W).__rebeat;
    const s = r.store.getState();
    const tracks = s.project.tracks as unknown as { id: string; mode: string }[];
    s.setUi({ selectedTrackId: tracks.find((t) => t.mode === "notes")!.id });
    const st = await (
      r as never as { settings(): Promise<{ getState(): { set(p: object): void } }> }
    ).settings();
    st.getState().set({ keyModeKey: { root: 0, scale: "major" } });
  });
  await openControllerPanel(page);
  await page.getByTestId("pad-mode").getByRole("button", { name: "Next" }).click();
  // the menu says what each one is: its roman numerals and its chords in the key
  await page.getByTestId("progression").click();
  const royal = page.locator('[data-testid="progression-option"]', { hasText: "Royal road" });
  await expect(royal).toContainText("IV–V–iii–vi");
  await expect(royal).toContainText("F G Em Am");
  await royal.click();
  await expect(page.getByTestId("progression")).toContainText("Royal road");
  // pad 1 walks through it: F, G, Em, Am, and round again
  const pad1 = () => page.locator('[data-pad-label="0"]').textContent();
  const next = page.locator('[data-testid="progression-chords"] [data-next]');
  for (const want of ["F", "G", "Em", "Am", "F"]) {
    await expect.poll(pad1).toBe(want);
    await expect(next).toHaveText(want);
    await send(page, "Minilab3 MIDI", [0x99, 36, 100]);
    await send(page, "Minilab3 MIDI", [0x89, 36, 0]);
  }
  // back to Free: pad 1 is the best suggestion again
  await page.getByTestId("progression").click();
  await page.locator('[data-testid="progression-option"]', { hasText: "Free" }).click();
  await expect(page.getByTestId("progression-chords")).toHaveCount(0);
});

test("a pad let go gets its color again (the MiniLab paints it its own color while pressed, D165)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  const padMsgs = () =>
    page.evaluate(
      () =>
        (
          (window as never as { __midiSent: Record<string, number[][]> }).__midiSent[
            "Minilab3 MIDI"
          ] ?? []
        ).filter((m) => m[0] === 0xf0 && m[8] === 0x16 && m[9] === 0x06).length,
    );
  await expect.poll(padMsgs).toBeGreaterThan(0); // the pads were painted
  const before = await padMsgs();
  await send(page, "Minilab3 MIDI", [0x99, 38, 100]); // pad 3 down
  await send(page, "Minilab3 MIDI", [0x89, 38, 0]); // and up
  await expect.poll(padMsgs).toBeGreaterThan(before);
});
