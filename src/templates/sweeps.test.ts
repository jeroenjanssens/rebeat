import { describe, expect, it } from "vitest";
import { isAutomatable, laneSteps } from "../model/automation";
import { BEND_SHAPES } from "../model/types";
import { sweepsAndBends } from "./sweeps";

describe("Sweeps and Bends (D239)", () => {
  const p = sweepsAndBends();

  it("bends its lead's notes in every shape", () => {
    const shapes = new Set<string>();
    for (const pt of Object.values(p.patterns))
      for (const lane of Object.values(pt.lanes))
        for (const st of lane.steps)
          for (const n of st.notes ?? []) if (n.bend) shapes.add(n.bend.shape);
    expect([...shapes].sort()).toEqual([...BEND_SHAPES].sort());
  });

  it("automates synth knobs and switches, all of them automatable", () => {
    for (const lane of p.automation!) expect(isAutomatable(p, lane.target), lane.target).toBe(true);
    const synthLanes = p.automation!.filter((l) => l.target.includes(":synth:"));
    expect(synthLanes.length).toBeGreaterThanOrEqual(5);
    // smooth ones and stepped ones
    expect(p.automation!.some((l) => !laneSteps(p, l.target))).toBe(true);
    expect(p.automation!.filter((l) => laneSteps(p, l.target)).length).toBeGreaterThanOrEqual(3);
  });

  it("stepped lanes sit on their bands", () => {
    for (const lane of p.automation!) {
      const n = laneSteps(p, lane.target);
      if (!n) continue;
      for (const pt of lane.points)
        expect(Math.abs(pt.value * (n - 1) - Math.round(pt.value * (n - 1)))).toBeLessThan(1e-9);
    }
  });
});
