import { describe, expect, it } from "vitest";
import { isAutomatable, laneSteps } from "../model/automation";
import { patchOf } from "../library/synthTrack";
import { woodWireAndGlass } from "./woodWireGlass";

describe("Wood, Wire and Glass (D259)", () => {
  const p = woodWireAndGlass();

  it("plays physical models and wavetables, some of them as hits", () => {
    const patches = p.tracks
      .filter((t) => t.sound?.source === "synth")
      .map((t) => patchOf(t.sound!));
    expect(patches.filter((x) => x.source === "physical").length).toBeGreaterThanOrEqual(6);
    expect(
      patches.filter((x) => x.osc.some((o) => o.type === "wavetable")).length,
    ).toBeGreaterThanOrEqual(3);
    expect(p.tracks.filter((t) => t.mode === "hits" && t.sound?.source === "synth")).toHaveLength(
      2,
    );
  });

  it("automates a position, a pickup, a macro and a table switch, all of them automatable", () => {
    for (const lane of p.automation!) expect(isAutomatable(p, lane.target), lane.target).toBe(true);
    const targets = p.automation!.map((l) => l.target);
    expect(targets.some((t) => t.endsWith("osc.0.position"))).toBe(true);
    expect(targets.some((t) => t.endsWith("physical.resonator.pickup"))).toBe(true);
    const table = p.automation!.find((l) => l.target.endsWith("osc.0.slot"))!;
    expect(laneSteps(p, table.target)).toBe(8);
  });

  it("bends the flute's notes in the break", () => {
    const flute = p.tracks.find((t) => t.name === "Flute")!;
    const bends = Object.values(p.patterns).flatMap((pt) =>
      pt.lanes[flute.id].steps.flatMap((s) => (s.notes ?? []).filter((n) => n.bend)),
    );
    expect(bends.length).toBeGreaterThanOrEqual(3);
  });
});
