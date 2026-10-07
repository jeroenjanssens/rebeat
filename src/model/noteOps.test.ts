import { describe, expect, it } from "vitest";
import { addNote, listNotes, moveNotes, removeNote, resizeNotes } from "./noteOps";
import { MAX_STEPS, emptyStep, type StepLane } from "./types";

const lane = (): StepLane => ({
  kind: "steps",
  steps: Array.from({ length: MAX_STEPS }, emptyStep),
});

describe("note operations", () => {
  it("adds chords and replaces the same pitch", () => {
    const l = lane();
    addNote(l, 0, { pitch: 60, length: 1, velocity: 0.5 });
    addNote(l, 0, { pitch: 64, length: 2, velocity: 0.9 });
    addNote(l, 0, { pitch: 60, length: 4, velocity: 0.7 });
    expect(l.steps[0].notes).toEqual([
      { pitch: 60, length: 4, velocity: 0.7 },
      { pitch: 64, length: 2, velocity: 0.9 },
    ]);
    expect(l.steps[0].on).toBe(true);
    expect(l.steps[0].velocity).toBe(0.9);
  });

  it("turns a step off when its last note is removed", () => {
    const l = lane();
    addNote(l, 3, { pitch: 48, length: 1, velocity: 0.8 });
    removeNote(l, { step: 3, pitch: 48 });
    expect(l.steps[3].on).toBe(false);
    expect(listNotes(l, 16)).toEqual([]);
  });

  it("moves notes together and keeps them inside the lane", () => {
    const l = lane();
    addNote(l, 1, { pitch: 60, length: 1, velocity: 0.8 });
    addNote(l, 2, { pitch: 62, length: 1, velocity: 0.8 });
    const to = moveNotes(
      l,
      [
        { step: 1, pitch: 60 },
        { step: 2, pitch: 62 },
      ],
      20,
      -2,
      16,
    );
    expect(to).toEqual([
      { step: 14, pitch: 58 },
      { step: 15, pitch: 60 },
    ]);
    expect(listNotes(l, 16).map((n) => [n.step, n.pitch])).toEqual([
      [14, 58],
      [15, 60],
    ]);
  });

  it("resizes notes with a minimum of one step", () => {
    const l = lane();
    addNote(l, 0, { pitch: 60, length: 2, velocity: 0.8 });
    resizeNotes(l, [{ step: 0, pitch: 60 }], (n) => n - 5);
    expect(l.steps[0].notes![0].length).toBe(1);
  });
});
