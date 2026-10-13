import { describe, expect, it, vi } from "vitest";

vi.mock("./engine", () => ({
  automateTarget: vi.fn(),
  automationState: () => ({ last: new Map(), live: false }),
  startRegion: vi.fn(),
}));

const { curveEvents } = await import("./automation");

const pts = (...list: [number, number, boolean?][]) =>
  list.map(([q, value, hold]) => ({ q, value, hold: !!hold }));

describe("curve events (D186)", () => {
  it("ramps to the points in the step and to the value at its end", () => {
    const e = curveEvents(pts([0, 0], [4, 1]), 1, 2, 10, 0.5, false);
    expect(e).toEqual([{ t: 10.5, v: 0.5, ramp: true }]);
  });

  it("a jump sets the value at the step's start first", () => {
    const e = curveEvents(pts([0, 0], [4, 1]), 1, 2, 10, 0.5, true);
    expect(e[0]).toEqual({ t: 10, v: 0.25, ramp: false });
  });

  it("a held point jumps at the next one", () => {
    const e = curveEvents(pts([0, 0.2, true], [1.5, 0.9]), 1, 2, 10, 1, false);
    expect(e).toEqual([
      { t: 10.5, v: 0.2, ramp: true },
      { t: 10.5, v: 0.9, ramp: false },
      { t: 11, v: 0.9, ramp: true },
    ]);
  });

  it("adds points inside the step for targets that can't ramp", () => {
    const e = curveEvents(pts([0, 0], [4, 1]), 0, 2, 0, 1, false, 1);
    expect(e.map((x) => x.v)).toEqual([0.25, 0.5]);
  });
});
