import { describe, expect, it } from "vitest";
import { createTapTempo } from "./tempo";

describe("tap tempo", () => {
  it("averages the intervals between taps", () => {
    const tap = createTapTempo();
    expect(tap(0)).toBeNull();
    expect(tap(500)).toBe(120);
    expect(tap(1000)).toBe(120);
    expect(tap(1600)).toBeCloseTo(112.5, 0);
  });

  it("starts over after a long pause", () => {
    const tap = createTapTempo();
    tap(0);
    tap(400);
    expect(tap(5000)).toBeNull();
    expect(tap(5600)).toBe(100);
  });
});
