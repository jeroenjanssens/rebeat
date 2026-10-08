/**
 * The synth editor's knobs (D81), one table: where the value lives in a patch, its range and
 * curve, how it reads, and what it does (also the explain-mode text).
 */
import type { ParamDef } from "../../model/params";
import type { SynthPatch } from "../../model/synth";

export interface PatchParam {
  /** "osc1.level", "filter.cutoff", "glide" */
  path: string;
  label: string;
  min: number;
  max: number;
  /** "exp" for times and frequencies. */
  curve?: "exp";
  /** Whole numbers only (octaves, unison voices). */
  int?: boolean;
  bipolar?: boolean;
  format: (v: number) => string;
  help: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`);
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const signed =
  (unit: string, digits = 0) =>
  (v: number) =>
    `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;

const osc = (n: 1 | 2): PatchParam[] => [
  {
    path: `osc${n}.level`,
    label: "Level",
    min: 0,
    max: 1,
    format: pct,
    help: "How loud this oscillator is in the mix.",
  },
  {
    path: `osc${n}.octave`,
    label: "Octave",
    min: -3,
    max: 3,
    int: true,
    bipolar: true,
    format: signed(""),
    help: "Play this oscillator octaves higher or lower.",
  },
  {
    path: `osc${n}.detune`,
    label: "Detune",
    min: -100,
    max: 100,
    bipolar: true,
    format: signed("c"),
    help: "Fine tuning in cents. A few cents against the other oscillator makes the sound thicker.",
  },
  {
    path: `osc${n}.width`,
    label: "Width",
    min: 0.05,
    max: 0.95,
    format: pct,
    help: "Pulse width (for the pulse wave): 50% is a square; narrower sounds thinner and nasal.",
  },
  {
    path: `osc${n}.unison`,
    label: "Unison",
    min: 1,
    max: 7,
    int: true,
    format: (v) => `${v}`,
    help: "Stacked copies of the oscillator, spread in pitch: one gives a clean tone, seven the huge “supersaw”.",
  },
  {
    path: `osc${n}.spread`,
    label: "Spread",
    min: 0,
    max: 100,
    format: (v) => `${Math.round(v)}c`,
    help: "How far the unison voices are detuned from each other, in cents.",
  },
];

export const SECTIONS: { id: string; title: string; params: PatchParam[] }[] = [
  { id: "osc1", title: "Oscillator 1", params: osc(1) },
  { id: "osc2", title: "Oscillator 2", params: osc(2) },
  {
    id: "extra",
    title: "Sub · noise · FM",
    params: [
      {
        path: "sub",
        label: "Sub",
        min: 0,
        max: 1,
        format: pct,
        help: "A sine one octave below oscillator 1, for weight in the low end.",
      },
      {
        path: "noise",
        label: "Noise",
        min: 0,
        max: 1,
        format: pct,
        help: "White noise: breath, air, or the hiss of a riser.",
      },
      {
        path: "fm.index",
        label: "FM",
        min: 0,
        max: 40,
        curve: undefined,
        format: (v) => v.toFixed(1),
        help: "Frequency modulation of oscillator 1: metallic, bell-like and electric-piano tones. 0 = off.",
      },
      {
        path: "fm.ratio",
        label: "Ratio",
        min: 0.25,
        max: 16,
        curve: "exp",
        format: (v) => `${v.toFixed(2)}×`,
        help: "The modulator's pitch relative to the note. Whole numbers sound harmonic; others clangorous.",
      },
      {
        path: "fm.decay",
        label: "FM time",
        min: 0.01,
        max: 10,
        curve: "exp",
        format: sec,
        help: "How fast the FM brightness fades after the note starts.",
      },
    ],
  },
  {
    id: "filter",
    title: "Filter",
    params: [
      {
        path: "filter.cutoff",
        label: "Cutoff",
        min: 20,
        max: 20000,
        curve: "exp",
        format: hz,
        help: "Where the filter starts cutting. Lower is darker.",
      },
      {
        path: "filter.reso",
        label: "Reso",
        min: 0.1,
        max: 20,
        curve: "exp",
        format: (v) => v.toFixed(1),
        help: "Resonance: a peak at the cutoff. High values whistle and squelch (think acid).",
      },
      {
        path: "filter.env",
        label: "Env",
        min: -6,
        max: 6,
        bipolar: true,
        format: signed(" oct", 1),
        help: "How far the filter envelope moves the cutoff, in octaves (negative closes it).",
      },
      {
        path: "filter.keytrack",
        label: "Key",
        min: 0,
        max: 1,
        format: pct,
        help: "How much the cutoff follows the note: higher notes get brighter.",
      },
      {
        path: "drive",
        label: "Drive",
        min: 0,
        max: 1,
        format: pct,
        help: "Saturation after the filter: warmth at first, then grit.",
      },
    ],
  },
  {
    id: "filterEnv",
    title: "Filter envelope",
    params: [
      {
        path: "filterEnv.attack",
        label: "Attack",
        min: 0.001,
        max: 10,
        curve: "exp",
        format: sec,
        help: "How long the filter takes to open when a note starts.",
      },
      {
        path: "filterEnv.decay",
        label: "Decay",
        min: 0.001,
        max: 10,
        curve: "exp",
        format: sec,
        help: "How long it takes to fall back to the sustain level.",
      },
      {
        path: "filterEnv.sustain",
        label: "Sustain",
        min: 0,
        max: 1,
        format: pct,
        help: "How open it stays while the note is held.",
      },
      {
        path: "filterEnv.release",
        label: "Release",
        min: 0.001,
        max: 15,
        curve: "exp",
        format: sec,
        help: "How long it takes to close after the note ends.",
      },
    ],
  },
  {
    id: "amp",
    title: "Amp envelope",
    params: [
      {
        path: "amp.attack",
        label: "Attack",
        min: 0.001,
        max: 10,
        curve: "exp",
        format: sec,
        help: "How long the sound takes to fade in. Long for pads, short for plucks.",
      },
      {
        path: "amp.decay",
        label: "Decay",
        min: 0.001,
        max: 10,
        curve: "exp",
        format: sec,
        help: "How long it takes to fall to the sustain level.",
      },
      {
        path: "amp.sustain",
        label: "Sustain",
        min: 0,
        max: 1,
        format: pct,
        help: "The level while the note is held (0 = a plucked sound).",
      },
      {
        path: "amp.release",
        label: "Release",
        min: 0.001,
        max: 15,
        curve: "exp",
        format: sec,
        help: "How long the sound rings out after the note ends.",
      },
    ],
  },
  {
    id: "lfo",
    title: "LFO",
    params: [
      {
        path: "lfo.rate",
        label: "Rate",
        min: 0.01,
        max: 40,
        curve: "exp",
        format: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}Hz`,
        help: "How fast the LFO wobbles (when it isn't synced to the tempo).",
      },
      {
        path: "lfo.depth",
        label: "Depth",
        min: 0,
        max: 1,
        format: pct,
        help: "How much the LFO moves its target. 0 = off.",
      },
    ],
  },
  {
    id: "voice",
    title: "Voice",
    params: [
      {
        path: "glide",
        label: "Glide",
        min: 0,
        max: 2,
        format: sec,
        help: "Mono: how long notes slide into each other.",
      },
      {
        path: "velocity",
        label: "Vel",
        min: 0,
        max: 1,
        format: pct,
        help: "How much harder hits sound louder.",
      },
      {
        path: "volume",
        label: "Volume",
        min: -40,
        max: 6,
        format: signed(" dB"),
        help: "The patch's level.",
      },
    ],
  },
];

export const ALL_PARAMS = SECTIONS.flatMap((s) => s.params);

export function getPath(p: SynthPatch, path: string): number {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], p) as number;
}

export function setPath(p: SynthPatch, path: string, v: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;
  const obj = keys.reduce<Record<string, unknown>>(
    (o, k) => o[k] as Record<string, unknown>,
    p as unknown as Record<string, unknown>,
  );
  obj[last] = v;
}

/** A value ↔ the knob's 0..1. */
export function toKnob(d: PatchParam, v: number): number {
  if (d.curve === "exp") return Math.log(v / d.min) / Math.log(d.max / d.min);
  return (v - d.min) / (d.max - d.min);
}

export function fromKnob(d: PatchParam, k: number): number {
  const v = d.curve === "exp" ? d.min * Math.pow(d.max / d.min, k) : d.min + k * (d.max - d.min);
  return d.int ? Math.round(v) : v;
}

/** The knob's definition for the Encoder component. */
export function knobDef(d: PatchParam, defaultValue: number): ParamDef {
  return {
    id: d.path,
    label: d.label,
    bipolar: d.bipolar,
    default: toKnob(d, defaultValue),
    steps: d.int ? d.max - d.min + 1 : undefined,
    format: (k) => d.format(fromKnob(d, k)),
  };
}
