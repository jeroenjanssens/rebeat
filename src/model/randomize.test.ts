import { describe, expect, it } from "vitest";
import { FACTORY_SYNTHS } from "../library/synths";
import { ALL_PARAMS, getPath } from "./patchParams";
import { RANDOM_GROUPS, randomizePatch } from "./randomize";
import { applyMacros } from "./synth";

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const patch = FACTORY_SYNTHS.find((s) => s.id === "supersaw")!.patch;

describe("randomize", () => {
  it("moves knobs within their ranges, by at most the amount", () => {
    const r = applyMacros(randomizePatch(patch, 0.2, [], [], seeded(3)));
    const before = applyMacros(patch);
    let moved = 0;
    for (const d of ALL_PARAMS) {
      const v = getPath(r, d.path);
      expect(v, d.path).toBeGreaterThanOrEqual(d.min - 1e-9);
      expect(v, d.path).toBeLessThanOrEqual(d.max + 1e-9);
      if (Math.abs(v - getPath(before, d.path)) > 1e-9) moved++;
    }
    expect(moved).toBeGreaterThan(20);
  });

  it("leaves locked sections, the level and the tuning alone", () => {
    const locked = RANDOM_GROUPS.map((g) => g.id).filter((g) => g !== "filters");
    const r = applyMacros(randomizePatch(patch, 1, locked, [], seeded(5)));
    const before = applyMacros(patch);
    for (const d of ALL_PARAMS) {
      if (d.path.startsWith("filters.")) continue;
      expect(getPath(r, d.path), d.path).toBeCloseTo(getPath(before, d.path), 9);
    }
    expect(r.filters[0].cutoff).not.toBeCloseTo(before.filters[0].cutoff, 3);
    const all = randomizePatch(patch, 1, [], [], seeded(7));
    expect(all.output.volume).toBe(patch.output.volume);
    expect(all.voice.tune).toBe(patch.voice.tune);
  });

  it("doesn't change the patch it's given", () => {
    const copy = JSON.stringify(patch);
    randomizePatch(patch, 1, [], [], seeded(9));
    expect(JSON.stringify(patch)).toBe(copy);
  });
});
