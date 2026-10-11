import { describe, expect, it } from "vitest";
import { chordName } from "./chords";

describe("chordName (D135)", () => {
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
  });

  it("finds nothing in a single note or a cluster", () => {
    expect(chordName([60])).toBeNull();
    expect(chordName([60, 72])).toBeNull();
    expect(chordName([60, 61, 62])).toBeNull();
  });
});
