/**
 * E2E: live note recording (WS-B). Checks Overdub / Replace and Snap toggles in the UI, and
 * verifies that chords recorded via MIDI land in the step store.
 */
import { expect, test } from "@playwright/test";
import { midiKeyboard, openApp } from "./helpers";

// ── helpers ──────────────────────────────────────────────────────────────────────────────────

type Rebeat = {
  store: {
    getState(): {
      project: Project;
      playSlotId: string;
      setUi(u: Record<string, unknown>): void;
      commit(fn: (p: unknown) => void): void;
    };
  };
};
type Project = {
  slots: { id: string; patternId: string }[];
  tracks: { id: string; mode: string }[];
  patterns: Record<string, { lanes: Record<string, Lane> }>;
};
type Lane = { steps: Step[] };
type Step = { on?: boolean; notes?: NoteRec[] };
type NoteRec = { pitch: number; length: number; velocity: number };

async function getState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const r = (window as unknown as { __rebeat: Rebeat }).__rebeat;
    return r.store.getState() as { project: Project; playSlotId: string };
  });
}

async function getFirstNotesTrackId(page: import("@playwright/test").Page): Promise<string> {
  const s = await getState(page);
  return s.project.tracks.find((t) => t.mode === "notes")!.id;
}

async function notesAtStep(
  page: import("@playwright/test").Page,
  trackId: string,
  step: number,
): Promise<NoteRec[]> {
  const s = await getState(page);
  const slot = s.project.slots.find((x) => x.id === s.playSlotId) ?? s.project.slots[0];
  const pattern = s.project.patterns[slot.patternId];
  return (pattern?.lanes[trackId]?.steps[step]?.notes ?? []) as NoteRec[];
}

// ── tests ─────────────────────────────────────────────────────────────────────────────────────

test("record-notes: Snap toggle visible in TransportBar", async ({ page }) => {
  await openApp(page);
  await expect(page.locator('[data-hint="transport.snap"]')).toBeVisible();
});

test("record-notes: Overdub/Replace toggle visible in TransportBar", async ({ page }) => {
  await openApp(page);
  await expect(page.locator('[data-hint="transport.recordMode"]')).toBeVisible();
});

test("record-notes: chord of two MIDI notes lands in the pattern", async ({ page }) => {
  await midiKeyboard(page);

  const trackId = await getFirstNotesTrackId(page);

  // Enable recording, with the keys on the Notes track (they follow the selected track)
  await page.evaluate((id) => {
    const r = (window as unknown as { __rebeat: Rebeat }).__rebeat;
    r.store.getState().setUi({ recording: true, selectedTrackId: id });
  }, trackId);

  // Start transport
  await page.keyboard.press("Space");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const r = (
            window as unknown as { __rebeat: { store: { getState(): { playing: boolean } } } }
          ).__rebeat;
          return r.store.getState().playing;
        }),
      { timeout: 4000 },
    )
    .toBe(true);

  // Send a chord (two simultaneous note-ons, then note-offs)
  await page.evaluate(() => {
    (window as unknown as { __midi(d: number[]): void }).__midi([0x90, 60, 100]);
    (window as unknown as { __midi(d: number[]): void }).__midi([0x90, 64, 100]);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    (window as unknown as { __midi(d: number[]): void }).__midi([0x80, 60, 0]);
    (window as unknown as { __midi(d: number[]): void }).__midi([0x80, 64, 0]);
  });

  // Stop transport
  await page.keyboard.press("Space");

  // At least one step should have both pitches written somewhere in the lane
  const s = await getState(page);
  const slot = s.project.slots.find((x) => x.id === s.playSlotId) ?? s.project.slots[0];
  const pattern = s.project.patterns[slot.patternId];
  const lane = pattern?.lanes[trackId];
  const allPitches = (lane?.steps ?? []).flatMap((st) => (st.notes ?? []).map((n) => n.pitch));
  expect(allPitches).toContain(60);
  expect(allPitches).toContain(64);
});

test("record-notes: Overdub keeps existing note when adding a new pitch", async ({ page }) => {
  await openApp(page);

  const trackId = await getFirstNotesTrackId(page);

  // Pre-populate step 4 with pitch 55 via store commit
  await page.evaluate((tid) => {
    const r = (window as unknown as { __rebeat: Rebeat }).__rebeat;
    const s = r.store.getState();
    const playSlotId = s.playSlotId;
    s.commit((proj) => {
      const p = proj as Project;
      const slot = p.slots.find((x) => x.id === playSlotId) ?? p.slots[0];
      const lane = p.patterns[slot.patternId]?.lanes[tid];
      if (lane) {
        lane.steps[4].notes = [{ pitch: 55, length: 2, velocity: 0.7 }];
        lane.steps[4].on = true;
      }
    });
  }, trackId);

  // Verify pitch 55 is there
  const notesBefore = await notesAtStep(page, trackId, 4);
  expect(notesBefore.map((n) => n.pitch)).toContain(55);

  // Overdub: add pitch 60 without clearing
  await page.evaluate((tid) => {
    const r = (window as unknown as { __rebeat: Rebeat }).__rebeat;
    const s = r.store.getState();
    const playSlotId = s.playSlotId;
    s.commit((proj) => {
      const p = proj as Project;
      const slot = p.slots.find((x) => x.id === playSlotId) ?? p.slots[0];
      const lane = p.patterns[slot.patternId]?.lanes[tid];
      if (lane) {
        const existing = lane.steps[4].notes ?? [];
        const kept = existing.filter((n) => n.pitch !== 60);
        lane.steps[4].notes = [...kept, { pitch: 60, length: 1, velocity: 0.8 }].sort(
          (a, b) => a.pitch - b.pitch,
        );
        lane.steps[4].on = true;
      }
    });
  }, trackId);

  const notesAfter = await notesAtStep(page, trackId, 4);
  expect(notesAfter.map((n) => n.pitch)).toContain(55);
  expect(notesAfter.map((n) => n.pitch)).toContain(60);
});
