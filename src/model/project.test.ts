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
  copySlot,
  deleteSlot,
  doublePattern,
  euclid,
  linkCount,
  setMode,
  slotPattern,
  unlinkSlot,
  type Project,
} from "./project";
import type { Lane } from "./types";

const firstDrumLane = (p: Project, slotId: string) => {
  const pattern = slotPattern(p, slotId);
  return pattern.lanes[p.tracks[0].id] as Lane;
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

describe("setMode (D93)", () => {
  const laneOf = (p: Project, trackId: string, page = 1) =>
    Object.values(p.patterns)[page].lanes[trackId];

  it("Hits → Notes writes notes for the hits, and the sample's Tune becomes the transpose", () => {
    const p = demoProject();
    const kick = p.tracks[0];
    kick.params["sound.tune"] = 0.5 + 3 / 48; // +3 semitones
    setMode(p, kick.id, "notes");
    expect(kick.mode).toBe("notes");
    expect(kick.sound).toEqual({ source: "sample", sampleId: "kit:909:kick" });
    expect(kick.transpose).toBe(3);
    // the sample's root (C4) plus the step's pitch
    expect(laneOf(p, kick.id).steps[0].notes).toEqual([{ pitch: 60, length: 1, velocity: 1 }]);
    // the voice's knobs are added, the hits' are kept
    expect(kick.params["sound.envDecay"]).toBeDefined();
    expect(kick.params["sound.tune"]).toBeCloseTo(0.5 + 3 / 48);
  });

  it("loses nothing on a round trip: Hits → Notes → Clip → Hits", () => {
    const p = demoProject();
    const kick = p.tracks[0];
    const before = structuredClone(laneOf(p, kick.id).steps);
    const params = { ...kick.params };
    setMode(p, kick.id, "notes");
    laneOf(p, kick.id).steps[0].notes![0].pitch = 67;
    setMode(p, kick.id, "clip");
    expect(laneOf(p, kick.id).clip).toEqual({ active: true, launchMode: "loop" });
    setMode(p, kick.id, "hits");
    const after = laneOf(p, kick.id).steps;
    expect(after.map((s) => [s.on, s.pitch, s.velocity])).toEqual(
      before.map((s) => [s.on, s.pitch, s.velocity]),
    );
    for (const [k, v] of Object.entries(params)) expect(kick.params[k]).toBe(v);
    // and the notes are still there for the next time it plays notes
    setMode(p, kick.id, "notes");
    expect(laneOf(p, kick.id).steps[0].notes![0].pitch).toBe(67);
  });

  it("a synth plays hits at its hit note; only samples play clips", () => {
    const p = demoProject();
    const bass = p.tracks.find((t) => t.mode === "notes")!;
    setMode(p, bass.id, "hits");
    expect(bass.mode).toBe("hits");
    expect(bass.sound?.source).toBe("synth");
    setMode(p, bass.id, "clip");
    expect(bass.mode).toBe("hits");
  });

  it("a Clip track plays notes of its sample", () => {
    const p = demoProject();
    const vox = p.tracks.find((t) => t.mode === "clip")!;
    setMode(p, vox.id, "notes");
    expect(vox.sound).toEqual({ source: "sample", sampleId: "demo:vox-hook" });
    // its clip settings wait for the next time it plays as a clip
    const drop = Object.values(p.patterns).find((x) => x.name === "Drop")!;
    expect(drop.lanes[vox.id].clip?.launchMode).toBe("oneshot");
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
