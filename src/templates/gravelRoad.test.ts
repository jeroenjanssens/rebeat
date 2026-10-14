import { describe, expect, it } from "vitest";
import { isAutomatable, laneSteps } from "../model/automation";
import { layout } from "../model/arrangement";
import { patchOf } from "../library/synthTrack";
import { gravelRoad } from "./gravelRoad";

describe("Gravel Road", () => {
  const p = gravelRoad();

  it("is played by physical models: guitar, bass, banjo, fiddle, harmonica", () => {
    const physical = p.tracks.filter((t) => t.sound && patchOf(t.sound).source === "physical");
    expect(physical.map((t) => t.name).sort()).toEqual(
      ["Banjo", "Fiddle", "Guitar", "Harmonica", "Upright bass"].sort(),
    );
  });

  it("strums: a chord's strings start a little apart within their step", () => {
    const guitar = p.tracks.find((t) => t.name === "Guitar")!;
    const strums = Object.values(p.patterns).flatMap((pt) =>
      pt.lanes[guitar.id].steps.filter((s) => (s.notes?.length ?? 0) > 3),
    );
    expect(strums.length).toBeGreaterThan(20);
    for (const s of strums) {
      const offsets = s.notes!.map((n) => n.offset ?? 0);
      expect(offsets[offsets.length - 1]).toBeGreaterThan(offsets[0]);
      expect(Math.max(...offsets)).toBeLessThanOrEqual(0.5);
    }
  });

  it("goes up a whole step for the last chorus, mutes the banjo in the first verse, slows down", () => {
    expect(p.slots.filter((s) => s.transpose === 2)).toHaveLength(2);
    const banjo = p.tracks.find((t) => t.name === "Banjo")!;
    expect(p.slots[1].mutes).toEqual([banjo.id]);
    expect(p.tempo?.some((t) => t.ramp && t.bpm < p.bpm)).toBe(true);
    // about two minutes
    const quarters = layout(p).reduce((s, b) => s + b.span, 0);
    expect((quarters * 60) / p.bpm).toBeGreaterThan(100);
  });

  it("automates physical models' knobs and a stepped effect On, all automatable", () => {
    for (const lane of p.automation!) expect(isAutomatable(p, lane.target), lane.target).toBe(true);
    expect(p.automation!.some((l) => l.target.endsWith("physical.resonator.pickup"))).toBe(true);
    expect(p.automation!.some((l) => l.target.endsWith("physical.exciter.pressure"))).toBe(true);
    expect(
      p.automation!.some((l) => l.target.endsWith(":on") && laneSteps(p, l.target) === 2),
    ).toBe(true);
  });
});
