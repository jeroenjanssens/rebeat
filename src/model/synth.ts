/**
 * Synth patches, version 2 (D83): the complete synth as data. Three oscillators (shape morph,
 * pulse width, unison, sync, ring, FM), sub and noise, two filters (ladder or state-variable),
 * three envelopes, three LFOs, an 8-slot mod matrix, 8 macros, voice and output settings.
 * engine/synth/core.ts plays it; version 1 patches (synthV1.ts) are upgraded when read.
 */
import type { StepSize } from "./types";
import { INIT_PATCH as V1_INIT, type SynthPatch as SynthPatchV1 } from "./synthV1";

/** Patches are plain JSON. (structuredClone doesn't exist in AudioWorklets, where this runs.) */
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export interface Osc {
  on: boolean;
  /** 0 sine → 1 triangle → 2 saw → 3 pulse, morphing in between. */
  shape: number;
  /** Pulse width (0.05..0.95) at shape 3; 0.5 is a square. */
  pw: number;
  /** 0..1 */
  level: number;
  /** -1 (left) .. 1 (right) */
  pan: number;
  octave: number;
  semi: number;
  /** cents */
  fine: number;
  /** 1..8 stacked voices, spread over `detune` cents and `width` in stereo. */
  unison: number;
  detune: number;
  width: number;
  /** Restart at `phase` on every note (otherwise free-running). */
  retrigger: boolean;
  phase: number;
  /** Slow random pitch wander, like an analog synth (0..1). */
  drift: number;
  /** Hard sync to oscillator 1 (oscillators 2 and 3). */
  sync: boolean;
}

export type FilterModel = "ladder" | "svf";
export type FilterType = "lp" | "hp" | "bp" | "notch";

export interface Filter {
  on: boolean;
  /** Ladder: the 24 dB low-pass of classic analog synths (self-oscillates). SVF: 12 dB, four types. */
  model: FilterModel;
  type: FilterType;
  /** Hz */
  cutoff: number;
  /** 0..1 (the ladder self-oscillates near 1) */
  reso: number;
  /** Saturation going into the filter (0..1). */
  drive: number;
  /** How much the cutoff follows the note (0..1). */
  keytrack: number;
  /** Filter envelope (envelope 2) amount, in octaves (-6..6). */
  env: number;
  /** How much velocity opens the filter, in octaves (0..4). */
  velocity: number;
}

export interface Env {
  /** seconds */
  attack: number;
  hold: number;
  decay: number;
  /** 0..1 */
  sustain: number;
  release: number;
  /** -1 (fast start) .. 0 (linear) .. 1 (slow start); decay and release share `curve`. */
  attackCurve: number;
  curve: number;
  /** How much velocity scales the envelope (0..1). */
  velocity: number;
  /** Repeat attack → decay while the note is held. */
  loop: boolean;
}

export type LfoShape = "sine" | "triangle" | "rampUp" | "rampDown" | "square" | "sh" | "smooth";

export interface Lfo {
  shape: LfoShape;
  /** Hz, unless synced */
  rate: number;
  /** A note length ("1/8", "1/8.", "1/8T", "1/1"…) to sync one cycle to the tempo. */
  sync: string | null;
  /** 0..1 */
  phase: number;
  /** Seconds before it fades in fully. */
  delay: number;
  /** Per voice (restarts with each note) or one for all voices. */
  mode: "voice" | "global";
  /** 0..1 instead of -1..1 */
  unipolar: boolean;
}

export const MOD_SOURCES = [
  "lfo1",
  "lfo2",
  "lfo3",
  "env1",
  "env2",
  "env3",
  "velocity",
  "note",
  "modwheel",
  "aftertouch",
  "pitchbend",
  "random",
  "macro1",
  "macro2",
  "macro3",
  "macro4",
  "macro5",
  "macro6",
  "macro7",
  "macro8",
] as const;
export type ModSource = (typeof MOD_SOURCES)[number];

/** What modulation can move, with the size of a full (amount 1) modulation. */
export const MOD_DESTS = {
  pitch: { label: "Pitch", range: 24, unit: "semitones" },
  "osc1.pitch": { label: "Osc 1 pitch", range: 24, unit: "semitones" },
  "osc2.pitch": { label: "Osc 2 pitch", range: 24, unit: "semitones" },
  "osc3.pitch": { label: "Osc 3 pitch", range: 24, unit: "semitones" },
  "osc1.shape": { label: "Osc 1 shape", range: 3, unit: "" },
  "osc2.shape": { label: "Osc 2 shape", range: 3, unit: "" },
  "osc3.shape": { label: "Osc 3 shape", range: 3, unit: "" },
  "osc1.pw": { label: "Osc 1 pulse width", range: 0.45, unit: "" },
  "osc2.pw": { label: "Osc 2 pulse width", range: 0.45, unit: "" },
  "osc3.pw": { label: "Osc 3 pulse width", range: 0.45, unit: "" },
  "osc1.level": { label: "Osc 1 level", range: 1, unit: "" },
  "osc2.level": { label: "Osc 2 level", range: 1, unit: "" },
  "osc3.level": { label: "Osc 3 level", range: 1, unit: "" },
  "sub.level": { label: "Sub level", range: 1, unit: "" },
  "noise.level": { label: "Noise level", range: 1, unit: "" },
  ring: { label: "Ring mod", range: 1, unit: "" },
  fm: { label: "FM amount", range: 40, unit: "" },
  "filter1.cutoff": { label: "Filter 1 cutoff", range: 8, unit: "octaves" },
  "filter2.cutoff": { label: "Filter 2 cutoff", range: 8, unit: "octaves" },
  "filter1.reso": { label: "Filter 1 resonance", range: 1, unit: "" },
  "filter2.reso": { label: "Filter 2 resonance", range: 1, unit: "" },
  "filter1.drive": { label: "Filter 1 drive", range: 1, unit: "" },
  amp: { label: "Volume", range: 1, unit: "" },
  pan: { label: "Pan", range: 1, unit: "" },
  "lfo1.rate": { label: "LFO 1 rate", range: 4, unit: "octaves" },
  "lfo2.rate": { label: "LFO 2 rate", range: 4, unit: "octaves" },
  "lfo3.rate": { label: "LFO 3 rate", range: 4, unit: "octaves" },
} as const;
export type ModDest = keyof typeof MOD_DESTS;

export interface ModSlot {
  source: ModSource | null;
  dest: ModDest | null;
  /** -1..1 of the destination's range */
  amount: number;
  /** Scales the amount (e.g. the mod wheel brings in vibrato). */
  via: ModSource | null;
}

export interface Macro {
  name: string;
  /** 0..1 */
  value: number;
  /** Up to 4 targets: a patch parameter (path) moved from `min` to `max` as the macro turns. */
  targets: { path: string; min: number; max: number }[];
}

export interface SynthPatch {
  version: 2;
  osc: [Osc, Osc, Osc];
  sub: { level: number; octave: -1 | -2; shape: "sine" | "square" };
  noise: { level: number; color: "white" | "pink" };
  /** Oscillator 1 × 2 (0..1). */
  ring: number;
  /** Phase modulation: the modulator bends the carrier (bells, e-pianos, metallic leads). */
  fm: { amount: number; route: "2>1" | "3>1" | "3>2" | "1>1" };
  filters: [Filter, Filter];
  /** Filter 2 after filter 1, or both on the oscillators and mixed. */
  routing: "serial" | "parallel";
  /** Envelope 1 = amp, 2 = filter, 3 = free (mod matrix). */
  envs: [Env, Env, Env];
  lfos: [Lfo, Lfo, Lfo];
  matrix: ModSlot[];
  macros: Macro[];
  voice: {
    mode: "poly" | "mono" | "legato";
    voices: number;
    /** seconds */
    glide: number;
    /** Glide always (mono) or only between overlapping notes. */
    glideMode: "always" | "legato";
    steal: "oldest" | "quietest";
    /** -1 (soft notes louder) .. 1 (harder to play loud) */
    velocityCurve: number;
    /** Pitch bend range in semitones. */
    bend: number;
    /** Overall tuning in cents. */
    tune: number;
  };
  output: { drive: number; volume: number; pan: number; spread: number };
}

export const NOTE_LENGTHS = [
  "4/1",
  "2/1",
  "1/1",
  "1/2",
  "1/2.",
  "1/2T",
  "1/4",
  "1/4.",
  "1/4T",
  "1/8",
  "1/8.",
  "1/8T",
  "1/16",
  "1/16.",
  "1/16T",
  "1/32",
] as const;

/** A note length in quarter notes ("1/8." → 0.75). */
export function noteLengthQuarters(len: string): number {
  const m = /^(\d+)\/(\d+)([.T]?)$/.exec(len);
  if (!m) return 1;
  const base = (4 * Number(m[1])) / Number(m[2]);
  return m[3] === "." ? base * 1.5 : m[3] === "T" ? (base * 2) / 3 : base;
}

const osc = (o: Partial<Osc> = {}): Osc => ({
  on: true,
  shape: 2,
  pw: 0.5,
  level: 1,
  pan: 0,
  octave: 0,
  semi: 0,
  fine: 0,
  unison: 1,
  detune: 20,
  width: 0.5,
  retrigger: false,
  phase: 0,
  drift: 0.05,
  sync: false,
  ...o,
});

const filter = (f: Partial<Filter> = {}): Filter => ({
  on: true,
  model: "svf",
  type: "lp",
  cutoff: 8000,
  reso: 0.1,
  drive: 0,
  keytrack: 0.3,
  env: 0,
  velocity: 0,
  ...f,
});

const env = (e: Partial<Env> = {}): Env => ({
  attack: 0.005,
  hold: 0,
  decay: 0.3,
  sustain: 0.8,
  release: 0.3,
  attackCurve: 0,
  curve: 0.5,
  velocity: 0,
  loop: false,
  ...e,
});

const lfo = (l: Partial<Lfo> = {}): Lfo => ({
  shape: "sine",
  rate: 5,
  sync: null,
  phase: 0,
  delay: 0,
  mode: "voice",
  unipolar: false,
  ...l,
});

const emptySlot = (): ModSlot => ({ source: null, dest: null, amount: 0, via: null });

export const DEFAULT_MACROS: Macro[] = [
  "Brightness",
  "Bite",
  "Character",
  "Thickness",
  "Attack",
  "Release",
  "Movement",
  "Drive",
].map((name) => ({ name, value: 0.5, targets: [] }));

export const INIT_PATCH: SynthPatch = {
  version: 2,
  osc: [osc(), osc({ on: false, level: 0 }), osc({ on: false, level: 0 })],
  sub: { level: 0, octave: -1, shape: "sine" },
  noise: { level: 0, color: "white" },
  ring: 0,
  fm: { amount: 0, route: "2>1" },
  filters: [filter(), filter({ on: false })],
  routing: "serial",
  envs: [env({ velocity: 0.6 }), env({ sustain: 0.3 }), env({ sustain: 0 })],
  lfos: [lfo(), lfo({ rate: 0.5 }), lfo({ rate: 2, shape: "triangle" })],
  matrix: Array.from({ length: 8 }, emptySlot),
  macros: clone(DEFAULT_MACROS),
  voice: {
    mode: "poly",
    voices: 16,
    glide: 0,
    glideMode: "legato",
    steal: "oldest",
    velocityCurve: 0,
    bend: 2,
    tune: 0,
  },
  output: { drive: 0, volume: -12, pan: 0, spread: 0.3 },
};

/** Deep partial, for writing patches compactly. */
export type PatchSpec = {
  version?: 2;
  osc?: [Partial<Osc>?, Partial<Osc>?, Partial<Osc>?];
  sub?: Partial<SynthPatch["sub"]>;
  noise?: Partial<SynthPatch["noise"]>;
  ring?: number;
  fm?: Partial<SynthPatch["fm"]>;
  filters?: [Partial<Filter>?, Partial<Filter>?];
  routing?: SynthPatch["routing"];
  envs?: [Partial<Env>?, Partial<Env>?, Partial<Env>?];
  lfos?: [Partial<Lfo>?, Partial<Lfo>?, Partial<Lfo>?];
  matrix?: Partial<ModSlot>[];
  macros?: (Partial<Macro> & { name: string })[];
  voice?: Partial<SynthPatch["voice"]>;
  output?: Partial<SynthPatch["output"]>;
};

/** A full patch from a partial one. Oscillators given in the spec are on unless they say not. */
export function makePatch(spec: PatchSpec = {}): SynthPatch {
  const p = clone(INIT_PATCH);
  spec.osc?.forEach((o, i) => o && (p.osc[i] = osc({ on: true, ...o })));
  spec.filters?.forEach((f, i) => f && (p.filters[i] = filter({ on: true, ...f })));
  spec.envs?.forEach((e, i) => e && Object.assign(p.envs[i], e));
  spec.lfos?.forEach((l, i) => l && Object.assign(p.lfos[i], l));
  spec.matrix?.forEach((m, i) => (p.matrix[i] = { ...emptySlot(), ...m }));
  spec.macros?.forEach((m, i) => (p.macros[i] = { value: 0.5, targets: [], ...m }));
  for (const k of ["sub", "noise", "fm", "voice", "output"] as const)
    if (spec[k]) Object.assign(p[k], spec[k]);
  if (spec.ring !== undefined) p.ring = spec.ring;
  if (spec.routing) p.routing = spec.routing;
  return p;
}

const clamp = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

/** Keep every value in its range (guards the engine against hand-edited or old data). */
export function sanitizePatch(p: SynthPatch): SynthPatch {
  const o = (x: Osc): Osc => ({
    ...x,
    shape: clamp(x.shape, 0, 3),
    pw: clamp(x.pw, 0.05, 0.95),
    level: clamp(x.level, 0, 1),
    pan: clamp(x.pan, -1, 1),
    octave: Math.round(clamp(x.octave, -3, 3)),
    semi: Math.round(clamp(x.semi, -12, 12)),
    fine: clamp(x.fine, -100, 100),
    unison: Math.round(clamp(x.unison, 1, 8)),
    detune: clamp(x.detune, 0, 100),
    width: clamp(x.width, 0, 1),
    phase: clamp(x.phase, 0, 1),
    drift: clamp(x.drift, 0, 1),
  });
  const f = (x: Filter): Filter => ({
    ...x,
    cutoff: clamp(x.cutoff, 20, 20000),
    reso: clamp(x.reso, 0, 1),
    drive: clamp(x.drive, 0, 1),
    keytrack: clamp(x.keytrack, 0, 1),
    env: clamp(x.env, -6, 6),
    velocity: clamp(x.velocity, 0, 4),
  });
  const e = (x: Env): Env => ({
    ...x,
    attack: clamp(x.attack, 0.0005, 10),
    hold: clamp(x.hold, 0, 10),
    decay: clamp(x.decay, 0.001, 10),
    sustain: clamp(x.sustain, 0, 1),
    release: clamp(x.release, 0.001, 15),
    attackCurve: clamp(x.attackCurve, -1, 1),
    curve: clamp(x.curve, -1, 1),
    velocity: clamp(x.velocity, 0, 1),
  });
  const l = (x: Lfo): Lfo => ({
    ...x,
    rate: clamp(x.rate, 0.01, 50),
    phase: clamp(x.phase, 0, 1),
    delay: clamp(x.delay, 0, 10),
  });
  return {
    ...p,
    osc: p.osc.map(o) as SynthPatch["osc"],
    sub: { ...p.sub, level: clamp(p.sub.level, 0, 1) },
    noise: { ...p.noise, level: clamp(p.noise.level, 0, 1) },
    ring: clamp(p.ring, 0, 1),
    fm: { ...p.fm, amount: clamp(p.fm.amount, 0, 40) },
    filters: p.filters.map(f) as SynthPatch["filters"],
    envs: p.envs.map(e) as SynthPatch["envs"],
    lfos: p.lfos.map(l) as SynthPatch["lfos"],
    matrix: p.matrix.slice(0, 8).map((s) => ({ ...s, amount: clamp(s.amount, -1, 1) })),
    macros: p.macros.slice(0, 8).map((m) => ({
      ...m,
      value: clamp(m.value, 0, 1),
      targets: m.targets.slice(0, 4),
    })),
    voice: {
      ...p.voice,
      voices: Math.round(clamp(p.voice.voices, 1, 16)),
      glide: clamp(p.voice.glide, 0, 5),
      velocityCurve: clamp(p.voice.velocityCurve, -1, 1),
      bend: Math.round(clamp(p.voice.bend, 0, 24)),
      tune: clamp(p.voice.tune, -100, 100),
    },
    output: {
      drive: clamp(p.output.drive, 0, 1),
      volume: clamp(p.output.volume, -40, 6),
      pan: clamp(p.output.pan, -1, 1),
      spread: clamp(p.output.spread, 0, 1),
    },
  };
}

// ---------- reading older patches ----------

const WAVE_SHAPE = { sine: 0, triangle: 1, sawtooth: 2, square: 3, pulse: 3 } as const;

/** Version 1 Q (0.1..20) as version 2 resonance (0..1). */
const resoFromQ = (q: number) => clamp(Math.log(Math.max(q, 0.5) / 0.5) / Math.log(40), 0, 0.95);

/** A version 1 patch (D79) in version 2 terms, sounding as close as possible. */
export function upgradeV1(old: SynthPatchV1): SynthPatch {
  const v1 = { ...clone(V1_INIT), ...old };
  const o1 = (x: SynthPatchV1["osc1"]): Partial<Osc> => ({
    on: x.level > 0,
    shape: WAVE_SHAPE[x.wave],
    pw: x.wave === "pulse" ? x.width : 0.5,
    level: x.level,
    octave: x.octave,
    fine: x.detune,
    unison: x.unison,
    detune: x.spread,
    width: x.unison > 1 ? 0.5 : 0,
    drift: 0,
  });
  const ladder = v1.filter.type === "lowpass" && v1.filter.slope === 24;
  // FM: oscillator 3 as a sine modulator at the ratio, faded by envelope 3
  const fmOn = v1.fm.index > 0;
  const ratioSemis = 12 * Math.log2(v1.fm.ratio);
  const p = makePatch({
    osc: [
      o1(v1.osc1),
      o1(v1.osc2),
      fmOn
        ? {
            shape: 0,
            level: 0,
            on: true,
            octave: Math.floor(ratioSemis / 12),
            semi: Math.floor(ratioSemis % 12),
            fine: (ratioSemis - Math.floor(ratioSemis)) * 100,
            retrigger: true,
            drift: 0,
          }
        : { on: false, level: 0 },
    ],
    sub: { level: v1.sub, octave: -1, shape: "sine" },
    noise: { level: v1.noise * 0.7, color: "white" },
    fm: { amount: 0, route: "3>1" },
    filters: [
      {
        model: ladder ? "ladder" : "svf",
        type: v1.filter.type === "lowpass" ? "lp" : v1.filter.type === "highpass" ? "hp" : "bp",
        cutoff: v1.filter.cutoff,
        reso: resoFromQ(v1.filter.reso),
        keytrack: v1.filter.keytrack,
        env: v1.filter.env,
      },
    ],
    envs: [
      { ...v1.amp, hold: 0, velocity: v1.velocity },
      { ...v1.filterEnv, hold: 0 },
      fmOn
        ? { attack: 0.001, decay: v1.fm.decay, sustain: 0.05, release: v1.fm.decay, curve: 0.7 }
        : {},
    ],
    lfos: [
      {
        shape: v1.lfo.shape === "sawtooth" ? "rampUp" : v1.lfo.shape,
        rate: v1.lfo.rate,
        // version 1 synced one cycle to four steps of the chosen size
        sync: v1.lfo.sync ? lengthOf(stepQuarters(v1.lfo.sync) * 4) : null,
        mode: "global",
      },
    ],
    matrix: [
      ...(v1.lfo.depth > 0
        ? [
            {
              source: "lfo1" as const,
              dest: (
                {
                  pitch: "pitch",
                  filter: "filter1.cutoff",
                  amp: "amp",
                  pan: "pan",
                } as const
              )[v1.lfo.target],
              // v1 depth 1 = ±1 semitone, ±2 octaves, full tremolo, full pan
              amount:
                v1.lfo.depth *
                (v1.lfo.target === "pitch" ? 1 / 24 : v1.lfo.target === "filter" ? 2 / 8 : 0.5),
            },
          ]
        : []),
      ...(fmOn ? [{ source: "env3" as const, dest: "fm" as const, amount: v1.fm.index / 40 }] : []),
    ],
    voice: { mode: v1.mono ? "mono" : "poly", glide: v1.glide, glideMode: "always" },
    output: { drive: v1.drive, volume: v1.volume, spread: 0 },
  });
  return p;
}

const STEP_QUARTERS: Record<StepSize, number> = {
  "1/4": 1,
  "1/8": 0.5,
  "1/8T": 1 / 3,
  "1/16": 0.25,
  "1/16T": 1 / 6,
  "1/32": 0.125,
};
const stepQuarters = (s: StepSize) => STEP_QUARTERS[s];

/** The note length of `quarters` quarter notes ("1/2" for 2). */
const lengthOf = (quarters: number) =>
  NOTE_LENGTHS.find((l) => Math.abs(noteLengthQuarters(l) - quarters) < 1e-6) ?? "1/4";

/** Any stored patch (version 1 or 2) as a sanitized version 2 patch. */
export function upgradePatch(p: unknown): SynthPatch {
  if (!p || typeof p !== "object") return sanitizePatch(clone(INIT_PATCH));
  const raw = p as { version?: number };
  const v2 = raw.version === 2 ? (raw as SynthPatch) : upgradeV1(raw as SynthPatchV1);
  // fill in fields added since the patch was saved
  return sanitizePatch({ ...clone(INIT_PATCH), ...v2 });
}

/** The instrument SOUND knobs at rest: a patch keeps its own values until you move them. */
const KNOB_DEFAULTS: Record<string, number> = {
  "sound.attack": 0.05,
  "sound.decay": 0.4,
  "sound.sustain": 0.7,
  "sound.release": 0.35,
  "sound.glide": 0,
  "sound.detune": 0.5,
};

const moved = (params: Record<string, number>, key: string) =>
  params[key] !== undefined && Math.abs(params[key] - KNOB_DEFAULTS[key]) > 1e-6;

/** A patch with the track's moved SOUND knobs applied (envelope, glide, detune). */
export function withKnobs(patch: SynthPatch, params: Record<string, number>): SynthPatch {
  const p = clone(patch);
  const ms = (lo: number, hi: number, v: number) => (lo * Math.pow(hi / lo, v)) / 1000;
  const amp = p.envs[0];
  if (moved(params, "sound.attack")) amp.attack = ms(1, 4000, params["sound.attack"]);
  if (moved(params, "sound.decay")) amp.decay = ms(1, 4000, params["sound.decay"]);
  if (moved(params, "sound.sustain")) amp.sustain = params["sound.sustain"];
  if (moved(params, "sound.release")) amp.release = ms(1, 8000, params["sound.release"]);
  if (moved(params, "sound.glide")) p.voice.glide = ms(1, 1000, params["sound.glide"]);
  if (moved(params, "sound.detune")) p.voice.tune += (params["sound.detune"] - 0.5) * 2 * 100;
  return p;
}
