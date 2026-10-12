import { describe, expect, it } from "vitest";
import {
  LANES,
  PATTERNS,
  PATTERN_GROUPS,
  bassRoot,
  laneNotes,
  parseLane,
  patternBeats,
  patternById,
  patternHits,
  type ChordInfo,
} from "./patterns";

describe("the pattern notation (D174)", () => {
  it("reads hits, accents, velocities and holds", () => {
    expect(parseLane("X-x.o9--.", "chord")).toEqual([
      { at: 0, length: 2, vel: 1, part: "chord" },
      { at: 2, length: 1, vel: 0.8, part: "chord" },
      { at: 4, length: 1, vel: 0.55, part: "chord" },
      { at: 5, length: 3, vel: 0.9, part: "chord" },
    ]);
    expect(() => parseLane("X?..", "all")).toThrow();
  });

  it("has 53 patterns in nine groups, ids unique, hits inside, lanes known", () => {
    expect(PATTERNS).toHaveLength(53);
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(53);
    for (const p of PATTERNS) {
      expect(PATTERN_GROUPS).toContain(p.group);
      expect([3, 4, 6]).toContain(p.division);
      expect(p.about.length).toBeGreaterThan(5);
      for (const s of p.steps) {
        expect(LANES).toContain(s.part);
        expect(s.at).toBeGreaterThanOrEqual(0);
        expect(s.at).toBeLessThan(p.length);
      }
      // whole beats, and 4/4 bars unless it says otherwise
      if (!p.tag || p.tag === "triplets") expect(patternBeats(p)).toBe(4);
    }
    // in group order (knob 7 steps through them so)
    const order = PATTERNS.map((p) => PATTERN_GROUPS.indexOf(p.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("keeps the old ones as they were, and plays triplets", () => {
    const oompah = patternById("oompah");
    expect(patternHits(oompah, 0).map((s) => s.part)).toEqual(["bass"]);
    expect(patternHits(oompah, 4).map((s) => s.part)).toEqual(["chord"]);
    const shuffle = patternById("shuffle");
    expect(shuffle.division).toBe(3);
    expect(patternBeats(shuffle)).toBe(4);
    expect(patternById("tripletballad").tag).toBe("12/8");
    expect(patternBeats(patternById("waltz"))).toBe(3);
    expect(patternBeats(patternById("clave"))).toBe(8);
    expect(patternById("trap").division).toBe(6);
  });
});

describe("which notes a hit plays (D176)", () => {
  // C major voiced C4 E4 G4, no bass
  const C: ChordInfo = { notes: [60, 64, 67], bass: [], root: 60, tones: [0, 4, 7] };
  const Am: ChordInfo = { notes: [64, 69, 72], bass: [], root: 69, tones: [0, 3, 7] };
  const pick = (lane: Parameters<typeof laneNotes>[0], c = C) => laneNotes(lane, c).notes;

  it("chord tones in the bass's register, under the chord", () => {
    expect(bassRoot(C)).toBe(48);
    expect(pick("root")).toEqual([48]);
    expect(pick("3")).toEqual([52]);
    expect(pick("5")).toEqual([55]);
    expect(pick("8")).toEqual([60]);
    expect(pick("7")).toEqual([60]); // a triad: the octave
    expect(pick("3", Am)).toEqual([60]); // A2 + a minor third: C3... in Am's register
    expect(laneNotes("root", C).bass).toBe(true);
  });

  it("with a bass, from the bass", () => {
    const withBass = { ...C, bass: [36] };
    expect(pick("root", withBass)).toEqual([36]);
    expect(pick("bass5", withBass)).toEqual([43]);
    expect(pick("bass8", withBass)).toEqual([48]);
  });

  it("broken chords: the voiced chord's low, middle and high notes", () => {
    expect(pick("low")).toEqual([60]);
    expect(pick("mid")).toEqual([64]);
    expect(pick("high")).toEqual([67]);
    expect(laneNotes("high", C).bass).toBe(false);
  });

  it("walks up the chord, and leans into the next one when it's known", () => {
    expect([0, 1, 2, 3].map((i) => laneNotes("walk", C, i).notes[0])).toEqual([48, 52, 55, 57]);
    // the next chord F: from a half step below F
    expect(laneNotes("walk", C, 3, 65).notes).toEqual([52]);
    // the next chord A♭ below: from a half step above
    expect(laneNotes("walk", C, 3, 56).notes).toEqual([45]);
  });
});
