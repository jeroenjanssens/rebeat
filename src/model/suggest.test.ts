import { describe, expect, it } from "vitest";
import {
  PROGRESSIONS,
  isMinorKey,
  progressionById,
  progressionChords,
  progressionIndex,
  progressionsFor,
  qualityOf,
  romanOf,
  suggestNext,
  type Played,
} from "./suggest";

const C_MAJOR = { root: 0, scale: "major" };
const A_MINOR = { root: 9, scale: "minor" };
const chord = (root: number, quality: Played["quality"]): Played => ({ root, quality });
const names = (h: Played[], key = C_MAJOR, adv: 0 | 1 | 2 = 1, n = 8) =>
  suggestNext(h, key, adv, n).map((s) => s.name);

describe("reading what you played (D158)", () => {
  it("tells the chord's quality from its notes", () => {
    expect(qualityOf(60, [60, 64, 67])).toBe("maj");
    expect(qualityOf(62, [62, 65, 69])).toBe("min");
    expect(qualityOf(71, [71, 74, 77])).toBe("dim");
    expect(qualityOf(67, [67, 71, 74, 77])).toBe("7");
    expect(qualityOf(71, [71, 74, 77, 81])).toBe("m7b5");
    expect(qualityOf(60, [60, 65, 67])).toBeNull(); // sus
  });

  it("names chords by their roman numeral in the key", () => {
    expect(romanOf(0, "maj", C_MAJOR)).toBe("I");
    expect(romanOf(9, "min", C_MAJOR)).toBe("vi");
    expect(romanOf(10, "maj", C_MAJOR)).toBe("♭VII");
    expect(romanOf(2, "maj", C_MAJOR)).toBe("V/V");
    expect(romanOf(7, "7", C_MAJOR)).toBe("V7");
    expect(romanOf(9, "min", A_MINOR)).toBe("i");
    expect(romanOf(4, "maj", A_MINOR)).toBe("V");
    expect(romanOf(6, "maj", C_MAJOR)).toBeNull();
    expect(isMinorKey({ root: 2, scale: "dorian" })).toBe(true);
    expect(isMinorKey({ root: 7, scale: "mixolydian" })).toBe(false);
  });
});

describe("suggesting the next chord (D158)", () => {
  it("after C in C major: F, G and Am at the top; C itself left out", () => {
    const top = names([chord(0, "maj")], C_MAJOR, 1, 3);
    expect(top.sort()).toEqual(["Am", "F", "G"]);
    expect(names([chord(0, "maj")])).not.toContain("C");
  });

  it("follows the strong moves: G goes home to C, Dm on to G", () => {
    expect(names([chord(7, "maj")])[0]).toBe("C");
    expect(names([chord(2, "min")])[0]).toBe("G");
  });

  it("continues a famous progression, and says so", () => {
    const s = suggestNext([chord(0, "maj"), chord(7, "maj"), chord(9, "min")], C_MAJOR, 1);
    expect(s[0].name).toBe("F");
    expect(s[0].why).toMatch(/four-chord/);
    // the Andalusian cadence in A minor: Am G F → E
    const a = suggestNext([chord(9, "min"), chord(7, "maj"), chord(5, "maj")], A_MINOR, 1);
    expect(a[0].name).toBe("E");
    expect(a[0].why).toMatch(/Andalusian/);
  });

  it("Safe keeps to the key's own chords; Common borrows ♭VII; Bold goes further", () => {
    const diatonic = ["C", "Dm", "Em", "F", "G", "Am", "B°"];
    for (const n of names([chord(0, "maj")], C_MAJOR, 0)) expect(diatonic).toContain(n);
    expect(names([chord(0, "maj")], C_MAJOR, 1)).toContain("B♭");
    expect(names([chord(0, "maj")], C_MAJOR, 1)).not.toContain("A♭");
    expect(names([chord(0, "maj")], C_MAJOR, 2)).toContain("A♭");
  });

  it("starts from home with nothing played, and always fills the pads", () => {
    const s = suggestNext([], C_MAJOR, 0);
    expect(s[0].name).toBe("C");
    expect(s).toHaveLength(7); // Safe: the seven own chords
    expect(suggestNext([chord(0, "maj")], C_MAJOR, 2)).toHaveLength(8);
  });

  it("says how to play each one: the pads in Chord mode, and in Key mode", () => {
    const [g7] = suggestNext([chord(2, "min")], C_MAJOR, 1).filter((s) => s.name === "G7");
    expect(g7.pads).toEqual([2, 5]); // Maj + m7
    expect(g7.keyPads).toEqual([5]); // the key's own seventh
    const bb = suggestNext([chord(0, "maj")], C_MAJOR, 1).find((s) => s.name === "B♭")!;
    expect(bb.keyPads).toEqual([2]); // borrowed: Maj on B♭
    const f = suggestNext([chord(0, "maj")], C_MAJOR, 1).find((s) => s.name === "F")!;
    expect(f.keyPads).toEqual([]); // the key's own chord
    expect(f.role).toBe("away");
  });
});

describe("a progression picked for pad 1 (D161)", () => {
  const four = progressionById("four")!;
  it("puts its next chord first, wherever you are in it", () => {
    expect(names([], C_MAJOR, 1)[0]).toBe("C"); // nothing played: home anyway
    expect(suggestNext([], C_MAJOR, 1, 8, four)[0].name).toBe("C"); // its first chord
    expect(suggestNext([chord(0, "maj")], C_MAJOR, 1, 8, four)[0].name).toBe("G");
    expect(suggestNext([chord(0, "maj"), chord(7, "maj")], C_MAJOR, 1, 8, four)[0].name).toBe("Am");
    // jumping in on vi: on to IV, then round to I
    expect(suggestNext([chord(9, "min")], C_MAJOR, 1, 8, four)[0].name).toBe("F");
    expect(suggestNext([chord(5, "maj")], C_MAJOR, 1, 8, four)[0].name).toBe("C");
    // a chord from outside it: from its start
    expect(suggestNext([chord(4, "min")], C_MAJOR, 1, 8, four)[0].name).toBe("C");
  });

  it("plays its chords even beyond the adventure level, and the others follow", () => {
    const mixo = progressionById("mixo")!;
    const s = suggestNext([chord(0, "maj")], C_MAJOR, 0, 8, mixo);
    expect(s[0].name).toBe("B♭");
    expect(s[0].why).toMatch(/mixolydian/);
    expect(s.slice(1).map((x) => x.name)).not.toContain("B♭");
    expect(s).toHaveLength(7);
  });

  it("lists the major ones in a major key, the minor ones in a minor key", () => {
    expect(progressionsFor(C_MAJOR).map((p) => p.id)).toContain("royalroad");
    expect(progressionsFor(C_MAJOR).map((p) => p.id)).not.toContain("andalusian");
    expect(progressionsFor(A_MINOR).map((p) => p.id)).toContain("andalusian");
    expect(progressionChords(progressionById("royalroad")!, C_MAJOR).map((c) => c.name)).toEqual([
      "F",
      "G",
      "Em",
      "Am",
    ]);
    // a minor progression in a major key is ignored
    expect(suggestNext([], C_MAJOR, 1, 8, progressionById("andalusian"))[0].name).toBe("C");
  });

  it("knows where you are in a progression with repeated chords (the blues)", () => {
    const blues = progressionById("blues")!;
    const h = [chord(0, "maj"), chord(5, "maj"), chord(0, "maj")];
    expect(PROGRESSIONS.length).toBeGreaterThanOrEqual(18);
    expect(blues.chords[progressionIndex(blues, h, C_MAJOR)]).toBe("V");
  });
});
