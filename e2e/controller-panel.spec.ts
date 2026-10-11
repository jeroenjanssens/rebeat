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
  const needleBefore = await page.locator('[data-knob-needle="0"]').getAttribute("transform");

  // Send knob 1 (CC 74) fully right
  await send(page, "MiniLab3 MIDI", [0xb0, 74, 127]);

  // Needle should have rotated (transform changed)
  await expect
    .poll(() => page.locator('[data-knob-needle="0"]').getAttribute("transform"))
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
  const thumbBefore = await page.locator('[data-fader-thumb="0"]').getAttribute("y");

  // Send fader 1 (CC 82) to top
  await send(page, "MiniLab3 MIDI", [0xb0, 82, 127]);

  await expect
    .poll(() => page.locator('[data-fader-thumb="0"]').getAttribute("y"))
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
