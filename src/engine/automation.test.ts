import { describe, expect, it, vi } from "vitest";

vi.mock("./engine", () => ({
  automateTarget: vi.fn(),
  automationState: () => ({ last: new Map(), live: false }),
  startRegion: vi.fn(),
}));

const { curveEvents } = await import("./automation");

const pts = (...list: [number, number, boolean?][]) =>
  list.map(([q, value, hold], index) => ({
    q,
    value,
    index,
    ...(hold ? { out: { type: "none" as const } } : {}),
  }));

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
      { t: 10.497, v: 0.2, ramp: true },
      { t: 10.5, v: 0.9, ramp: true },
      { t: 11, v: 0.9, ramp: true },
    ]);
  });

  it("adds points inside the step for targets that can't ramp", () => {
    const e = curveEvents(pts([0, 0], [4, 1]), 0, 2, 0, 1, false, 8, 1);
    expect(e.map((x) => x.v)).toEqual([0.25, 0.5]);
  });

  it("samples a step where the curve is eased (D197), not where it's straight", () => {
    const eased = [
      { q: 0, value: 0, index: 0, out: { type: "smooth" as const, strength: 1 } },
      { q: 4, value: 1, index: 1 },
    ];
    const e = curveEvents(eased, 0, 1, 0, 1, false, 8);
    expect(e).toHaveLength(9);
    // slow at first: the first sample is below the straight line
    expect(e[0].v).toBeLessThan(1 / 9 / 4);
    expect(curveEvents(pts([0, 0], [4, 1]), 0, 1, 0, 1, false, 8)).toHaveLength(1);
  });
});
