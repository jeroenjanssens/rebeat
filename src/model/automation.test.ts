import { describe, expect, it } from "vitest";
import { demoProject } from "../templates/nightDrive";
import { automatableKnobs, isAutomatable, knobValue, thinPoints } from "./automation";

describe("automatable knobs (D189)", () => {
  it("every knob resolves to a value and a definition", () => {
    const p = demoProject();
    const knobs = automatableKnobs(p);
    expect(knobs.length).toBeGreaterThan(p.tracks.length * 5);
    for (const k of knobs) {
      expect(knobValue(p, k.target)).toBeGreaterThanOrEqual(0);
      expect(k.def.format(0.5)).toBeTruthy();
    }
  });

  it("a synth's SOUND knobs are its macros; a sample's filter; master and bus levels", () => {
    const p = demoProject();
    const bass = p.tracks.find((t) => t.name === "Bass")!;
    const kick = p.tracks.find((t) => t.name === "Kick")!;
    expect(isAutomatable(p, `track:${bass.id}:sound.macro1`)).toBe(true);
    expect(isAutomatable(p, `track:${bass.id}:sound.cutoff`)).toBe(false);
    expect(isAutomatable(p, `track:${kick.id}:sound.cutoff`)).toBe(true);
    // per hit, not continuous: not automatable
    expect(isAutomatable(p, `track:${kick.id}:sound.tune`)).toBe(false);
    expect(isAutomatable(p, "master:volume")).toBe(true);
    expect(isAutomatable(p, `bus:${p.buses[0].id}`)).toBe(true);
  });

  it("thinning keeps a ramp's shape with few points", () => {
    const ramp = Array.from({ length: 50 }, (_, i) => ({ q: i, value: i / 49 }));
    expect(thinPoints(ramp)).toHaveLength(2);
    const vee = [...ramp, ...ramp.map((p) => ({ q: 50 + p.q, value: 1 - p.value }))];
    expect(thinPoints(vee).length).toBeLessThanOrEqual(4);
  });
});
