import { describe, expect, it } from "vitest";
import { CHORD_TYPES, chordName } from "./chords";

const C3 = 48;

describe("chordName (D135, D136)", () => {
  it("names triads and sevenths, wherever the notes are", () => {
    expect(chordName([57, 60, 64])).toBe("Am");
    expect(chordName([60, 64, 67])).toBe("C");
    expect(chordName([48, 64, 67, 72])).toBe("C");
    expect(chordName([55, 59, 62, 65])).toBe("G7");
    expect(chordName([60, 64, 67, 71])).toBe("Cmaj7");
    expect(chordName([62, 65, 69, 72])).toBe("Dm7");
    expect(chordName([59, 62, 65])).toBe("Bdim");
    expect(chordName([60, 62, 67])).toBe("Csus2");
    expect(chordName([60, 67])).toBe("C5");
  });

  it("writes inversions with their bass", () => {
    expect(chordName([64, 67, 72])).toBe("C/E");
    expect(chordName([67, 72, 76])).toBe("C/G");
    expect(chordName([58, 60, 64, 67])).toBe("C7/B♭");
    expect(chordName([60, 62, 66, 69])).toBe("D7/C");
  });

  it("finds nothing in a single note, an interval or a cluster", () => {
    expect(chordName([60])).toBeNull();
    expect(chordName([60, 72])).toBeNull();
    expect(chordName([60, 64])).toBeNull();
    expect(chordName([60, 61, 62])).toBeNull();
  });

  it("knows every chord symbol in root position, in any key and voicing", () => {
    for (const { suffix, semitones } of CHORD_TYPES) {
      expect(chordName(semitones.map((s) => C3 + s)), suffix).toBe(`C${suffix}`);
      // in A, every tone above the root an octave higher
      expect(chordName(semitones.map((s) => 57 + (s ? s + 12 : 0))), suffix).toBe(`A${suffix}`);
    }
  });

  it("names the common families by their usual symbols", () => {
    const at = (...semitones: number[]) => chordName(semitones.map((s) => C3 + s));
    expect(at(0, 4, 8)).toBe("Caug");
    expect(at(0, 3, 6, 9)).toBe("Cdim7");
    expect(at(0, 3, 6, 10)).toBe("Cm7♭5");
    expect(at(0, 3, 7, 11)).toBe("Cm(maj7)");
    expect(at(0, 4, 7, 9, 14)).toBe("C6/9");
    expect(at(0, 4, 7, 10, 14)).toBe("C9");
    expect(at(0, 3, 7, 10, 14, 17)).toBe("Cm11");
    expect(at(0, 4, 7, 10, 14, 21)).toBe("C13");
    expect(at(0, 4, 7, 10, 13)).toBe("C7♭9");
    expect(at(0, 4, 7, 10, 15)).toBe("C7♯9");
    expect(at(0, 4, 8, 10)).toBe("C7♯5");
    expect(at(0, 4, 7, 11, 18)).toBe("Cmaj7♯11");
    expect(at(0, 5, 7, 10, 14)).toBe("C9sus4");
  });

  it("allows the usual omissions: the fifth of sevenths, the ninth of thirteenths", () => {
    const at = (...semitones: number[]) => chordName(semitones.map((s) => C3 + s));
    expect(at(0, 4, 10)).toBe("C7");
    expect(at(0, 4, 11)).toBe("Cmaj7");
    expect(at(0, 3, 10)).toBe("Cm7");
    expect(at(0, 4, 10, 14)).toBe("C9");
    expect(at(0, 4, 10, 21)).toBe("C13");
    expect(at(0, 4, 9, 14)).toBe("C6/9");
    // a sixth without its fifth is an inverted triad
    expect(at(0, 4, 9)).toBe("Am/C");
    expect(at(0, 3, 9)).toBe("Adim/C");
  });

  it("prefers the commoner reading of the same notes", () => {
    // the bass as the root wins between equals
    expect(chordName([48, 52, 55, 57])).toBe("C6");
    expect(chordName([57, 60, 64, 67])).toBe("Am7");
    expect(chordName([51, 54, 58, 60])).toBe("E♭m6");
    // symmetric chords take their bass as the root
    expect(chordName([52, 55, 58, 61])).toBe("Edim7");
    expect(chordName([56, 60, 64])).toBe("A♭aug");
    // a rootless ninth is a half-diminished seventh
    expect(chordName([52, 55, 58, 62])).toBe("Em7♭5");
  });
});
