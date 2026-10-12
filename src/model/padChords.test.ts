import { describe, expect, it } from "vitest";
import { chordName } from "./chords";
import { padChord, padChordLabel, padChordTones, voiceChord } from "./padChords";

const [DIM, MIN, MAJ, SUS, SIX, M7, MAJ7, NINE] = [0, 1, 2, 3, 4, 5, 6, 7];
const C3 = 48;
const name = (...pads: number[]) => chordName(padChord(C3, pads)!);

describe("chord pads (D137)", () => {
  it("plays nothing but the key without a chord type", () => {
    expect(padChord(C3, [])).toBeNull();
    expect(padChord(C3, [M7, NINE])).toBeNull();
  });

  it("builds the four chord types up from the key", () => {
    expect(padChord(C3, [MAJ])).toEqual([48, 52, 55]);
    expect(name(DIM)).toBe("Cdim");
    expect(name(MIN)).toBe("Cm");
    expect(name(MAJ)).toBe("C");
    expect(name(SUS)).toBe("Csus4");
  });

  it("adds the extensions: 6, m7, M7 and 9 (an octave up)", () => {
    expect(padChord(C3, [MAJ, NINE])).toEqual([48, 52, 55, 62]);
    expect(name(MAJ, M7)).toBe("C7");
    expect(name(MAJ, MAJ7)).toBe("Cmaj7");
    expect(name(MIN, M7)).toBe("Cm7");
    expect(name(MIN, MAJ7)).toBe("Cm(maj7)");
    expect(name(SUS, M7)).toBe("C7sus4");
    expect(name(DIM, SIX)).toBe("Cdim7");
    expect(name(DIM, M7)).toBe("Cm7♭5");
    expect(name(MAJ, SIX, NINE)).toBe("C6/9");
    expect(name(MAJ, M7, NINE)).toBe("C9");
    expect(name(MIN, M7, NINE)).toBe("Cm9");
    expect(name(MAJ, MAJ7, NINE)).toBe("Cmaj9");
  });

  it("makes the secret chords from two chord types", () => {
    expect(name(DIM, SUS)).toBe("C5");
    expect(name(MAJ, SUS)).toBe("Caug");
    expect(name(MIN, SUS)).toBe("Cmadd11");
    expect(name(MAJ, MIN)).toBe("C7♯9");
    expect(padChord(C3, [MIN, DIM])).toEqual([48, 51, 55, 56]);
    expect(padChord(C3, [MAJ, DIM])).toEqual([48, 52, 55, 56]);
    // the order they're pressed in doesn't matter
    expect(padChordTones([SUS, MAJ])).toEqual(padChordTones([MAJ, SUS]));
  });

  it("doesn't stack the extension a secret chord lists, but adds the others", () => {
    expect(padChordTones([MIN, DIM, SIX])).toEqual(padChordTones([MIN, DIM]));
    expect(padChordTones([MAJ, MIN, M7])).toEqual(padChordTones([MAJ, MIN]));
    expect(padChordTones([DIM, SUS, NINE])).toEqual([0, 7, 14]);
  });

  it("counts the first two chord types pressed", () => {
    expect(padChordTones([MAJ, SUS, MIN])).toEqual(padChordTones([MAJ, SUS]));
  });

  it("keeps the notes within MIDI's range", () => {
    expect(padChord(120, [MAJ, NINE])).toEqual([120, 124, 127]);
  });

  it("reads the pads as the buttons do", () => {
    expect(padChordLabel([MAJ7, MAJ])).toBe("Maj + M7");
    expect(padChordLabel([])).toBe("");
  });
});

describe("chord voicing (D140)", () => {
  const C = [60, 64, 67];
  it("moves the lowest note up or the highest down, an octave a step", () => {
    expect(voiceChord(C, 0)).toEqual(C);
    expect(voiceChord(C, 1)).toEqual([64, 67, 72]);
    expect(voiceChord(C, 2)).toEqual([67, 72, 76]);
    expect(voiceChord(C, 3)).toEqual([72, 76, 79]);
    expect(voiceChord(C, -1)).toEqual([55, 60, 64]);
    expect(voiceChord(C, -2)).toEqual([52, 55, 60]);
    // a seventh: four steps to come round
    expect(voiceChord([60, 64, 67, 70], 4)).toEqual([72, 76, 79, 82]);
  });

  it("keeps the same chord, named as an inversion", () => {
    expect(chordName(voiceChord(C, 1))).toBe("C/E");
    expect(chordName(voiceChord(C, -1))).toBe("C/G");
  });

  it("stops at MIDI's edges", () => {
    expect(voiceChord([120, 124, 127], 2)).toEqual([120, 124, 127]);
    expect(voiceChord([0, 4, 7], -1)).toEqual([0, 4, 7]);
  });
});
