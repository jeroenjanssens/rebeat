import { describe, expect, it } from "vitest";
import { makePatch, type PatchSpec } from "../../model/synth";
import { SynthCore, applyMacros } from "./core";

const SR = 48000;

/** Render a patch: `notes` are [note, start s, end s (or null = held)]. */
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
  const mono = left.map((l, i) => (l + right[i]) / 2);
  return { left, right, mono, core };
}

const slice = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.round(from * SR), Math.round(to * SR));

/** Frequency from rising zero crossings. */
function freq(x: Float32Array) {
  const ups: number[] = [];
  for (let i = 1; i < x.length; i++)
    if (x[i - 1] <= 0 && x[i] > 0) ups.push(i - 1 + -x[i - 1] / (x[i] - x[i - 1]));
  return ((ups.length - 1) * SR) / (ups.at(-1)! - ups[0]);
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Magnitude at one frequency (Goertzel). */
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

/** The lag (in samples) with the strongest autocorrelation within a range. */
function period(x: Float32Array, min: number, max: number) {
  let best = min;
  let bestV = -Infinity;
  for (let lag = min; lag <= max; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    if (s > bestV) {
      bestV = s;
      best = lag;
    }
  }
  return best;
}

const sine = { shape: 0, drift: 0 };

describe("synth core", () => {
  it("panic: silent at once, without the release, and notes still to come never play", () => {
    // a long release, and a note queued for later
    const core = new SynthCore(
      SR,
      makePatch({ osc: [sine], filters: [{ on: false }], envs: [{ release: 4 }] }),
    );
    core.noteOn(0, 60, 0.8, 0);
    core.noteOn(1, 64, 0.8, Math.round(0.5 * SR));
    const n = Math.round(0.8 * SR);
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    const block = (f: number) =>
      core.process(left.subarray(f, f + 128), right.subarray(f, f + 128), f);
    let f = 0;
    for (; f < 0.2 * SR; f += 128) block(f);
    expect(core.active).toBe(1);
    core.panic();
    expect(core.busy).toBe(false);
    for (; f < n; f += 128) block(f);
    expect(peak(left.subarray(Math.round(0.2 * SR) + 128))).toBe(0);
    // and the next note starts from silence, with its attack
    core.noteOn(2, 60, 0.8, f);
    const out = new Float32Array(128);
    core.process(out, new Float32Array(128), f);
    expect(Math.abs(out[0])).toBeLessThan(0.01);
  });

  it("plays in tune: A4 is 440 Hz", () => {
    const { mono } = render({ osc: [sine] }, [[69, 0, null]], 0.5);
    expect(freq(slice(mono, 0.1, 0.5))).toBeCloseTo(440, 0);
  });

  it("band-limits the saw: little aliasing on high notes", () => {
    const { mono } = render({ osc: [{ shape: 2, drift: 0 }] }, [[108, 0, null]], 0.5);
    const x = slice(mono, 0.1, 0.5);
    const f0 = 440 * Math.pow(2, (108 - 69) / 12);
    // the 6th harmonic folds back from above Nyquist: a naive saw has it at 1/6 of the
    // fundamental; polyBLEP brings that down by more than half even at this extreme pitch
    const alias = SR - 6 * f0;
    expect(mag(x, alias) / mag(x, f0)).toBeLessThan(1 / 6 / 2);
    // an octave lower too (2-point polyBLEP: good, not perfect; oversampling would double the cost)
    const { mono: lower } = render({ osc: [{ shape: 2, drift: 0 }] }, [[96, 0, null]], 0.5);
    const y = slice(lower, 0.1, 0.5);
    const g0 = f0 / 2;
    expect(mag(y, SR - 12 * g0) / mag(y, g0)).toBeLessThan(1 / 12 / 2);
  });

  it("sets the pulse width", () => {
    const { mono } = render({ osc: [{ shape: 3, pw: 0.25, drift: 0 }] }, [[45, 0, null]], 0.5);
    const x = slice(mono, 0.1, 0.5);
    const high = x.filter((v) => v > 0).length / x.length;
    expect(high).toBeGreaterThan(0.22);
    expect(high).toBeLessThan(0.28);
  });

  it("times envelopes: attack, sustain and release", () => {
    const { mono } = render(
      {
        osc: [sine],
        envs: [{ attack: 0.1, decay: 0.1, sustain: 1, release: 0.2, curve: 0, velocity: 0 }],
      },
      [[69, 0, 0.5]],
      1,
    );
    const half = rms(slice(mono, 0.04, 0.06));
    const full = rms(slice(mono, 0.3, 0.4));
    expect(half / full).toBeGreaterThan(0.4);
    expect(half / full).toBeLessThan(0.6);
    // gone after the release
    expect(rms(slice(mono, 0.72, 0.8)) / full).toBeLessThan(0.02);
  });

  it("self-oscillates the ladder at its cutoff, without blowing up", () => {
    const { mono } = render(
      {
        osc: [{ on: false, level: 0 }],
        noise: { level: 0.02 },
        filters: [{ on: true, model: "ladder", cutoff: 1000, reso: 1 }],
        envs: [{ sustain: 1 }],
        output: { volume: 0 },
      },
      [[60, 0, null]],
      1,
    );
    const x = slice(mono, 0.5, 1);
    expect(freq(x)).toBeGreaterThan(900);
    expect(freq(x)).toBeLessThan(1100);
    expect(peak(x)).toBeGreaterThan(0.05);
    expect(peak(x)).toBeLessThan(2);
  });

  it("hard-syncs oscillator 2 to oscillator 1", () => {
    const osc1 = { shape: 2, level: 0, drift: 0 };
    const synced = render(
      { osc: [osc1, { shape: 2, semi: 7, drift: 0, sync: true }] },
      [[57, 0, null]],
      0.5,
    ).mono;
    const free = render(
      { osc: [osc1, { shape: 2, semi: 7, drift: 0 }] },
      [[57, 0, null]],
      0.5,
    ).mono;
    // synced, it repeats with oscillator 1's period (220 Hz)
    expect(period(slice(synced, 0.1, 0.3), 120, 260)).toBeCloseTo(SR / 220, -0.5);
    expect(period(slice(free, 0.1, 0.3), 120, 260)).not.toBeCloseTo(SR / 220, -0.5);
  });

  it("ring-modulates into sum and difference tones", () => {
    const { mono } = render(
      {
        osc: [
          { ...sine, level: 0 },
          { ...sine, level: 0, octave: 1 },
        ],
        ring: 1,
      },
      [[69, 0, null]],
      0.5,
    );
    const x = slice(mono, 0.1, 0.5);
    // 440 × 880 → 440 and 1320
    expect(mag(x, 1320)).toBeGreaterThan(mag(x, 880) * 5);
  });

  it("adds harmonics with FM", () => {
    const fm = render(
      {
        osc: [{ ...sine, retrigger: true }, undefined, { ...sine, level: 0, retrigger: true }],
        fm: { amount: 3, route: "3>1" },
      },
      [[69, 0, null]],
      0.5,
    ).mono;
    const plain = render({ osc: [sine] }, [[69, 0, null]], 0.5).mono;
    const ratio = (x: Float32Array) => mag(slice(x, 0.1, 0.5), 880) / mag(slice(x, 0.1, 0.5), 440);
    expect(ratio(plain)).toBeLessThan(0.01);
    expect(ratio(fm)).toBeGreaterThan(0.3);
  });

  it("steals the oldest voice beyond the voice count", () => {
    const { core } = render(
      { osc: [sine], voice: { voices: 2 } },
      [
        [60, 0, null],
        [64, 0.05, null],
        [67, 0.1, null],
      ],
      0.3,
    );
    expect(core.active).toBe(2);
  });

  it("glides between notes in mono", () => {
    const { mono } = render(
      { osc: [sine], voice: { mode: "mono", glide: 0.2, glideMode: "always" } },
      [
        [57, 0, null],
        [69, 0.3, null],
      ],
      1,
    );
    expect(freq(slice(mono, 0.15, 0.28))).toBeCloseTo(220, -0.5);
    const mid = freq(slice(mono, 0.33, 0.37));
    expect(mid).toBeGreaterThan(240);
    expect(mid).toBeLessThan(420);
    expect(freq(slice(mono, 0.8, 1))).toBeCloseTo(440, -0.5);
  });

  it("doesn't restart the envelope on legato notes", () => {
    const env = { attack: 0.2, decay: 0.1, sustain: 1, release: 0.1, velocity: 0, curve: 0 };
    const legato = render(
      { osc: [sine], envs: [env], voice: { mode: "legato" } },
      [
        [57, 0, null],
        [69, 0.4, null],
      ],
      0.6,
    ).mono;
    // a retrigger would dip and climb over 0.2 s again
    expect(rms(slice(legato, 0.42, 0.45)) / rms(slice(legato, 0.3, 0.38))).toBeGreaterThan(0.85);
  });

  it("modulates through the matrix: an LFO on pitch makes vibrato", () => {
    const { mono } = render(
      {
        osc: [sine],
        lfos: [{ rate: 2, shape: "square", mode: "global" }],
        matrix: [{ source: "lfo1", dest: "pitch", amount: 1 / 24 }],
      },
      [[69, 0, null]],
      1.2,
    );
    // ± a semitone, switching every 0.25 s
    const f = [0.05, 0.3, 0.55, 0.8].map((t) => freq(slice(mono, t, t + 0.15)));
    const hi = Math.max(...f);
    const lo = Math.min(...f);
    expect(hi / lo).toBeCloseTo(Math.pow(2, 2 / 12), 1);
  });

  it("spreads unison voices in stereo", () => {
    const { left, right } = render(
      { osc: [{ shape: 2, unison: 4, width: 1, drift: 0 }] },
      [[57, 0, null]],
      0.5,
    );
    const l = slice(left, 0.1, 0.5);
    const r = slice(right, 0.1, 0.5);
    let dot = 0;
    l.forEach((v, i) => (dot += v * r[i]));
    expect(dot / (rms(l) * rms(r) * l.length)).toBeLessThan(0.95);
  });

  it("moves macro targets", () => {
    const p = makePatch({
      macros: [
        {
          name: "Brightness",
          value: 0.25,
          targets: [{ path: "filters.0.cutoff", min: 100, max: 900 }],
        },
      ],
    });
    // frequencies move in octaves: a quarter of the way from 100 to 900 Hz
    expect(applyMacros(p).filters[0].cutoff).toBeCloseTo(100 * Math.pow(9, 0.25), 6);
  });

  it("slides into a note without a new attack, even after the note before let go", () => {
    for (const offBefore of [false, true]) {
      const core = new SynthCore(
        SR,
        makePatch({
          osc: [{ shape: 0, drift: 0 }],
          filters: [{ on: false }],
          envs: [{ attack: 0.002, decay: 0.05, sustain: 0.5, release: 0.05 }],
          voice: { mode: "mono" },
        }),
      );
      core.noteOn(1, 57, 0.8, 0);
      // the next step's note-off has gone through already, or not yet
      if (offBefore) core.noteOff(1, Math.round(0.19 * SR));
      else core.noteOff(1, Math.round(0.4 * SR));
      core.slideTo(1, 2, 69, 0.8, Math.round(0.2 * SR));
      core.noteOff(2, Math.round(0.6 * SR));
      const n = Math.round(0.7 * SR);
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      for (let f = 0; f < n; f += 128)
        core.process(l.subarray(f, f + 128), r.subarray(f, f + 128), f);
      // it glides up an octave and keeps sounding (the first note-off was dropped)
      expect(freq(slice(l, 0.1, 0.18))).toBeCloseTo(220, 0);
      expect(freq(slice(l, 0.4, 0.55))).toBeCloseTo(440, 0);
      // no new attack: the level only rises back to the sustain, never to the peak
      const level = rms(slice(l, 0.1, 0.18));
      expect(rms(slice(l, 0.2, 0.25)), `off before: ${offBefore}`).toBeLessThan(level * 1.3);
    }
  });

  it("locks the macros for a step, then lets go (unless locked again since)", () => {
    const p = makePatch({
      osc: [{ shape: 0 }],
      filters: [{ cutoff: 1000 }],
      envs: [{ sustain: 1 }],
      macros: [
        { name: "Level", value: 1, targets: [{ path: "output.volume", min: -40, max: -12 }] },
      ],
    });
    const core = new SynthCore(SR, p);
    core.noteOn(1, 69, 1, 0);
    core.lockMacros(1, [0], SR * 0.2);
    core.lockMacros(1, null, SR * 0.4);
    core.lockMacros(2, [0], SR * 0.6);
    // lock 1's end comes after lock 2 began: it mustn't end lock 2
    core.lockMacros(1, null, SR * 0.7);
    const l = new Float32Array(SR);
    const r = new Float32Array(SR);
    core.process(l, r, 0, SR);
    const level = (t: number) => rms(l.subarray(Math.round(t * SR), Math.round((t + 0.05) * SR)));
    expect(level(0.25)).toBeLessThan(level(0.1) / 10);
    expect(level(0.5) / level(0.1)).toBeCloseTo(1, 1);
    expect(level(0.8)).toBeLessThan(level(0.1) / 10);
  });

  it("renders well faster than real time", () => {
    // a big pad: 8 voices × 7-voice supersaw + oscillator 2, ladder filter
    const start = performance.now();
    render(
      {
        osc: [
          { shape: 2, unison: 7 },
          { shape: 3, unison: 2 },
        ],
        filters: [{ on: true, model: "ladder", cutoff: 2000, reso: 0.3 }],
      },
      [48, 52, 55, 59, 60, 64, 67, 71].map((n) => [n, 0, null] as [number, number, null]),
      2,
    );
    const seconds = (performance.now() - start) / 1000;
    expect(seconds).toBeLessThan(1);
  });

  it("bends the pitch by the bend range", () => {
    const { core, mono } = render({ osc: [sine], voice: { bend: 12 } }, [[57, 0, null]], 0.2);
    void mono;
    core.controls.pitchbend = 1;
    const n = Math.round(0.4 * SR);
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let f = 0; f < n; f += 128)
      core.process(l.subarray(f, f + 128), r.subarray(f, f + 128), Math.round(0.2 * SR) + f);
    // a full bend up of 12 semitones: 220 Hz → 440 Hz
    expect(freq(l.subarray(Math.round(0.1 * SR)))).toBeCloseTo(440, -0.5);
  });

  it("scales a slot by its via source: vibrato only with the mod wheel up", () => {
    const spec: PatchSpec = {
      osc: [sine],
      lfos: [{ rate: 2, shape: "square" as const, mode: "global" as const }],
      matrix: [
        {
          source: "lfo1" as const,
          dest: "pitch" as const,
          amount: 1 / 24,
          via: "modwheel" as const,
        },
      ],
    };
    const still = render(spec, [[69, 0, null]], 1).mono;
    const f = [0.05, 0.3, 0.55, 0.8].map((t) => freq(slice(still, t, t + 0.15)));
    // mod wheel down: no vibrato
    expect(Math.max(...f) / Math.min(...f)).toBeLessThan(1.005);
  });
});
