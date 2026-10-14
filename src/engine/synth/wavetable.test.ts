import { beforeAll, describe, expect, it } from "vitest";
import { makePatch, type PatchSpec } from "../../model/synth";
import { FACTORY_TABLES, mipTable } from "../../model/wavetables";
import { SynthCore } from "./core";
import { TABLES, addTable, levelFor, warpPhase } from "./wavetable";
import { WARPS } from "../../model/synth";

const SR = 48000;

function render(spec: PatchSpec, notes: [number, number, number | null][], seconds: number) {
  const core = new SynthCore(SR, makePatch({ filters: [{ on: false }], ...spec }));
  notes.forEach(([note, start, end], i) => {
    core.noteOn(i, note, 0.8, Math.round(start * SR));
    if (end !== null) core.noteOff(i, Math.round(end * SR));
  });
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let f = 0; f < n; f += 128)
    core.process(left.subarray(f, f + 128), right.subarray(f, f + 128), f);
  return { left, core };
}

const slice = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.round(from * SR), Math.round(to * SR));
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

/** Magnitude at one frequency (Goertzel), normalized. */
function mag(x: Float32Array, hz: number) {
  const k = (2 * Math.PI * hz) / SR;
  let s1 = 0;
  let s2 = 0;
  for (const v of x) {
    const s = v + 2 * Math.cos(k) * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - 2 * Math.cos(k) * s1 * s2) / x.length;
}

const wt = (o: Record<string, unknown>) => ({
  type: "wavetable" as const,
  table: "factory:basic",
  unison: 1,
  drift: 0,
  ...o,
});

beforeAll(() => {
  for (const id of ["factory:basic", "factory:harmonics", "factory:vowels"])
    addTable(mipTable(id, FACTORY_TABLES.find((t) => t.id === id)!.make()));
});

describe("wavetable oscillators (D241, D244)", () => {
  it("play their frames: position 0 of Basic shapes is a sine, 1 a square", () => {
    const sine = render({ osc: [wt({ position: 0 })] }, [[57, 0, null]], 0.4).left;
    const square = render({ osc: [wt({ position: 1 })] }, [[57, 0, null]], 0.4).left;
    const s = slice(sine, 0.1, 0.4);
    const q = slice(square, 0.1, 0.4);
    expect(mag(s, 660) / mag(s, 220)).toBeLessThan(0.01);
    // a square: odd harmonics at 1/n
    expect(mag(q, 660) / mag(q, 220)).toBeCloseTo(1 / 3, 1);
    expect(mag(q, 440) / mag(q, 220)).toBeLessThan(0.02);
  });

  it("play the analog morph at the same place while the table hasn't arrived", () => {
    const missing = render(
      { osc: [wt({ table: "user:nowhere", position: 2 / 3 })] },
      [[57, 0, null]],
      0.3,
    );
    const analog = render({ osc: [{ shape: 2, drift: 0 }] }, [[57, 0, null]], 0.3);
    expect(rms(slice(missing.left, 0.1, 0.3))).toBeCloseTo(rms(slice(analog.left, 0.1, 0.3)), 2);
  });

  it("don't alias on high notes: nothing folds back below the note", () => {
    // a full saw (Harmonics' last frame) at C8: every harmonic above Nyquist is gone
    const { left } = render(
      { osc: [wt({ table: "factory:harmonics", position: 1 })] },
      [[108, 0, null]],
      0.3,
    );
    const x = slice(left, 0.05, 0.3);
    const f0 = 440 * Math.pow(2, (108 - 69) / 12);
    // folded harmonics would land between the note's partials
    const between = [0.5, 1.5, 2.5].map((k) => mag(x, f0 * k));
    expect(Math.max(...between) / mag(x, f0)).toBeLessThan(0.01);
  });

  it("crossfade mip levels by pitch, without jumps", () => {
    let last = levelFor(1 / 4096, 11);
    for (let i = 0; i < 800; i++) {
      const dt = (1 / 4096) * Math.pow(2, i / 80);
      const l = levelFor(dt, 11);
      // the blend of level a and a + 1 moves continuously
      const at = (x: { a: number; w: number }) => x.a + x.w;
      expect(Math.abs(at(l) - at(last))).toBeLessThan(0.05);
      last = l;
    }
  });

  it("ramp the position per sample: a fast sweep has no steps (D244)", () => {
    const core = new SynthCore(
      SR,
      makePatch({
        filters: [{ on: false }],
        osc: [wt({ table: "factory:vowels", position: 0 })],
        lfos: [{ rate: 20, shape: "rampUp", mode: "global" }],
        matrix: [{ source: "lfo1", dest: "osc1.position", amount: 1 }],
      }),
    );
    core.noteOn(1, 45, 0.8, 0);
    const n = SR / 2;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let f = 0; f < n; f += 128)
      core.process(l.subarray(f, f + 128), r.subarray(f, f + 128), f);
    // the biggest jump from one sample to the next stays small (no zipper clicks)
    let jump = 0;
    for (let i = SR / 10; i < n; i++) jump = Math.max(jump, Math.abs(l[i] - l[i - 1]));
    expect(jump).toBeLessThan(0.2);
  });

  it("switch tables by slot (D248)", () => {
    const one = render(
      { osc: [wt({ tables: ["factory:vowels"], slot: 0 })] },
      [[57, 0, null]],
      0.3,
    );
    const two = render(
      { osc: [wt({ tables: ["factory:vowels"], slot: 1 })] },
      [[57, 0, null]],
      0.3,
    );
    const a = slice(one.left, 0.1, 0.3);
    const b = slice(two.left, 0.1, 0.3);
    // slot 1: Basic shapes at 0 (a sine); slot 2: Vowels at 0 (an “A”, rich in harmonics)
    expect(mag(a, 660) / mag(a, 220)).toBeLessThan(0.01);
    expect(mag(b, 660) / mag(b, 220)).toBeGreaterThan(0.05);
  });

  it("warp the phase within 0..1, with amount 0 as it is (D245)", () => {
    for (const w of WARPS) {
      for (let i = 0; i < 100; i++) {
        const t = i / 100;
        const x = warpPhase(w, w === "bend" ? -1 + (i % 3) : 0.7, t, 0.3);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(1);
        if (w !== "fm" && w !== "quantize") expect(warpPhase(w, 0, t, 0)).toBeCloseTo(t, 6);
      }
    }
    expect(TABLES.size).toBeGreaterThan(0);
  });
});
