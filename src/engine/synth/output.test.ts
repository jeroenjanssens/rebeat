/**
 * P3.0: Output snapshot for the synth DSP.
 *
 * Renders each patch for 1.5 s through SynthCore with fixed seeds (seedCore for core.ts's
 * xorshift, seedPhysical for the physical models' generator, and a seeded Math.random for the
 * oscillator-phase and drift calls). Records a compact fingerprint — sum of squares, sum of
 * absolute values, and four spread sample values — taken BEFORE any Phase 3 optimisation.
 *
 * Every commit in Phase 3 must keep these identical (relative tolerance 1e-9 to absorb last-bit
 * differences if P3.2's hoisted invTanhK changes the float order).
 *
 * P3.6 (drift countdown) legitimately changes the drift patch G's sequence because it replaces
 * Math.random() with a per-voice countdown; in that commit only G's fingerprint is updated and
 * the commit explains why. NOTE (verified 2026-10-15): the factory synths DO include drifting
 * oscillators (warm-pad, sub-bass, fm-growl-bass, stab-saw, and others) despite the "no drift"
 * house style — the voiced() wrapper defaults to drift:0 but specs can override it. P3.6 is
 * therefore skipped (recorded as deviation) because it would move the golden level recordings.
 *
 * Wavetable patch C uses addTable/mipTable/FACTORY_TABLES, the same way wavetable.test.ts does;
 * this works in Node because everything in engine/synth/ and model/ is pure.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { makePatch } from "../../model/synth";
import { FACTORY_TABLES, mipTable } from "../../model/wavetables";
import { FACTORY_SYNTHS } from "../../library/synths";
import { SynthCore, seedCore } from "./core";
import { addTable } from "./wavetable";
import { seedPhysical } from "./physical";

const SR = 48000;
const DURATION = 1.5;
const BLOCK = 128;

// ---- deterministic seeding ----

/** A simple xorshift seeded PRNG replacing Math.random for the render. */
function makeRandom(s: number) {
  let state = s >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

// ---- rendering ----

/** Render a SynthCore for DURATION seconds with fixed seeds. Returns mono mix. */
function renderSeeded(core: SynthCore, coreSeed: number, physSeed: number): Float32Array {
  const n = Math.round(DURATION * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const origRandom = Math.random;
  seedCore(coreSeed);
  seedPhysical(physSeed);
  Math.random = makeRandom(coreSeed ^ physSeed);
  try {
    for (let f = 0; f < n; f += BLOCK) {
      const end = Math.min(f + BLOCK, n);
      core.process(left.subarray(f, end), right.subarray(f, end), f, end - f);
    }
  } finally {
    Math.random = origRandom;
  }
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (left[i] + right[i]) * 0.5;
  return mono;
}

// ---- fingerprint ----

interface Fingerprint {
  sumsq: number;
  sumabs: number;
  s0: number;
  s1: number;
  s2: number;
  s3: number;
}

function fingerprint(x: Float32Array): Fingerprint {
  let sumsq = 0;
  let sumabs = 0;
  for (const v of x) {
    sumsq += v * v;
    sumabs += Math.abs(v);
  }
  const n = x.length;
  return {
    sumsq: parseFloat(sumsq.toPrecision(9)),
    sumabs: parseFloat(sumabs.toPrecision(9)),
    s0: parseFloat(x[Math.floor(n * 0.1)].toPrecision(9)),
    s1: parseFloat(x[Math.floor(n * 0.3)].toPrecision(9)),
    s2: parseFloat(x[Math.floor(n * 0.6)].toPrecision(9)),
    s3: parseFloat(x[Math.floor(n * 0.9)].toPrecision(9)),
  };
}

function expectFingerprint(actual: Fingerprint, expected: Fingerprint, label: string) {
  // Relative 1e-9 to tolerate last-bit differences from P3.2's hoisted invTanhK.
  const rel = (a: number, b: number) => {
    if (a === b) return true;
    const mag = Math.max(Math.abs(a), Math.abs(b), 1e-30);
    return Math.abs(a - b) / mag < 1e-9;
  };
  for (const k of Object.keys(expected) as (keyof Fingerprint)[]) {
    expect(
      rel(actual[k], expected[k]),
      `${label}[${k}]: got ${actual[k]}, expected ${expected[k]}`,
    ).toBe(true);
  }
}

// ---- patches ----

// A: analog with unison=8, FM route 3>1, 8 voices.
const patchA = makePatch({
  osc: [
    { shape: 2, unison: 8, detune: 30, drift: 0, width: 0.9 },
    undefined,
    { shape: 0, level: 0, retrigger: true },
  ],
  fm: { route: "3>1", amount: 2.5 },
  filters: [{ on: true, model: "ladder", cutoff: 3000, reso: 0.3, keytrack: 0.5 }],
  envs: [{ attack: 0.01, decay: 1.5, sustain: 0.6, release: 0.5 }],
  output: { volume: -18 },
});

// B: analog with output drive > 0 (the factory acid bass).
const patchB = (() => {
  const f = FACTORY_SYNTHS.find((s) => s.id === "acid");
  if (!f) throw new Error("acid not found");
  return f.patch;
})();

// C: wavetable oscillator (factory:vowels), 3 unison voices. Table loaded in beforeAll.
const patchC = makePatch({
  osc: [
    { type: "wavetable", table: "factory:vowels", position: 0.2, unison: 3, detune: 16, drift: 0 },
  ],
  filters: [{ on: true, cutoff: 4000, reso: 0.1 }],
  envs: [{ attack: 0.05, decay: 1.2, sustain: 0.5, release: 0.5 }],
  output: { volume: -18 },
});

// D: physical pluck (nylon guitar).
const patchD = (() => {
  const f = FACTORY_SYNTHS.find((s) => s.id === "pm-nylon-guitar");
  if (!f) throw new Error("pm-nylon-guitar not found");
  return f.patch;
})();

// E: physical bow with continuous noise exciter (bowed cello).
const patchE = (() => {
  const f = FACTORY_SYNTHS.find((s) => s.id === "pm-bowed-cello");
  if (!f) throw new Error("pm-bowed-cello not found");
  return f.patch;
})();

// F: macros + two automation paths.
const patchF = makePatch({
  osc: [{ shape: 0, drift: 0 }],
  filters: [{ on: true, cutoff: 800, reso: 0.2 }],
  envs: [{ sustain: 1 }],
  macros: [
    { name: "Cutoff", value: 0.5, targets: [{ path: "filters.0.cutoff", min: 200, max: 4000 }] },
  ],
  output: { volume: -18 },
});

// G: analog with drift on (custom patch; fingerprint updated at P3.6 if ever accepted).
const patchG = makePatch({
  osc: [{ shape: 2, unison: 3, detune: 20, drift: 0.3 }],
  filters: [{ on: true, cutoff: 3000, reso: 0.2 }],
  envs: [{ attack: 0.02, sustain: 1, release: 0.5 }],
  output: { volume: -18 },
});

// ---- helpers ----

beforeAll(() => {
  // Load the vowels wavetable for patch C.
  const id = "factory:vowels";
  const ft = FACTORY_TABLES.find((t) => t.id === id);
  if (ft) addTable(mipTable(id, ft.make()));
});

function renderPatch(
  patch: ReturnType<typeof makePatch>,
  notes: [number, number, number | null][],
  coreSeed: number,
): Float32Array {
  const core = new SynthCore(SR, patch);
  for (const [i, [note, startS, endS]] of notes.entries()) {
    core.noteOn(i, note, 0.8, Math.round(startS * SR));
    if (endS !== null) core.noteOff(i, Math.round(endS * SR));
  }
  return renderSeeded(core, coreSeed, coreSeed + 1);
}

// ---- snapshot tests ----

describe("synth output snapshot (P3.0)", () => {
  it("A: analog with unison=8 and FM", () => {
    const fp = fingerprint(
      renderPatch(
        patchA,
        [
          [60, 0, null],
          [64, 0, null],
          [67, 0, null],
          [71, 0, null],
          [72, 0, null],
          [76, 0, null],
          [79, 0, null],
          [83, 0, null],
        ],
        0x12345678,
      ),
    );
    expectFingerprint(
      fp,
      {
        sumsq: 155.215253,
        sumabs: 2650.82684,
        s0: -0.0194561612,
        s1: -0.020938538,
        s2: 0.0153696351,
        s3: 0.0490673073,
      },
      "A",
    );
  });

  it("B: acid bass (drive > 0)", () => {
    const fp = fingerprint(
      renderPatch(
        patchB,
        [
          [45, 0, 0.4],
          [48, 0.5, 0.9],
          [43, 1.0, null],
        ],
        0x87654321,
      ),
    );
    expectFingerprint(
      fp,
      {
        sumsq: 489.199774,
        sumabs: 4946.13609,
        s0: -0.0950837061,
        s1: -0.00609549182,
        s2: 0.137556121,
        s3: -0.0345124155,
      },
      "B",
    );
  });

  it("C: wavetable (factory:vowels)", () => {
    const fp = fingerprint(
      renderPatch(
        patchC,
        [
          [60, 0, null],
          [64, 0.1, null],
          [67, 0.2, null],
        ],
        0xabcdef01,
      ),
    );
    expectFingerprint(
      fp,
      {
        sumsq: 15.1994663,
        sumabs: 806.016535,
        s0: 0.0127041321,
        s1: 0.0219295863,
        s2: 0.00354904192,
        s3: 0.0116571439,
      },
      "C",
    );
  });

  it("D: physical pluck (nylon guitar)", () => {
    const fp = fingerprint(
      renderPatch(
        patchD,
        [
          [60, 0, 0.3],
          [64, 0.3, 0.6],
          [67, 0.6, 0.9],
          [72, 0.9, null],
        ],
        0x11223344,
      ),
    );
    expectFingerprint(
      fp,
      {
        sumsq: 401.534776,
        sumabs: 4209.34211,
        s0: -0.0968088284,
        s1: 0.0355479047,
        s2: 0.0660482496,
        s3: -0.00643249415,
      },
      "D",
    );
  });

  it("E: physical bow (bowed cello, noise exciter)", () => {
    const fp = fingerprint(
      renderPatch(
        patchE,
        [
          [48, 0, 0.7],
          [52, 0.8, null],
        ],
        0x55667788,
      ),
    );
    expectFingerprint(
      fp,
      {
        sumsq: 98.9137574,
        sumabs: 1993.26755,
        s0: -0.00652700989,
        s1: -0.0158995576,
        s2: 0.00654084375,
        s3: 0.0107221305,
      },
      "E",
    );
  });

  it("F: macros + two automation paths", () => {
    const core = new SynthCore(SR, patchF);
    core.noteOn(0, 60, 0.8, 0);
    core.noteOn(1, 64, 0.8, Math.round(0.1 * SR));
    core.automate("macros.0.value", [
      { at: Math.round(0.3 * SR), v: 0.2, ramp: false },
      { at: Math.round(0.7 * SR), v: 0.9, ramp: true },
      { at: Math.round(1.1 * SR), v: 0.5, ramp: true },
    ]);
    core.automate("output.volume", [
      { at: Math.round(0.5 * SR), v: -30, ramp: false },
      { at: Math.round(0.9 * SR), v: -18, ramp: true },
    ]);
    core.automateEnd(Math.round(1.3 * SR));
    const fp = fingerprint(renderSeeded(core, 0x99aabbcc, 0x99aabbcd));
    expectFingerprint(
      fp,
      {
        sumsq: 319.593938,
        sumabs: 3781.03431,
        s0: 0.140378162,
        s1: -0.0212117843,
        s2: 0.0458399057,
        s3: -0.0210374091,
      },
      "F",
    );
  });

  it("G: drift patch (fingerprint may be updated at P3.6 if accepted)", () => {
    const fp = fingerprint(
      renderPatch(
        patchG,
        [
          [60, 0, null],
          [64, 0.2, null],
          [67, 0.4, null],
        ],
        0xdeadbeef,
      ),
    );
    expectFingerprint(
      fp,
      {
        sumsq: 314.729138,
        sumabs: 3806.1561,
        s0: 0.0378555655,
        s1: -0.0393281691,
        s2: -0.021406848,
        s3: 0.0844833106,
      },
      "G",
    );
  });
});
