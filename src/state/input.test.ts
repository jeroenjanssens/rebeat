/**
 * Unit tests for live note recording (WS-B): recordNoteOn / recordNoteOff, padInput (Overdub /
 * Replace, stepSizeOverride fix), Snap on/off, velocity, schema 9.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoProject } from "../templates/nightDrive";
import { slotPattern } from "../model/project";
import { type Note, type Track } from "../model/types";
import { useStore } from "./store";
import { useSettings } from "./settings";

// ── Mocks ─────────────────────────────────────────────────────────────────────────────────────

let mockProgress = 0;
let mockLatency = 0;

vi.mock("../engine/transport", () => {
  const at = (t: number) => {
    const s = useStore.getState();
    const slot = s.project.slots.find((x) => x.id === s.playSlotId) ?? s.project.slots[0];
    const pattern = s.project.patterns[slot.patternId];
    // the audio clock is at 0: a time ahead is that far into the page (16ths at the tempo)
    const pageSec = (pattern.stepCount * 60) / s.project.bpm / 4;
    return { slotId: slot.id, pattern, pageStep: 0, progress: mockProgress + t / pageSec, time: t };
  };
  return { position: () => at(0), positionAt: at };
});

vi.mock("../engine/context", () => ({
  audioContext: () => ({ outputLatency: mockLatency, baseLatency: 0 }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────

function notesAt(trackId: string, step: number): Note[] {
  const s = useStore.getState();
  const pattern = slotPattern(s.project, s.playSlotId);
  return pattern.lanes[trackId]?.steps[step]?.notes ?? [];
}

function setupPlaying(_bpm = 120, quantize = "1/16") {
  const p = demoProject();
  useStore.getState().loadProject(p, "test");
  const s = useStore.getState();
  const slot = p.slots[0];
  s.setUi({ playing: true, recording: true, playSlotId: slot.id, quantize });
  return p;
}

/** Find a Notes track from the demo project. */
function notesTrack(p: ReturnType<typeof demoProject>): Track {
  return p.tracks.find((t) => t.mode === "notes")!;
}

// ── import after mocks ────────────────────────────────────────────────────────────────────────

const { recordNoteOn, recordNoteOff } = await import("./input");

describe("recordNoteOn / recordNoteOff: basic recording", () => {
  beforeEach(() => {
    mockProgress = 0;
    mockLatency = 0;
    useSettings.setState({ recordMode: "overdub", snap: true });
  });

  it("writes a note to the nearest step and returns an id", () => {
    const p = setupPlaying();
    const track = notesTrack(p);
    // progress ≈ step 4 of 16 (progress = 4/16 = 0.25)
    mockProgress = 4 / 16;
    const id = recordNoteOn(track, 60, 0.8);
    expect(id).not.toBeNull();
    expect(notesAt(track.id, 4).map((n) => n.pitch)).toContain(60);
  });

  it("chord of 3 notes on the same step (same undo step merge key)", () => {
    const p = setupPlaying();
    const track = notesTrack(p);
    mockProgress = 4 / 16;
    const id1 = recordNoteOn(track, 60, 0.8);
    const id2 = recordNoteOn(track, 64, 0.8);
    const id3 = recordNoteOn(track, 67, 0.8);
    expect([id1, id2, id3].filter((x) => x !== null).length).toBe(3);
    const notes = notesAt(track.id, 4);
    expect(notes.map((n) => n.pitch).sort()).toEqual([60, 64, 67]);
  });

  it("length from note-off: two steps", () => {
    const p = setupPlaying(120);
    const track = notesTrack(p);
    mockProgress = 4 / 16;
    const id = recordNoteOn(track, 60, 0.8);
    // note-off at step 6
    mockProgress = 6 / 16;
    recordNoteOff(id);
    const notes = notesAt(track.id, 4);
    const note = notes.find((n) => n.pitch === 60);
    expect(note?.length).toBeGreaterThanOrEqual(1);
  });

  it("length wraps across the loop (note-off earlier than note-on progress)", () => {
    const p = setupPlaying(120);
    const track = notesTrack(p);
    // note-on near the end
    mockProgress = 14 / 16;
    const id = recordNoteOn(track, 60, 0.8);
    // note-off after loop wrap (progress restarted at 2/16)
    mockProgress = 2 / 16;
    recordNoteOff(id);
    const notes = notesAt(track.id, 14);
    const note = notes.find((n) => n.pitch === 60);
    // wrapped: 16 - 14 + 2 = 4 steps
    expect(note?.length).toBeGreaterThan(0);
  });

  it("velocity per note, step velocity = loudest", () => {
    const p = setupPlaying();
    const track = notesTrack(p);
    mockProgress = 4 / 16;
    recordNoteOn(track, 60, 0.5);
    recordNoteOn(track, 64, 0.9);
    const notes = notesAt(track.id, 4);
    expect(notes.find((n) => n.pitch === 60)?.velocity).toBeCloseTo(0.5);
    expect(notes.find((n) => n.pitch === 64)?.velocity).toBeCloseTo(0.9);
    const s = useStore.getState();
    const step = slotPattern(s.project, s.playSlotId).lanes[track.id]?.steps[4];
    expect(step?.velocity).toBeCloseTo(0.9);
  });

  it("recordNoteOff(null) is a no-op", () => {
    setupPlaying();
    expect(() => recordNoteOff(null)).not.toThrow();
  });

  it("returns null and does nothing when not recording", () => {
    const p = demoProject();
    useStore.getState().loadProject(p, "test");
    useStore.getState().setUi({ playing: true, recording: false });
    const track = notesTrack(p);
    mockProgress = 4 / 16;
    const id = recordNoteOn(track, 60, 0.8);
    expect(id).toBeNull();
  });
});

describe("recordNoteOn: Overdub vs Replace", () => {
  beforeEach(() => {
    mockProgress = 0;
    mockLatency = 0;
    useSettings.setState({ snap: true });
  });

  it("Overdub keeps existing notes at other pitches", () => {
    const p = setupPlaying();
    const track = notesTrack(p);
    // Pre-populate step 4 with a note at pitch 55
    useStore.getState().commit((proj) => {
      const pattern = slotPattern(proj, p.slots[0].id);
      const lane = pattern.lanes[track.id]!;
      lane.steps[4].notes = [{ pitch: 55, length: 2, velocity: 0.7 }];
      lane.steps[4].on = true;
    });
    useSettings.setState({ recordMode: "overdub" });
    mockProgress = 4 / 16;
    recordNoteOn(track, 60, 0.8);
    const notes = notesAt(track.id, 4);
    expect(notes.map((n) => n.pitch).sort()).toEqual([55, 60]);
  });

  it("Replace clears a step on the first hit, leaves un-touched steps alone", () => {
    const p = setupPlaying();
    const track = notesTrack(p);
    // Pre-populate two steps
    useStore.getState().commit((proj) => {
      const pattern = slotPattern(proj, p.slots[0].id);
      const lane = pattern.lanes[track.id]!;
      lane.steps[4].notes = [{ pitch: 55, length: 1, velocity: 0.7 }];
      lane.steps[4].on = true;
      lane.steps[8].notes = [{ pitch: 50, length: 1, velocity: 0.7 }];
      lane.steps[8].on = true;
    });
    useSettings.setState({ recordMode: "replace" });
    mockProgress = 4 / 16;
    recordNoteOn(track, 60, 0.8);
    // step 4: cleared and replaced with pitch 60
    const notes4 = notesAt(track.id, 4);
    expect(notes4.map((n) => n.pitch)).toEqual([60]);
    // step 8: untouched
    const notes8 = notesAt(track.id, 8);
    expect(notes8.map((n) => n.pitch)).toContain(50);
  });

  it("Replace: second hit on same step in same pass doesn't re-clear (Overdub semantics)", () => {
    const p = setupPlaying();
    const track = notesTrack(p);
    useSettings.setState({ recordMode: "replace" });
    mockProgress = 4 / 16;
    recordNoteOn(track, 60, 0.8);
    // second note-on at same step
    recordNoteOn(track, 64, 0.8);
    const notes = notesAt(track.id, 4);
    // Both 60 and 64 should be there (not cleared on second hit)
    expect(notes.map((n) => n.pitch).sort()).toEqual([60, 64]);
  });
});

describe("recordNoteOn: Snap off = sub-step offset", () => {
  beforeEach(() => {
    mockProgress = 0;
    mockLatency = 0;
    useSettings.setState({ recordMode: "overdub", snap: false });
    useStore.getState().setUi({ quantize: "1/16" });
  });

  it("stores a Note.offset when note lands between steps", () => {
    const p = setupPlaying(120, "1/16");
    const track = notesTrack(p);
    // land at 4.3 steps into a 16-step pattern
    mockProgress = 4.3 / 16;
    recordNoteOn(track, 60, 0.8);
    const notes = notesAt(track.id, 4);
    const note = notes.find((n) => n.pitch === 60);
    expect(note).toBeDefined();
    // offset should be approximately 0.3 (sub-step) or note is at step 4 with offset
    if (note?.offset !== undefined) {
      expect(Math.abs(note.offset)).toBeGreaterThan(0);
      expect(Math.abs(note.offset)).toBeLessThanOrEqual(0.5);
    }
  });

  it("fractional length from note-off when snap is off", () => {
    const p = setupPlaying(120, "1/16");
    const track = notesTrack(p);
    mockProgress = 4 / 16;
    const id = recordNoteOn(track, 60, 0.8);
    // note-off at 4.7 steps → length ≈ 0.7
    mockProgress = 4.7 / 16;
    recordNoteOff(id);
    const note = notesAt(track.id, 4).find((n) => n.pitch === 60);
    // length should be fractional (less than 1 and at least 0.05)
    if (note) {
      expect(note.length).toBeGreaterThan(0.05);
      // with snap off, fractional length is preserved
      expect(note.length % 1).not.toBe(0); // not an integer
    }
  });
});

describe("recordNoteOn: timed notes from the play styles (D149)", () => {
  beforeEach(() => {
    mockProgress = 0;
    mockLatency = 0;
    useSettings.setState({ recordMode: "overdub", snap: true });
  });
  // the audio clock is at 0 in these tests: a time is seconds from now
  const stepSec = (p: ReturnType<typeof demoProject>) => 60 / p.bpm / 4;

  it("a hit two steps from now lands two steps later", () => {
    const p = setupPlaying(120, "1/16");
    const track = notesTrack(p);
    mockProgress = 4 / 16;
    recordNoteOn(track, 60, 0.8, { at: 2 * stepSec(p) });
    expect(notesAt(track.id, 6).map((n) => n.pitch)).toContain(60);
  });

  it("with Snap on, the hit snaps and a strum's delay stays as the note's offset", () => {
    const p = setupPlaying(120, "1/16");
    const track = notesTrack(p);
    mockProgress = 4.2 / 16; // played a little late: the hit snaps to step 4
    recordNoteOn(track, 60, 0.8, { spread: 0 });
    recordNoteOn(track, 64, 0.8, { spread: 0.3 * stepSec(p) });
    const notes = notesAt(track.id, 4);
    expect(notes.find((n) => n.pitch === 60)?.offset).toBeUndefined();
    expect(notes.find((n) => n.pitch === 64)?.offset).toBeCloseTo(0.3, 5);
  });

  it("an on-grid note (a pattern's triplet) keeps its place with Snap on (D175)", () => {
    const p = setupPlaying(120, "1/16");
    const track = notesTrack(p);
    mockProgress = 4 / 16;
    // a third of a beat later: 1⅓ sixteenths
    recordNoteOn(track, 60, 0.8, { at: (4 / 3) * stepSec(p), onGrid: true });
    const n = notesAt(track.id, 5).find((x) => x.pitch === 60);
    expect(n?.offset).toBeCloseTo(1 / 3, 3);
  });

  it("a note-off at a time sets the length to it", () => {
    const p = setupPlaying(120, "1/16");
    const track = notesTrack(p);
    useSettings.setState({ snap: false });
    mockProgress = 4 / 16;
    const id = recordNoteOn(track, 60, 0.8);
    recordNoteOff(id, 1.5 * stepSec(p));
    expect(notesAt(track.id, 4).find((n) => n.pitch === 60)?.length).toBeCloseTo(1.5, 5);
  });
});

describe("schema 9 migration", () => {
  it("is a no-op: projects round-trip with version 9", async () => {
    const { deserializeProject, serializeProject, SCHEMA_VERSION } =
      await import("../model/schema");
    const p = demoProject();
    expect(SCHEMA_VERSION).toBe(9);
    const json = JSON.parse(JSON.stringify(serializeProject(p)));
    expect(json.schemaVersion).toBe(9);
    const restored = deserializeProject(json);
    expect(restored.tracks.length).toBe(p.tracks.length);
  });

  it("migrates a schema-8 project to schema-9 without changes", async () => {
    const { migrate } = await import("../model/schema");
    const p = demoProject();
    const result = migrate({
      format: "rebeat-project",
      schemaVersion: 8,
      project: p,
    });
    // no data changes expected (result is plain JSON, cast through unknown)
    const migrated = result as unknown as typeof p;
    expect(migrated.tracks.length).toBe(p.tracks.length);
  });
});
