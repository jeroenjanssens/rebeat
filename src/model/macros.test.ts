import { describe, expect, it } from "vitest";
import { FACTORY_SYNTHS } from "../library/synths";
import { ALL_PARAMS } from "./patchParams";
import {
  applyMacros,
  autoMacros,
  macroAt,
  makePatch,
  setThroughMacros,
  withMacroValues,
  type SynthPatch,
} from "./synth";

/** Every number in a patch, by path. */
function numbers(p: SynthPatch): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (o: unknown, path: string) => {
    if (typeof o === "number") out.set(path, o);
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o))
        if (k !== "macros") walk(v, path ? `${path}.${k}` : k);
  };
  walk(p, "");
  return out;
}

describe("macros", () => {
  it("rest where they leave every factory synth (and the init patch) as it is", () => {
    for (const s of [...FACTORY_SYNTHS, { name: "init", patch: makePatch() }]) {
      const before = numbers(s.patch);
      const after = numbers(applyMacros(s.patch));
      for (const [path, v] of before)
        expect(after.get(path), `${s.name} ${path}`).toBeCloseTo(v, 6);
    }
  });

  it("each move something, and stay inside the knobs' ranges", () => {
    const p = makePatch({ osc: [{ unison: 5 }, { shape: 3 }], filters: [{ cutoff: 1200 }] });
    const { macros, movement } = autoMacros(p);
    expect(macros.map((m) => m.name)).toEqual([
      "Brightness",
      "Bite",
      "Character",
      "Thickness",
      "Attack",
      "Release",
      "Movement",
      "Drive",
    ]);
    for (const m of macros) {
      if (m.name !== "Movement") expect(m.targets.length, m.name).toBeGreaterThan(0);
      for (const t of m.targets) {
        const d = ALL_PARAMS.find((x) => x.path === t.path)!;
        expect(d, t.path).toBeTruthy();
        for (const v of [t.min, t.max]) {
          expect(v).toBeGreaterThanOrEqual(d.min - 1e-9);
          expect(v).toBeLessThanOrEqual(d.max + 1e-9);
        }
        expect(t.max).toBeGreaterThan(t.min);
      }
    }
    // Brightness opens the filter over 6 octaves, resting in the middle
    expect(macros[0].value).toBeCloseTo(0.5);
    expect(macros[0].targets[0].max / macros[0].targets[0].min).toBeCloseTo(64);
    // Movement rests at 0 and brings in LFO 2 through the matrix
    expect(macros[6].value).toBe(0);
    expect(movement).toMatchObject({ source: "lfo2", via: "macro7" });
    expect(p.matrix.some((s) => s.via === "macro7")).toBe(true);
  });

  it("move frequencies and times in octaves, the rest evenly", () => {
    expect(macroAt({ path: "filters.0.cutoff", min: 100, max: 1600 }, 0.5)).toBeCloseTo(400);
    expect(macroAt({ path: "envs.0.attack", min: 0.001, max: 1 }, 1 / 3)).toBeCloseTo(0.01);
    expect(macroAt({ path: "filters.0.reso", min: 0.2, max: 0.6 }, 0.5)).toBeCloseTo(0.4);
  });

  it("take a track's values", () => {
    const p = makePatch({ filters: [{ cutoff: 1000 }] });
    const bright = applyMacros(withMacroValues(p, [1])).filters[0].cutoff;
    const dark = applyMacros(withMacroValues(p, [0])).filters[0].cutoff;
    expect(bright).toBeGreaterThan(4000);
    expect(dark).toBeLessThan(250);
    // nothing changes: the same patch
    expect(withMacroValues(p, [undefined, undefined])).toBe(p);
  });

  it("follow a knob edit, so the edit isn't overruled", () => {
    const p = makePatch({ filters: [{ cutoff: 1000 }] });
    for (const [v, at] of [
      [3000, 0.5],
      [20, 0.5],
      [18000, 0.8],
    ] as const) {
      const q = structuredClone(p);
      setThroughMacros(q, "filters.0.cutoff", v, 20, 20000, [at]);
      expect(applyMacros(withMacroValues(q, [at])).filters[0].cutoff).toBeCloseTo(v, 3);
      const t = q.macros[0].targets[0];
      expect(t.min).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(t.max).toBeLessThanOrEqual(20000 + 1e-6);
    }
    // a linear one, pushed against its top
    const q = structuredClone(p);
    setThroughMacros(q, "filters.0.reso", 0.95, 0, 1, []);
    expect(applyMacros(q).filters[0].reso).toBeCloseTo(0.95);
    expect(q.macros[1].targets[0].max).toBeLessThanOrEqual(1);
  });
});
