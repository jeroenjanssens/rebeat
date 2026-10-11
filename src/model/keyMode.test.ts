import { describe, expect, it } from "vitest";
import { chordName } from "./chords";
import { keyModeChord, keyModeKeyFrom, stepKeyRoot, stepKeyScale } from "./keyMode";

const [MIN, MAJ, SIX, M7, MAJ7, NINE] = [1, 2, 4, 5, 6, 7];
const C_MAJOR = { root: 0, scale: "major" };
const A_MINOR = { root: 9, scale: "minor" };
const name = (pressed: number, key = C_MAJOR, pads: number[] = []) =>
  chordName(keyModeChord(pressed, key, pads));

describe("Key mode (D138)", () => {
  it("plays the diatonic triad on every degree", () => {
    expect(keyModeChord(60, C_MAJOR, [])).toEqual([60, 64, 67]);
    expect(keyModeChord(62, C_MAJOR, [])).toEqual([62, 65, 69]);
    expect(keyModeChord(71, C_MAJOR, [])).toEqual([71, 74, 77]);
    expect([60, 62, 64, 65, 67, 69, 71].map((n) => name(n))).toEqual([
      "C",
      "Dm",
      "Em",
      "F",
      "G",
      "Am",
      "Bdim",
    ]);
    expect(name(55, A_MINOR)).toBe("G");
    expect(name(57, A_MINOR)).toBe("Am");
    expect(name(62, { root: 2, scale: "dorian" })).toBe("Dm");
    expect(name(67, { root: 2, scale: "dorian" })).toBe("G");
  });

  it("moves a key outside the key into it first", () => {
    expect(keyModeChord(61, C_MAJOR, [])).toEqual([60, 64, 67]);
    expect(name(66)).toBe("F");
  });

  it("adds the key's own sixth, seventh and ninth", () => {
    expect(name(67, C_MAJOR, [M7])).toBe("G7");
    expect(name(67, C_MAJOR, [MAJ7])).toBe("G7");
    expect(name(60, C_MAJOR, [MAJ7])).toBe("Cmaj7");
    expect(name(62, C_MAJOR, [M7])).toBe("Dm7");
    expect(name(71, C_MAJOR, [M7])).toBe("Bm7♭5");
    expect(keyModeChord(60, C_MAJOR, [SIX, NINE])).toEqual([60, 64, 67, 69, 74]);
    expect(name(57, A_MINOR, [M7, NINE])).toBe("Am9");
  });

  it("plays a chord type pad's chord on the key as pressed (borrowed chords)", () => {
    expect(name(58, C_MAJOR, [MAJ])).toBe("B♭");
    expect(name(56, C_MAJOR, [MAJ, M7])).toBe("A♭7");
    expect(name(65, C_MAJOR, [MIN])).toBe("Fm");
  });

  it("steps the root and the scale, wrapping", () => {
    expect(stepKeyRoot({ root: 11, scale: "major" }, 1)).toEqual({ root: 0, scale: "major" });
    expect(stepKeyRoot(C_MAJOR, -1)).toEqual({ root: 11, scale: "major" });
    expect(stepKeyScale(C_MAJOR, 1)).toEqual({ root: 0, scale: "minor" });
    expect(stepKeyScale(C_MAJOR, -1)).toEqual({ root: 0, scale: "harmonicMinor" });
  });

  it("takes the parent scale of a pentatonic or blues key", () => {
    expect(keyModeKeyFrom({ root: 9, scale: "pentMinor" })).toEqual(A_MINOR);
    expect(keyModeKeyFrom({ root: 7, scale: "pentMajor" })).toEqual({ root: 7, scale: "major" });
    expect(keyModeKeyFrom({ root: 2, scale: "dorian" })).toEqual({ root: 2, scale: "dorian" });
  });
});
