import { describe, expect, it } from "vitest";
import { CHORD_TYPE_COLOR, EXTENSION_COLOR, deviceRgb, padColors } from "./padColors";

describe("pad colors (D144)", () => {
  const tracks = [{ color: "#ef4444" }, { color: "#22c55e" }, { color: "#3b82f6" }];

  it("in Drum mode, the colors of the tracks the pads play; unlit without a track", () => {
    expect(padColors(tracks, "drum")).toEqual([
      "#ef4444",
      "#22c55e",
      "#3b82f6",
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("in Chord and Key mode, the chord types blue and the extensions purple", () => {
    for (const mode of ["chord", "key"] as const) {
      const c = padColors(tracks, mode);
      expect(c.slice(0, 4)).toEqual(Array(4).fill(CHORD_TYPE_COLOR));
      expect(c.slice(4)).toEqual(Array(4).fill(EXTENSION_COLOR));
    }
  });

  it("converts to the device's 7-bit RGB", () => {
    expect(deviceRgb("#ffffff")).toEqual([127, 127, 127]);
    expect(deviceRgb("#ff0080")).toEqual([127, 0, 64]);
    expect(deviceRgb(null)).toEqual([0, 0, 0]);
    expect(deviceRgb("red")).toEqual([0, 0, 0]);
  });
});
