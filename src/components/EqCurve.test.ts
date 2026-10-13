import { describe, expect, it } from "vitest";
import { expo } from "../model/params";
import { eqResponse } from "./EqCurve";

describe("the Parametric EQ's curve (D216)", () => {
  it("is flat with every gain at 0 dB and the cuts off", () => {
    for (const f of [40, 100, 1000, 5000, 15000])
      expect(Math.abs(eqResponse({}, f))).toBeLessThan(0.15);
  });

  it("a peak lifts its frequency by its gain; a low cut removes the lows", () => {
    const f = expo(20, 20000)(0.45);
    expect(eqResponse({ p1Gain: 1 }, f)).toBeCloseTo(15, 0);
    expect(eqResponse({ lowCut: 0.4 }, 30)).toBeLessThan(-20);
  });
});
