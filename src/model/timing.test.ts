import { describe, expect, it } from "vitest";
import { laneStepsWithin } from "./timing";

describe("laneStepsWithin", () => {
  it("plays two 1/32 lane steps per 1/16 page step", () => {
    const r = laneStepsWithin(3, 0.25, 0.125, 16);
    expect(r.steps).toEqual([
      { index: 6, offsetQ: 0 },
      { index: 7, offsetQ: 0.125 },
    ]);
    expect(r.current).toBe(6);
  });

  it("plays a 1/8 lane step every other 1/16 page step", () => {
    expect(laneStepsWithin(0, 0.25, 0.5, 8).steps).toEqual([{ index: 0, offsetQ: 0 }]);
    expect(laneStepsWithin(1, 0.25, 0.5, 8).steps).toEqual([]);
    expect(laneStepsWithin(1, 0.25, 0.5, 8).current).toBe(0);
    expect(laneStepsWithin(2, 0.25, 0.5, 8).steps).toEqual([{ index: 1, offsetQ: 0 }]);
  });

  it("places triplet steps inside straight page steps and wraps the lane length", () => {
    const r = laneStepsWithin(1, 0.25, 1 / 6, 3);
    expect(r.steps.map((s) => s.index)).toEqual([2]);
    expect(r.steps[0].offsetQ).toBeCloseTo(1 / 3 - 0.25);
  });
});
