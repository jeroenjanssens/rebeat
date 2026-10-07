import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { demoProject } from "../templates/nightDrive";
import {
  arpOrder,
  chordInKey,
  inKey,
  keyUsesFlats,
  notesLabel,
  noteName,
  snapToKey,
} from "./notes";
import {
  cloneSlot,
  convertTrack,
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

describe("convertTrack", () => {
  it("turns drum hits into notes and back", () => {
    const p = demoProject();
    const kick = p.tracks[0];
    convertTrack(p, kick.id, "instrument");
    const lane = Object.values(p.patterns)[1].lanes[kick.id];
    expect(kick.kind).toBe("instrument");
    expect(lane.kind === "steps" && lane.steps[0].notes).toEqual([
      { pitch: 60, length: 1, velocity: 1 },
    ]);
    convertTrack(p, kick.id, "drum");
    expect(lane.kind === "steps" && lane.steps[0].notes).toBeUndefined();
    expect(kick.params["sound.tune"]).toBe(0.5);
  });

  it("gives audio tracks a clip lane", () => {
    const p = demoProject();
    convertTrack(p, p.tracks[0].id, "audio");
    expect(Object.values(p.patterns)[0].lanes[p.tracks[0].id].kind).toBe("clip");
  });
});

describe("keys and chords", () => {
  it("knows which notes are in a key", () => {
    expect(inKey(63, { root: 0, scale: "minor" })).toBe(true); // E♭
    expect(inKey(64, { root: 0, scale: "minor" })).toBe(false); // E
  });
  it("uses flats or sharps following the key", () => {
    expect(keyUsesFlats({ root: 0, scale: "minor" })).toBe(true);
    expect(keyUsesFlats({ root: 4, scale: "major" })).toBe(false);
    expect(keyUsesFlats({ root: 5, scale: "major" })).toBe(true);
    expect(keyUsesFlats({ root: 2, scale: "dorian" })).toBe(false); // D dorian = C major
    expect(keyUsesFlats({ root: 2, scale: "minor" })).toBe(true); // D minor = F major
  });
  it("builds diatonic chords", () => {
    expect(chordInKey(60, { root: 0, scale: "minor" }, 3)).toEqual([60, 63, 67]);
    expect(chordInKey(67, { root: 0, scale: "major" }, 4)).toEqual([67, 71, 74, 77]);
    expect(snapToKey(64, { root: 0, scale: "minor" })).toBe(63);
  });
  it("orders arpeggios", () => {
    expect(arpOrder([60, 64, 67], "updown", 1)).toEqual([60, 64, 67, 64]);
    expect(arpOrder([60, 64], "up", 2)).toEqual([60, 64, 72, 76]);
  });
});
