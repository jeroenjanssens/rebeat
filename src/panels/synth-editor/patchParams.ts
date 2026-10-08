/**
 * The synth editor's knobs (D81, D83), one table: where the value lives in a patch, its range and
 * curve, how it reads, and what it does (also the explain-mode text).
 */
import type { ParamDef } from "../../model/params";
import type { SynthPatch } from "../../model/synth";

export interface PatchParam {
  /** "osc.0.level", "filters.1.cutoff", "voice.glide" */
  path: string;
  label: string;
  min: number;
  max: number;
  /** "exp" for times and frequencies (min > 0), "sq" for times that can be 0. */
  curve?: "exp" | "sq";
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
const panFmt = (v: number) =>
  Math.abs(v) < 0.02 ? "C" : `${v < 0 ? "L" : "R"}${Math.round(Math.abs(v) * 100)}`;
const SHAPES = ["Sine", "Tri", "Saw", "Pulse"];
const shapeName = (v: number) => {
  const a = Math.floor(v);
  const f = v - a;
  return f < 0.05 || a >= 3 ? SHAPES[Math.min(3, Math.round(v))] : `${SHAPES[a]}→${SHAPES[a + 1]}`;
};

const osc = (i: number): PatchParam[] => {
  const p = `osc.${i}`;
  return [
    {
      path: `${p}.shape`,
      label: "Shape",
      min: 0,
      max: 3,
      format: shapeName,
      help: "The waveform, morphing smoothly: sine (pure) → triangle (soft) → saw (bright, buzzy) → pulse (hollow; set its width).",
    },
    {
      path: `${p}.pw`,
      label: "Width",
      min: 0.05,
      max: 0.95,
      format: pct,
      help: "Pulse width, for the pulse shape: 50% is a square; narrower sounds thinner and nasal. Modulate it for the moving “PWM” sound.",
    },
    {
      path: `${p}.level`,
      label: "Level",
      min: 0,
      max: 1,
      format: pct,
      help: "How loud this oscillator is in the mix.",
    },
    {
      path: `${p}.pan`,
      label: "Pan",
      min: -1,
      max: 1,
      bipolar: true,
      format: panFmt,
      help: "Where this oscillator sits in stereo.",
    },
    {
      path: `${p}.octave`,
      label: "Octave",
      min: -3,
      max: 3,
      int: true,
      bipolar: true,
      format: signed(""),
      help: "Play this oscillator octaves higher or lower.",
    },
    {
      path: `${p}.semi`,
      label: "Semi",
      min: -12,
      max: 12,
      int: true,
      bipolar: true,
      format: signed(""),
      help: "Tune in semitones: +7 adds a fifth, +12 an octave.",
    },
    {
      path: `${p}.fine`,
      label: "Fine",
      min: -100,
      max: 100,
      bipolar: true,
      format: signed("c"),
      help: "Fine tuning in cents. A few cents against another oscillator makes the sound thicker.",
    },
    {
      path: `${p}.unison`,
      label: "Unison",
      min: 1,
      max: 8,
      int: true,
      format: (v) => `${v}`,
      help: "Stacked copies of the oscillator, spread in pitch and stereo: one is clean, seven the huge “supersaw”.",
    },
    {
      path: `${p}.detune`,
      label: "Detune",
      min: 0,
      max: 100,
      format: (v) => `${Math.round(v)}c`,
      help: "How far the unison voices are spread in pitch, in cents.",
    },
    {
      path: `${p}.width`,
      label: "Stereo",
      min: 0,
      max: 1,
      format: pct,
      help: "How far the unison voices are spread across the stereo field.",
    },
    {
      path: `${p}.phase`,
      label: "Phase",
      min: 0,
      max: 1,
      format: (v) => `${Math.round(v * 360)}°`,
      help: "Where the waveform starts on each note, when Retrigger is on. Retriggered oscillators give tight, punchy attacks.",
    },
    {
      path: `${p}.drift`,
      label: "Drift",
      min: 0,
      max: 1,
      format: pct,
      help: "A slow random wander of the pitch, like an analog synth. A little makes it feel alive.",
    },
  ];
};

const filter = (i: number): PatchParam[] => {
  const p = `filters.${i}`;
  return [
    {
      path: `${p}.cutoff`,
      label: "Cutoff",
      min: 20,
      max: 20000,
      curve: "exp",
      format: hz,
      help: "Where the filter starts cutting. Lower is darker (low-pass) or thinner (high-pass).",
    },
    {
      path: `${p}.reso`,
      label: "Reso",
      min: 0,
      max: 1,
      format: pct,
      help: "Resonance: a peak at the cutoff. High values whistle and squelch; the ladder sings on its own near the top (self-oscillation).",
    },
    {
      path: `${p}.drive`,
      label: "Drive",
      min: 0,
      max: 1,
      format: pct,
      help: "Saturation going into the filter: warmth and grit that the filter then shapes.",
    },
    {
      path: `${p}.env`,
      label: "Env",
      min: -6,
      max: 6,
      bipolar: true,
      format: signed(" oct", 1),
      help: "How far the filter envelope moves the cutoff, in octaves. Negative closes it.",
    },
    {
      path: `${p}.keytrack`,
      label: "Key",
      min: 0,
      max: 1,
      format: pct,
      help: "How much the cutoff follows the note: at 100% it moves an octave with each octave you play.",
    },
    {
      path: `${p}.velocity`,
      label: "Vel",
      min: 0,
      max: 4,
      format: (v) => `${v.toFixed(1)} oct`,
      help: "How much harder notes open the filter, in octaves.",
    },
  ];
};

const env = (i: number): PatchParam[] => {
  const p = `envs.${i}`;
  return [
    {
      path: `${p}.attack`,
      label: "Attack",
      min: 0.0005,
      max: 10,
      curve: "exp",
      format: sec,
      help: "How long it takes to rise when a note starts.",
    },
    {
      path: `${p}.hold`,
      label: "Hold",
      min: 0,
      max: 5,
      curve: "sq",
      format: sec,
      help: "How long it stays at the top before decaying.",
    },
    {
      path: `${p}.decay`,
      label: "Decay",
      min: 0.001,
      max: 10,
      curve: "exp",
      format: sec,
      help: "How long it takes to fall to the sustain level.",
    },
    {
      path: `${p}.sustain`,
      label: "Sustain",
      min: 0,
      max: 1,
      format: pct,
      help: "The level while the note is held (0 for plucks).",
    },
    {
      path: `${p}.release`,
      label: "Release",
      min: 0.001,
      max: 15,
      curve: "exp",
      format: sec,
      help: "How long it takes to fall to nothing after the note ends.",
    },
    {
      path: `${p}.attackCurve`,
      label: "A curve",
      min: -1,
      max: 1,
      bipolar: true,
      format: (v) => (Math.abs(v) < 0.05 ? "linear" : v < 0 ? "fast" : "slow"),
      help: "The attack's shape: fast (rises quickly, then eases in), linear, or slow (eases in, then rises).",
    },
    {
      path: `${p}.curve`,
      label: "D/R curve",
      min: -1,
      max: 1,
      bipolar: true,
      format: (v) => (Math.abs(v) < 0.05 ? "linear" : v > 0 ? "natural" : "slow"),
      help: "The decay and release shape: natural (falls fast, then tails off, like real instruments), linear, or slow.",
    },
    {
      path: `${p}.velocity`,
      label: "Vel",
      min: 0,
      max: 1,
      format: pct,
      help: "How much velocity scales this envelope: soft notes reach less of it.",
    },
  ];
};

const lfo = (i: number): PatchParam[] => {
  const p = `lfos.${i}`;
  return [
    {
      path: `${p}.rate`,
      label: "Rate",
      min: 0.01,
      max: 50,
      curve: "exp",
      format: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}Hz`,
      help: "How fast it wobbles, when not synced to the tempo.",
    },
    {
      path: `${p}.phase`,
      label: "Phase",
      min: 0,
      max: 1,
      format: (v) => `${Math.round(v * 360)}°`,
      help: "Where its cycle starts (per-voice LFOs restart at each note).",
    },
    {
      path: `${p}.delay`,
      label: "Delay",
      min: 0,
      max: 5,
      curve: "sq",
      format: sec,
      help: "How long after a note starts it takes to fade in: vibrato that arrives once the note settles.",
    },
  ];
};

export const SECTIONS: { id: string; title: string; params: PatchParam[] }[] = [
  { id: "osc0", title: "Oscillator 1", params: osc(0) },
  { id: "osc1", title: "Oscillator 2", params: osc(1) },
  { id: "osc2", title: "Oscillator 3", params: osc(2) },
  {
    id: "extra",
    title: "Sub · noise · ring · FM",
    params: [
      {
        path: "sub.level",
        label: "Sub",
        min: 0,
        max: 1,
        format: pct,
        help: "A sine or square one or two octaves below oscillator 1, for weight in the low end.",
      },
      {
        path: "noise.level",
        label: "Noise",
        min: 0,
        max: 1,
        format: pct,
        help: "Noise: white (bright hiss) or pink (softer). Breath, air, risers, snares.",
      },
      {
        path: "ring",
        label: "Ring",
        min: 0,
        max: 1,
        format: pct,
        help: "Ring modulation: oscillator 1 × oscillator 2. Metallic, bell-like tones from the sum and difference of their pitches.",
      },
      {
        path: "fm.amount",
        label: "FM",
        min: 0,
        max: 40,
        curve: "sq",
        format: (v) => v.toFixed(1),
        help: "Frequency (phase) modulation: one oscillator bends another's waveform. Electric pianos, bells, metallic basses; the modulator's pitch sets the character.",
      },
    ],
  },
  { id: "filter0", title: "Filter 1", params: filter(0) },
  { id: "filter1", title: "Filter 2", params: filter(1) },
  { id: "env0", title: "Amp envelope", params: env(0) },
  { id: "env1", title: "Filter envelope", params: env(1) },
  { id: "env2", title: "Mod envelope", params: env(2) },
  { id: "lfo0", title: "LFO 1", params: lfo(0) },
  { id: "lfo1", title: "LFO 2", params: lfo(1) },
  { id: "lfo2", title: "LFO 3", params: lfo(2) },
  {
    id: "voice",
    title: "Voice",
    params: [
      {
        path: "voice.voices",
        label: "Voices",
        min: 1,
        max: 16,
        int: true,
        format: (v) => `${v}`,
        help: "How many notes can sound at once. With fewer voices, older notes are cut sooner.",
      },
      {
        path: "voice.glide",
        label: "Glide",
        min: 0,
        max: 5,
        curve: "sq",
        format: sec,
        help: "How long notes slide into each other (portamento).",
      },
      {
        path: "voice.velocityCurve",
        label: "Vel curve",
        min: -1,
        max: 1,
        bipolar: true,
        format: (v) => (Math.abs(v) < 0.05 ? "linear" : v < 0 ? "soft" : "hard"),
        help: "How velocity responds: soft (light playing is already loud) or hard (play hard for full level).",
      },
      {
        path: "voice.bend",
        label: "Bend",
        min: 0,
        max: 24,
        int: true,
        format: (v) => `±${v}`,
        help: "How far the pitch bend wheel bends, in semitones.",
      },
      {
        path: "voice.tune",
        label: "Tune",
        min: -100,
        max: 100,
        bipolar: true,
        format: signed("c"),
        help: "Overall tuning in cents.",
      },
    ],
  },
  {
    id: "output",
    title: "Output",
    params: [
      {
        path: "output.drive",
        label: "Drive",
        min: 0,
        max: 1,
        format: pct,
        help: "Saturation at the output, after the amp: warmth at first, then grit.",
      },
      {
        path: "output.volume",
        label: "Volume",
        min: -40,
        max: 6,
        format: signed(" dB"),
        help: "The patch's level.",
      },
      {
        path: "output.pan",
        label: "Pan",
        min: -1,
        max: 1,
        bipolar: true,
        format: panFmt,
        help: "Where the whole synth sits in stereo.",
      },
      {
        path: "output.spread",
        label: "Spread",
        min: 0,
        max: 1,
        format: pct,
        help: "How far successive notes are spread left and right: chords get wider.",
      },
    ],
  },
];

export const ALL_PARAMS = SECTIONS.flatMap((s) => s.params);

export function getPath(p: SynthPatch, path: string): number {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], p) as number;
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
  if (d.curve === "sq") return Math.sqrt(Math.max(0, (v - d.min) / (d.max - d.min)));
  return (v - d.min) / (d.max - d.min);
}

export function fromKnob(d: PatchParam, k: number): number {
  const v =
    d.curve === "exp"
      ? d.min * Math.pow(d.max / d.min, k)
      : d.curve === "sq"
        ? d.min + k * k * (d.max - d.min)
        : d.min + k * (d.max - d.min);
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
