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

/**
 * An envelope segment's shape: 0..1 over the segment (x 0..1). c < 0 starts fast, c > 0 slow,
 * 0 is a straight line. The engine and the editor's pictures share it.
 */
export function envCurve(x: number, c: number) {
  if (Math.abs(c) < 0.01) return x;
  const k = c * 6;
  return (Math.exp(k * x) - 1) / (Math.exp(k) - 1);
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

export interface MacroTarget {
  /** A patch parameter: "filters.0.cutoff" */
  path: string;
  /** Its value with the macro at 0 and at 1. */
  min: number;
  max: number;
}

export interface Macro {
  name: string;
  /** 0..1: where the macro rests (a track's SOUND knob turns it from there). */
  value: number;
  /** Up to 4 targets, each moved from `min` to `max` as the macro turns. */
  targets: MacroTarget[];
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

// ---------- macros ----------

/** Frequencies and times move evenly in octaves as a macro turns (200 → 3200 Hz passes 800). */
const GEOMETRIC = /(cutoff|rate|attack|decay|release)$/;
const geometric = (t: MacroTarget) => GEOMETRIC.test(t.path) && t.min > 0 && t.max > 0;

/** A target's value with its macro at `v`. */
export function macroAt(t: MacroTarget, v: number): number {
  return geometric(t) ? t.min * Math.pow(t.max / t.min, v) : t.min + (t.max - t.min) * v;
}

const numberAt = (p: SynthPatch, path: string) =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], p);

function setNumber(p: SynthPatch, path: string, v: number) {
  const keys = path.split(".");
  const last = keys.pop()!;
  let obj = p as unknown as Record<string, unknown>;
  for (const k of keys) obj = obj?.[k] as Record<string, unknown>;
  if (typeof obj?.[last] === "number") obj[last] = v;
}

/** The patch with each macro's targets set from its value. */
export function applyMacros(patch: SynthPatch): SynthPatch {
  if (!patch.macros.some((m) => m.targets.length)) return patch;
  const p = clone(patch);
  for (const m of p.macros) for (const t of m.targets) setNumber(p, t.path, macroAt(t, m.value));
  return p;
}

/** The patch with the macros at these values (a track's SOUND knobs; undefined keeps the patch's). */
export function withMacroValues(patch: SynthPatch, values: (number | undefined)[]): SynthPatch {
  if (!values.some((v, i) => v !== undefined && v !== patch.macros[i]?.value)) return patch;
  const p = clone(patch);
  values.forEach((v, i) => v !== undefined && p.macros[i] && (p.macros[i].value = v));
  return p;
}

/** Values ↔ the space a macro moves in (octaves for frequencies and times). */
const space = (geo: boolean) =>
  geo ? { to: Math.log, from: Math.exp } : { to: (x: number) => x, from: (x: number) => x };

/**
 * Set a parameter that macros may move: each target on it shifts its range so that the macro,
 * where it is now, gives `v` (within lo..hi). Otherwise the macro would overrule the edit.
 */
export function setThroughMacros(
  p: SynthPatch,
  path: string,
  v: number,
  lo: number,
  hi: number,
  values: (number | undefined)[] = [],
) {
  setNumber(p, path, v);
  p.macros.forEach((m, i) => {
    const at = values[i] ?? m.value;
    for (const t of m.targets) {
      if (t.path !== path) continue;
      const geo = geometric(t) && v > 0 && lo > 0;
      const s = space(geo);
      const [V, LO, HI] = [s.to(v), s.to(lo), s.to(hi)];
      const delta = V - s.to(macroAt(t, at));
      let a = s.to(t.min) + delta;
      let b = s.to(t.max) + delta;
      if (a < LO) {
        a = LO;
        if (at > 0) b = LO + (V - LO) / at;
      }
      if (b > HI) {
        b = HI;
        if (at < 1) a = (V - HI * at) / (1 - at);
      }
      t.min = s.from(Math.min(HI, Math.max(LO, a)));
      t.max = s.from(Math.min(HI, Math.max(LO, b)));
    }
  });
}

type RangeSpec = [path: string, lo: number, hi: number, span: number, at?: number];

/**
 * Default macros that suit a patch: each one's range is placed around the patch's own values, so
 * the macros at rest leave the sound as it is. `span` is a ratio for frequencies and times.
 */
export function autoMacros(p: SynthPatch): { macros: Macro[]; movement: ModSlot | null } {
  const macro = (name: string, specs: RangeSpec[], fallback = 0.5): Macro => {
    let at: number | null = null;
    const targets: MacroTarget[] = [];
    for (const [path, lo, hi, span, prefer = 0.5] of specs) {
      const c = numberAt(p, path);
      if (typeof c !== "number") continue;
      const geo = GEOMETRIC.test(path) && c > 0 && lo > 0;
      const s = space(geo);
      const [C, LO, HI] = [s.to(c), s.to(lo), s.to(hi)];
      let S = Math.min(geo ? Math.log(span) : span, HI - LO);
      let min: number;
      if (at === null) {
        // the first target: a range of `span`, slid inside lo..hi, decides where the macro rests
        min = Math.min(HI - S, Math.max(LO, C - prefer * S));
        at = S > 0 ? (C - min) / S : 0;
      } else {
        // the others rest at the same place: their range shrinks to fit
        if (at > 0) S = Math.min(S, (C - LO) / at);
        if (at < 1) S = Math.min(S, (HI - C) / (1 - at));
        min = C - at * S;
      }
      // a target already at its limit, with the macro resting there too, can't move
      if (S > 1e-9) targets.push({ path, min: s.from(min), max: s.from(min + S) });
    }
    return { name, value: at ?? fallback, targets };
  };
  const filters = p.filters.flatMap((f, i) => (f.on ? [i] : []));
  const oscs = p.osc.flatMap((o, i) => (o.on && o.level > 0 ? [i] : [])).slice(0, 2);
  const macros = [
    macro(
      "Brightness",
      filters.map((i): RangeSpec => [`filters.${i}.cutoff`, 20, 20000, 64]),
    ),
    macro(
      "Bite",
      p.filters[0].on
        ? [
            ["filters.0.reso", 0, 1, 0.9, 0.3],
            ["filters.0.env", -6, 6, 6],
          ]
        : [],
    ),
    macro(
      "Character",
      oscs.map((i): RangeSpec => [`osc.${i}.shape`, 0, 3, 3]),
    ),
    macro("Thickness", [
      ["sub.level", 0, 1, 1, 0.3],
      ...(p.osc[0].unison > 1 ? [["osc.0.detune", 0, 100, 80] as RangeSpec] : []),
      ...(p.osc[1].on ? [["osc.1.fine", -100, 100, 30] as RangeSpec] : []),
    ]),
    macro("Attack", [
      ["envs.0.attack", 0.0005, 10, 1000, 0.3],
      ["envs.1.attack", 0.0005, 10, 1000],
    ]),
    macro("Release", [
      ["envs.0.release", 0.001, 15, 1000, 0.4],
      ["envs.1.release", 0.001, 15, 1000],
    ]),
    // the mod matrix does the moving: LFO 2, scaled by this macro
    macro("Movement", [], 0),
    macro("Drive", [["output.drive", 0, 1, 1, p.output.drive]]),
  ];
  const movement: ModSlot = p.filters[0].on
    ? { source: "lfo2", dest: "filter1.cutoff", amount: 0.2, via: "macro7" }
    : { source: "lfo2", dest: "pitch", amount: 0.25 / 24, via: "macro7" };
  return { macros, movement };
}

/** Give a patch its default macros (and the Movement slot, if the matrix has room). */
function withAutoMacros(p: SynthPatch, keep: (Macro | undefined)[] = []): SynthPatch {
  const auto = autoMacros(p);
  p.macros = auto.macros.map((m, i) => keep[i] ?? m);
  const free = p.matrix.findIndex((s) => !s.source && !s.dest);
  if (!keep[6] && auto.movement && free >= 0) p.matrix[free] = auto.movement;
  return p;
}

const INIT_BASE: SynthPatch = {
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

export const INIT_PATCH: SynthPatch = withAutoMacros(clone(INIT_BASE));

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

/**
 * A full patch from a partial one. Oscillators given in the spec are on unless they say not;
 * macros the spec doesn't give are the defaults for the resulting sound (autoMacros).
 */
export function makePatch(spec: PatchSpec = {}): SynthPatch {
  const p = clone(INIT_BASE);
  spec.osc?.forEach((o, i) => o && (p.osc[i] = osc({ on: true, ...o })));
  spec.filters?.forEach((f, i) => f && (p.filters[i] = filter({ on: true, ...f })));
  spec.envs?.forEach((e, i) => e && Object.assign(p.envs[i], e));
  spec.lfos?.forEach((l, i) => l && Object.assign(p.lfos[i], l));
  spec.matrix?.forEach((m, i) => (p.matrix[i] = { ...emptySlot(), ...m }));
  for (const k of ["sub", "noise", "fm", "voice", "output"] as const)
    if (spec[k]) Object.assign(p[k], spec[k]);
  if (spec.ring !== undefined) p.ring = spec.ring;
  if (spec.routing) p.routing = spec.routing;
  return withAutoMacros(
    p,
    (spec.macros ?? []).map((m) => m && { value: 0.5, targets: [], ...m }),
  );
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
export const SOUND_KNOB_DEFAULTS: Record<string, number> = {
  "sound.attack": 0.05,
  "sound.decay": 0.4,
  "sound.sustain": 0.7,
  "sound.release": 0.35,
  "sound.glide": 0,
  "sound.detune": 0.5,
};

const moved = (params: Record<string, number>, key: string) =>
  params[key] !== undefined && Math.abs(params[key] - SOUND_KNOB_DEFAULTS[key]) > 1e-6;

/** The SOUND knobs moved from rest (they shape a synth's patch: withKnobs). */
export const movedKnobs = (params: Record<string, number>) =>
  Object.keys(SOUND_KNOB_DEFAULTS).filter((k) => moved(params, k));

/**
 * A patch with the track's moved SOUND knobs applied (envelope, glide, detune): how synth tracks
 * played before their SOUND knobs became the macros (the conversion, D85, uses it).
 */
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
