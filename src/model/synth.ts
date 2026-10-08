/**
 * Synth patches (D79): a synth sound as data, so it can be shown, edited, saved and shared.
 * One voice implementation (engine/synth.ts) plays every patch, live and offline.
 */
import type { StepSize } from "./types";

export type Wave = "sine" | "triangle" | "sawtooth" | "square" | "pulse";

export interface Osc {
  wave: Wave;
  /** 0..1 */
  level: number;
  /** Octaves up or down (-3..3). */
  octave: number;
  /** Fine tuning in cents (-100..100). */
  detune: number;
  /** Pulse width (0.05..0.95), for the pulse wave. */
  width: number;
  /** Unison voices (1..7) spread over `spread` cents: the "supersaw" sound. */
  unison: number;
  spread: number;
}

/** Times in seconds, sustain 0..1. */
export interface Adsr {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export type LfoTarget = "pitch" | "filter" | "amp" | "pan";

export interface SynthPatch {
  /** One note at a time, with glide (basslines, leads). */
  mono: boolean;
  /** Mono: seconds to glide between notes (0 = only on slides). */
  glide: number;
  osc1: Osc;
  osc2: Osc;
  /** A sine one octave below oscillator 1 (0..1). */
  sub: number;
  /** White noise (0..1). */
  noise: number;
  /** Frequency modulation of oscillator 1 by a sine at `ratio` × the note (bells, e-pianos). */
  fm: { ratio: number; index: number; decay: number };
  filter: {
    type: "lowpass" | "highpass" | "bandpass";
    /** Hz */
    cutoff: number;
    /** Resonance (Q, 0.1..20). */
    reso: number;
    /** 12 or 24 dB/octave. */
    slope: 12 | 24;
    /** How much the cutoff follows the note (0..1). */
    keytrack: number;
    /** Filter envelope amount in octaves (-6..6). */
    env: number;
  };
  /** Saturation before the output (0..1). */
  drive: number;
  amp: Adsr;
  filterEnv: Adsr;
  lfo: {
    shape: "sine" | "triangle" | "square" | "sawtooth";
    /** Hz, unless synced. */
    rate: number;
    /** Synced to the tempo: one cycle per this note length. */
    sync: StepSize | null;
    target: LfoTarget;
    /** 0..1 (0 = off). */
    depth: number;
  };
  /** How much velocity changes the loudness (0..1). */
  velocity: number;
  /** dB */
  volume: number;
}

const osc = (o: Partial<Osc> = {}): Osc => ({
  wave: "sawtooth",
  level: 1,
  octave: 0,
  detune: 0,
  width: 0.5,
  unison: 1,
  spread: 20,
  ...o,
});

export const INIT_PATCH: SynthPatch = {
  mono: false,
  glide: 0,
  osc1: osc(),
  osc2: osc({ level: 0 }),
  sub: 0,
  noise: 0,
  fm: { ratio: 2, index: 0, decay: 0.5 },
  filter: {
    type: "lowpass",
    cutoff: 8000,
    reso: 0.7,
    slope: 12,
    keytrack: 0.3,
    env: 0,
  },
  drive: 0,
  amp: { attack: 0.005, decay: 0.3, sustain: 0.8, release: 0.3 },
  filterEnv: { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.3 },
  lfo: { shape: "sine", rate: 5, sync: null, target: "pitch", depth: 0 },
  velocity: 0.6,
  volume: -12,
};

/** Deep partial, for writing patches compactly. */
export type PatchSpec = {
  [K in keyof SynthPatch]?: SynthPatch[K] extends object ? Partial<SynthPatch[K]> : SynthPatch[K];
};

/** A full patch from a partial one (older saves, compact factory definitions). */
export function makePatch(spec: PatchSpec = {}): SynthPatch {
  const p = structuredClone(INIT_PATCH);
  for (const [k, v] of Object.entries(spec) as [keyof SynthPatch, unknown][]) {
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(p[k] as object, v as object);
    else if (v !== undefined) (p as unknown as Record<string, unknown>)[k] = v;
  }
  return p;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep every value in its range (guards the engine against hand-edited or old data). */
export function sanitizePatch(p: SynthPatch): SynthPatch {
  const o = (x: Osc): Osc => ({
    ...x,
    level: clamp(x.level, 0, 1),
    octave: Math.round(clamp(x.octave, -3, 3)),
    detune: clamp(x.detune, -100, 100),
    width: clamp(x.width, 0.05, 0.95),
    unison: Math.round(clamp(x.unison, 1, 7)),
    spread: clamp(x.spread, 0, 100),
  });
  const env = (e: Adsr): Adsr => ({
    attack: clamp(e.attack, 0.001, 10),
    decay: clamp(e.decay, 0.001, 10),
    sustain: clamp(e.sustain, 0, 1),
    release: clamp(e.release, 0.001, 15),
  });
  return {
    ...p,
    glide: clamp(p.glide, 0, 2),
    osc1: o(p.osc1),
    osc2: o(p.osc2),
    sub: clamp(p.sub, 0, 1),
    noise: clamp(p.noise, 0, 1),
    fm: {
      ratio: clamp(p.fm.ratio, 0.25, 16),
      index: clamp(p.fm.index, 0, 40),
      decay: clamp(p.fm.decay, 0.01, 10),
    },
    filter: {
      ...p.filter,
      cutoff: clamp(p.filter.cutoff, 20, 20000),
      reso: clamp(p.filter.reso, 0.1, 20),
      keytrack: clamp(p.filter.keytrack, 0, 1),
      env: clamp(p.filter.env, -6, 6),
    },
    drive: clamp(p.drive, 0, 1),
    amp: env(p.amp),
    filterEnv: env(p.filterEnv),
    lfo: { ...p.lfo, rate: clamp(p.lfo.rate, 0.01, 40), depth: clamp(p.lfo.depth, 0, 1) },
    velocity: clamp(p.velocity, 0, 1),
    volume: clamp(p.volume, -40, 6),
  };
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
  const p = structuredClone(patch);
  const ms = (lo: number, hi: number, v: number) => (lo * Math.pow(hi / lo, v)) / 1000;
  if (moved(params, "sound.attack")) p.amp.attack = ms(1, 4000, params["sound.attack"]);
  if (moved(params, "sound.decay")) p.amp.decay = ms(1, 4000, params["sound.decay"]);
  if (moved(params, "sound.sustain")) p.amp.sustain = params["sound.sustain"];
  if (moved(params, "sound.release")) p.amp.release = ms(1, 8000, params["sound.release"]);
  if (moved(params, "sound.glide")) p.glide = ms(1, 1000, params["sound.glide"]);
  if (moved(params, "sound.detune")) {
    const cents = (params["sound.detune"] - 0.5) * 2 * 100;
    p.osc1.detune += cents;
    p.osc2.detune += cents;
  }
  return p;
}
