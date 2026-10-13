import { describe, expect, it } from "vitest";
import { easeAt, inShape, isLinear, outShape, type Ease } from "./ease";

const slope = (f: (t: number) => number, t: number) => (f(t + 1e-4) - f(t - 1e-4)) / 2e-4;

describe("eases (D196)", () => {
  const types: Ease[] = [
    { type: "linear" },
    { type: "smooth", strength: 0.7 },
    { type: "exponential", strength: 0.6 },
    { type: "bounce", strength: 0.8 },
  ];

  it("every ease starts at 0 and ends at 1", () => {
    for (const a of types)
      for (const b of types) {
        expect(easeAt(a, b, 0)).toBeCloseTo(0, 6);
        expect(easeAt(a, b, 1)).toBeCloseTo(1, 6);
      }
  });

  it("the start follows the ease out, the end the ease in", () => {
    const smooth: Ease = { type: "smooth", strength: 1 };
    // a smooth departure starts flat, a linear arrival keeps its slope
    expect(slope((t) => easeAt(smooth, undefined, t), 0.0002)).toBeLessThan(0.1);
    expect(slope((t) => easeAt(undefined, smooth, t), 0.9998)).toBeLessThan(0.1);
    expect(slope((t) => easeAt(smooth, undefined, t), 0.9998)).toBeGreaterThan(0.9);
  });

  it("strength 0 is linear for every type, and None holds", () => {
    for (const e of types) {
      const zero = { ...e, strength: 0 };
      expect(isLinear(zero, zero)).toBe(true);
      expect(outShape(zero, 0.3)).toBeCloseTo(0.3);
      expect(inShape(zero, 0.3)).toBeCloseTo(0.3);
    }
    expect(easeAt({ type: "none" }, undefined, 0.99)).toBe(0);
    expect(easeAt({ type: "none" }, undefined, 1)).toBe(1);
  });

  it("an exponential departure starts slowly; a bounce overshoots on the way in", () => {
    expect(easeAt({ type: "exponential", strength: 1 }, undefined, 0.5)).toBeLessThan(0.3);
    const values = Array.from({ length: 101 }, (_, i) =>
      easeAt(undefined, { type: "bounce", strength: 1 }, i / 100),
    );
    // it reaches the target and falls back before landing
    const reached = values.findIndex((v) => v > 0.98);
    expect(Math.min(...values.slice(reached))).toBeLessThan(0.97);
  });
});
