import { describe, expect, it } from "vitest";
import { paramOf } from "../model/patchParams";
import { FACTORY_SYNTHS, factorySynth } from "./synths";

const slot = (id: string, dest: string) =>
  factorySynth(id)!.patch.matrix.find((m) => m.dest === dest && m.amount !== 0);

describe("factory synths (version 2)", () => {
  it("use what version 2 can do", () => {
    // real sync, swept by the mod envelope
    const numan = factorySynth("numan-lead")!.patch;
    expect(numan.osc[1].sync).toBe(true);
    expect(slot("numan-lead", "osc2.pitch")?.source).toBe("env3");
    // pulse width modulation
    expect(factorySynth("juno-strings")!.patch.osc[1].shape).toBe(3);
    expect(slot("juno-strings", "osc2.pw")?.source).toBe("lfo2");
    // pitch envelopes
    expect(slot("808-boom", "pitch")?.source).toBe("env3");
    expect(slot("laser", "pitch")?.source).toBe("env2");
    // analog drift
    expect(factorySynth("moog-bass")!.patch.osc[0].drift).toBeGreaterThan(0.2);
  });

  it("have 8 named macros that move real knobs within their ranges", () => {
    for (const s of FACTORY_SYNTHS) {
      const p = s.patch;
      expect(p.macros, s.id).toHaveLength(8);
      p.macros.forEach((m, i) => {
        expect(m.name, `${s.id} macro ${i + 1}`).toBeTruthy();
        // each does something: targets, or a matrix slot it scales
        const scales = p.matrix.some(
          (x) => x.via === `macro${i + 1}` || x.source === `macro${i + 1}`,
        );
        if (!m.targets.length && !scales)
          expect(m.name, `${s.id}: ${m.name} does nothing`).toBe("");
        for (const t of m.targets) {
          const d = paramOf(t.path)!;
          expect(d, `${s.id} ${t.path}`).toBeTruthy();
          for (const v of [t.min, t.max]) {
            expect(v).toBeGreaterThanOrEqual(d.min - 1e-9);
            expect(v).toBeLessThanOrEqual(d.max + 1e-9);
          }
        }
      });
    }
  });
});
