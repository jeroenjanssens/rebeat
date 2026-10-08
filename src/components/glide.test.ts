import { describe, expect, it } from "vitest";
import { glideAt, glideDuration } from "./glide";

describe("glide", () => {
  it("takes 300 ms for the full range and less for shorter distances", () => {
    expect(glideDuration(1)).toBe(300);
    expect(glideDuration(-1)).toBe(300);
    expect(glideDuration(0.5)).toBe(150);
    expect(glideDuration(0.25)).toBe(75);
    expect(glideDuration(0.01)).toBe(60);
    expect(glideDuration(0)).toBe(0);
    expect(glideDuration(3)).toBe(300);
  });

  it("eases out and lands exactly on the target", () => {
    expect(glideAt(0, 1, 0, 300)).toBe(0);
    const mid = glideAt(0, 1, 150, 300);
    // ease-out: past the halfway point at half time
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
    expect(glideAt(0, 1, 300, 300)).toBe(1);
    expect(glideAt(0.2, 0.8, 1000, 300)).toBe(0.8);
    expect(glideAt(1, 0.5, 150, 300)).toBeLessThan(0.75);
  });

  it("moves monotonically", () => {
    let prev = -1;
    for (let t = 0; t <= 300; t += 10) {
      const v = glideAt(0, 1, t, 300);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
