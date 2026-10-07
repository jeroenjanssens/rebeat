import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { demoProject } from "../mock/demoProject";
import { notesLabel, noteName } from "./notes";
import {
  cloneSlot,
  copySlot,
  deleteSlot,
  doublePattern,
  euclid,
  linkCount,
  slotPattern,
  unlinkSlot,
  type Project,
} from "./project";
import type { StepLane } from "./types";

const firstDrumLane = (p: Project, slotId: string) => {
  const pattern = slotPattern(p, slotId);
  return pattern.lanes[p.tracks[0].id] as StepLane;
};

describe("pages", () => {
  it("clones share content; editing one edits all", () => {
    const base = demoProject();
    let cloneId = "";
    const p = produce(base, (d) => void (cloneId = cloneSlot(d, "slot-verse")));
    expect(linkCount(p, slotPattern(p, "slot-verse").id)).toBe(2);
    const edited = produce(p, (d) => void (firstDrumLane(d, cloneId).steps[1].on = true));
    expect(firstDrumLane(edited, "slot-verse").steps[1].on).toBe(true);
  });

  it("copies are independent", () => {
    let copyId = "";
    const p = produce(demoProject(), (d) => void (copyId = copySlot(d, "slot-verse")));
    const edited = produce(p, (d) => void (firstDrumLane(d, copyId).steps[1].on = true));
    expect(firstDrumLane(edited, "slot-verse").steps[1].on).toBe(false);
    expect(firstDrumLane(edited, copyId).steps[1].on).toBe(true);
  });

  it("unlink turns a clone into a copy", () => {
    const base = demoProject(); // slot-intro-2 is a clone of slot-intro
    expect(slotPattern(base, "slot-intro").id).toBe(slotPattern(base, "slot-intro-2").id);
    const p = produce(base, (d) => unlinkSlot(d, "slot-intro-2"));
    expect(slotPattern(p, "slot-intro").id).not.toBe(slotPattern(p, "slot-intro-2").id);
  });

  it("deleting the last reference removes the pattern", () => {
    const base = demoProject();
    const id = slotPattern(base, "slot-fill").id;
    const p = produce(base, (d) => deleteSlot(d, "slot-fill"));
    expect(p.patterns[id]).toBeUndefined();
  });

  it("×2 doubles the length and duplicates the steps", () => {
    const p = produce(demoProject(), (d) => doublePattern(slotPattern(d, "slot-verse")));
    const lane = firstDrumLane(p, "slot-verse");
    expect(slotPattern(p, "slot-verse").stepCount).toBe(32);
    expect(lane.steps.slice(16, 32).map((s) => s.on)).toEqual(
      lane.steps.slice(0, 16).map((s) => s.on),
    );
  });
});

describe("helpers", () => {
  it("euclid spreads pulses evenly", () => {
    expect(euclid(4, 16).filter(Boolean)).toHaveLength(4);
    expect(
      euclid(3, 8)
        .map((b) => (b ? "x" : "."))
        .join(""),
    ).toBe("x..x..x.");
  });

  it("names notes and chords", () => {
    expect(noteName(60)).toBe("C4");
    expect(notesLabel([60, 63, 67], true)).toBe("Cm");
    expect(notesLabel([56, 60, 63], true)).toBe("A♭");
  });
});
