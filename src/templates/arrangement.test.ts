import { describe, expect, it } from "vitest";
import { layout, toSong } from "../model/arrangement";
import { isAutomatable } from "../model/automation";
import { tempoMap } from "../model/tempoMap";
import { longWayHome } from "./arrangement";

describe("Long Way Home (D194)", () => {
  const p = longWayHome();

  it("uses every section setting, on clones", () => {
    expect(p.slots.some((s) => s.mutes?.length)).toBe(true);
    expect(p.slots.some((s) => s.transpose === 2)).toBe(true);
    expect(p.slots.some((s) => s.fill === "last")).toBe(true);
    expect(p.slots.some((s) => s.steps === 8)).toBe(true);
    // four patterns, ten sections
    expect(Object.keys(p.patterns)).toHaveLength(4);
    expect(p.slots).toHaveLength(10);
  });

  it("has a tempo jump and ramps both ways", () => {
    const segs = tempoMap(p);
    expect(segs.some((s) => s.to > s.bpm)).toBe(true);
    expect(segs.some((s) => s.to < s.bpm)).toBe(true);
    expect(segs.some((s, i) => i > 0 && s.bpm !== segs[i - 1].to)).toBe(true);
  });

  it("has automation over several sections, all of it automatable", () => {
    for (const lane of p.automation!) expect(isAutomatable(p, lane.target), lane.target).toBe(true);
    const brightness = p.automation!.find((l) => l.id === "auto-brightness")!;
    expect(new Set(brightness.points.map((x) => x.slotId)).size).toBeGreaterThan(1);
  });

  it("a vocal crosses a section boundary, and no vocal is in a tempo change or a transposed section", () => {
    const blocks = layout(p);
    const segs = tempoMap(p).filter((s) => s.bpm !== s.to || s.bpm !== 112);
    let crosses = false;
    for (const r of p.regions!) {
      const q0 = toSong(p, r.start)!;
      const q1 = q0 + r.length;
      const inside = blocks.filter((b) => b.start < q1 && b.start + b.span > q0);
      if (inside.length > 1) crosses = true;
      for (const b of inside) expect(b.section.transpose ?? 0).toBe(0);
      for (const s of segs)
        expect(s.end <= q0 || s.q >= q1, `${r.id} in a tempo change`).toBe(true);
    }
    expect(crosses).toBe(true);
  });
});
