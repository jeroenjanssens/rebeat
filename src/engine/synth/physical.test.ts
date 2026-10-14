import { describe, expect, it } from "vitest";
import {
  BODIES,
  EXCITERS,
  RESONATORS,
  makePatch,
  sanitizePatch,
  type PatchSpec,
  type SynthPatch,
} from "../../model/synth";
import { SynthCore } from "./core";

const SR = 48000;

type Spec = NonNullable<PatchSpec["physical"]>;

/** A physical patch: no filter, an amp envelope that leaves the decay to the model. */
const phys = (physical: Spec, spec: PatchSpec = {}) =>
  makePatch({
    source: "physical",
    filters: [{ on: false }],
    envs: [{ attack: 0.001, sustain: 1, release: 3, velocity: 0 }],
    physical,
    ...spec,
  });

function run(patch: SynthPatch, notes: [number, number, number | null][], seconds: number) {
  const core = new SynthCore(SR, patch);
  notes.forEach(([note, start, end], i) => {
    core.noteOn(i, note, 0.8, Math.round(start * SR));
    if (end !== null) core.noteOff(i, Math.round(end * SR));
  });
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let f = 0; f < n; f += 128)
    core.process(left.subarray(f, f + 128), right.subarray(f, f + 128), f);
  return { left, right, core };
}

const slice = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.round(from * SR), Math.round(to * SR));
const rms = (x: Float32Array) =>
  Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));

/** Magnitude at one frequency, Hann-windowed (a rotating phasor: no trig per sample). */
function mag(x: Float32Array, f: number) {
  const k = (2 * Math.PI * f) / SR;
  const cr = Math.cos(k);
  const ci = Math.sin(k);
  let pr = 1;
  let pi = 0;
  let re = 0;
  let im = 0;
  const n = x.length;
  const wk = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) {
    const v = x[i] * (0.5 - 0.5 * Math.cos(wk * i));
    re += v * pr;
    im -= v * pi;
    const t = pr * cr - pi * ci;
    pi = pr * ci + pi * cr;
    pr = t;
  }
  return Math.hypot(re, im) / n;
}

/** The pitch of the partial near `f`, in cents from it (a coarse, then a fine search). */
function centsOff(x: Float32Array, f: number) {
  const search = (from: number, to: number, step: number) => {
    let best = from;
    let bestM = -1;
    for (let c = from; c <= to; c += step) {
      const m = mag(x, f * Math.pow(2, c / 1200));
      if (m > bestM) {
        bestM = m;
        best = c;
      }
    }
    return best;
  };
  const coarse = search(-60, 60, 4);
  return search(coarse - 4, coarse + 4, 0.25);
}

const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

describe("physical models: tuning (D253)", () => {
  it("plucked strings are in tune from C1 to C7, with any damping and stiffness", () => {
    for (const damping of [0.2, 0.7])
      for (const note of [24, 36, 48, 60, 72, 84, 96]) {
        const p = phys({
          exciter: { type: "pluck", hardness: 0.7 },
          resonator: { model: "string", decay: 4, damping },
        });
        const { left } = run(p, [[note, 0, null]], 0.8);
        const off = centsOff(slice(left, 0.1, 0.8), hz(note));
        expect(Math.abs(off), `note ${note}, damping ${damping}`).toBeLessThanOrEqual(3);
      }
    for (const note of [36, 60, 84]) {
      const p = phys({
        exciter: { type: "strike" },
        resonator: { model: "string", decay: 4, inharmonicity: 0.6 },
      });
      const off = centsOff(slice(run(p, [[note, 0, null]], 0.8).left, 0.1, 0.8), hz(note));
      expect(Math.abs(off), `stiff, note ${note}`).toBeLessThanOrEqual(3);
    }
  });

  it("tubes and modal resonators play the note", () => {
    for (const end of ["closed", "open"] as const)
      for (const note of [48, 60, 72]) {
        const p = phys({
          exciter: { type: "strike" },
          resonator: { model: "tube", decay: 3, end },
        });
        const off = centsOff(slice(run(p, [[note, 0, null]], 0.8).left, 0.05, 0.8), hz(note));
        expect(Math.abs(off), `${end} tube, note ${note}`).toBeLessThanOrEqual(3);
      }
    for (const note of [48, 72]) {
      const p = phys({ exciter: { type: "strike" }, resonator: { model: "bar", decay: 3 } });
      const off = centsOff(slice(run(p, [[note, 0, null]], 0.6).left, 0.02, 0.6), hz(note));
      expect(Math.abs(off)).toBeLessThanOrEqual(3);
    }
  });

  it("blown tubes and bowed strings sound while they're held", () => {
    for (const [type, model, end] of [
      ["blow", "tube", "closed"],
      ["blow", "tube", "open"],
      ["bow", "string", "closed"],
      ["bow", "bar", "closed"],
      ["noise", "plate", "closed"],
    ] as const) {
      const p = phys({
        exciter: { type, pressure: 0.6, hardness: 0.8 },
        resonator: { model, end, decay: 2 },
      });
      const { left } = run(p, [[60, 0, null]], 1.2);
      expect(rms(slice(left, 0.8, 1.2)), `${type} ${model} ${end}`).toBeGreaterThan(0.001);
    }
  });

  it("bends an octave in 100 ms without a click", () => {
    const p = phys({ exciter: { type: "bow", pressure: 0.6 }, resonator: { model: "string" } });
    const core = new SynthCore(SR, p);
    core.noteOn(1, 48, 0.8, 0, { shape: "rise", amount: 12, time: 0.1, delay: 0.3 } as never);
    const n = SR;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let f = 0; f < n; f += 128)
      core.process(l.subarray(f, f + 128), r.subarray(f, f + 128), f);
    const level = rms(slice(l, 0.2, 0.9));
    let jump = 0;
    for (let i = Math.round(0.25 * SR); i < Math.round(0.5 * SR); i++)
      jump = Math.max(jump, Math.abs(l[i] - l[i - 1]));
    expect(level).toBeGreaterThan(0.001);
    expect(jump).toBeLessThan(level * 4);
  });
});

describe("physical models: voices and safety (D254, D255)", () => {
  it("free a voice once a plucked note has died away, even while held", () => {
    const p = phys({ exciter: { type: "pluck" }, resonator: { model: "string", decay: 0.2 } });
    const { core } = run(p, [[60, 0, null]], 2);
    expect(core.active).toBe(0);
  });

  it("damp the resonator at the note-off by Release", () => {
    const tail = (release: number) => {
      const p = phys({
        exciter: { type: "strike" },
        resonator: { model: "bar", decay: 4, release },
      });
      const { left } = run(p, [[60, 0, 0.2]], 1);
      return rms(slice(left, 0.6, 1));
    };
    expect(tail(1)).toBeLessThan(tail(0) * 0.1);
  });

  it("are silent at once after a panic", () => {
    const p = phys({ exciter: { type: "bow" }, resonator: { model: "string" } });
    const { core } = run(p, [[60, 0, null]], 0.5);
    core.panic();
    core.noteOn(9, 60, 0.8, Math.round(0.6 * SR));
    const l = new Float32Array(1024);
    const r = new Float32Array(1024);
    core.process(l, r, Math.round(0.5 * SR));
    expect(rms(l)).toBe(0);
  });

  it("stay bounded and finite with any settings (a fuzz test)", () => {
    let x = 12345;
    const rand = () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
    for (let i = 0; i < 300; i++) {
      const p = sanitizePatch(
        phys(
          {
            exciter: {
              type: pick(EXCITERS),
              level: rand(),
              hardness: rand(),
              position: rand(),
              noise: rand(),
              pressure: rand(),
              velocity: rand(),
            },
            resonator: {
              model: pick(RESONATORS),
              decay: 0.05 + rand() * 30,
              damping: rand(),
              inharmonicity: rand(),
              structure: rand(),
              pickup: rand(),
              width: rand(),
              release: rand(),
              modes: pick([8, 16, 32] as const),
              end: pick(["closed", "open"] as const),
            },
            body: { type: pick(BODIES), size: 0.5 + rand() * 1.5, mix: rand() },
          },
          { osc: [{ shape: rand() * 3 }] },
        ),
      );
      const note = 24 + Math.floor(rand() * 84);
      const { left, right } = run(
        p,
        [
          [note, 0, 0.08],
          [note + 7, 0.02, null],
        ],
        0.12,
      );
      let worst = 0;
      for (const ch of [left, right])
        for (const v of ch) worst = Number.isFinite(v) ? Math.max(worst, Math.abs(v)) : Infinity;
      expect(worst, JSON.stringify(p.physical)).toBeLessThan(4);
    }
  }, 30000);

  it.skipIf(!!process.env.CI)("render 8 voices at least 6× faster than real time (D255)", () => {
    const budget = (p: SynthPatch) => {
      const start = performance.now();
      run(
        p,
        [48, 52, 55, 59, 60, 64, 67, 71].map((n) => [n, 0, null] as [number, number, null]),
        2,
      );
      return 2 / ((performance.now() - start) / 1000);
    };
    const string = phys({
      exciter: { type: "bow" },
      resonator: { model: "string" },
      body: { type: "violin" },
    });
    const modal = phys({
      exciter: { type: "strike" },
      resonator: { model: "bell", modes: 32, decay: 8 },
      body: { type: "piano" },
    });
    const table = makePatch({
      osc: [
        { type: "wavetable", unison: 4 },
        { type: "wavetable", unison: 4 },
        { type: "wavetable", unison: 4 },
      ],
    });
    for (const p of [string, modal, table]) expect(budget(p)).toBeGreaterThan(6);
  });
});
