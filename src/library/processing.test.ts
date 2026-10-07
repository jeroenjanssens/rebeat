import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  ahdsrAt,
  applySimple,
  curve,
  envelopeAt,
  nearestZeroCrossing,
} from "./processing";

const ramp = (n: number) => Float32Array.from({ length: n }, (_, i) => i / n);

describe("sample processing", () => {
  it("trims, reverses and normalizes", () => {
    const [out] = applySimple([ramp(100)], 100, {
      ...DEFAULT_SETTINGS,
      trimStart: 0.1,
      trimEnd: 0.5,
      reverse: true,
      normalize: true,
    });
    expect(out.length).toBe(40);
    expect(out[0]).toBeCloseTo(0.98);
    expect(out[39]).toBeCloseTo((0.1 / 0.49) * 0.98, 2);
  });

  it("fades in and out", () => {
    const [out] = applySimple([new Float32Array(100).fill(1)], 100, {
      ...DEFAULT_SETTINGS,
      fadeIn: 0.1,
      fadeOut: 0.1,
    });
    expect(out[0]).toBe(0);
    expect(out[5]).toBeCloseTo(0.5);
    expect(out[50]).toBe(1);
    expect(out[99]).toBe(0);
  });

  it("removes DC offset", () => {
    const [out] = applySimple([new Float32Array(10).fill(0.3)], 10, {
      ...DEFAULT_SETTINGS,
      dcRemove: true,
    });
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(1e-6);
  });

  it("has fade curves and envelopes", () => {
    expect(curve(0.5, "exp")).toBe(0.25);
    expect(curve(0.5, "scurve")).toBeCloseTo(0.5);
    const env = { a: 0.1, h: 0.1, d: 0.1, s: 0.5, r: 0.2 };
    expect(ahdsrAt(0.05, 1, env)).toBeCloseTo(0.5);
    expect(ahdsrAt(0.15, 1, env)).toBe(1);
    expect(ahdsrAt(0.5, 1, env)).toBe(0.5);
    expect(ahdsrAt(0.9, 1, env)).toBeCloseTo(0.25);
    expect(
      envelopeAt(
        [
          { time: 0, volume: 1 },
          { time: 1, volume: 0 },
        ],
        0.25,
      ),
    ).toBeCloseTo(0.75);
  });

  it("finds zero crossings", () => {
    const d = Float32Array.from([0.5, 0.4, 0.2, -0.1, -0.3]);
    expect(nearestZeroCrossing(d, 1)).toBe(3);
  });
});
