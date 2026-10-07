/**
 * Hint-id scheme for param.* and fx.* (explain-mode hover cards):
 *
 *   param.<group>.<id>   — group is the param key prefix used in track.params
 *                          e.g. track.params["sound.tune"] → hint "param.sound.tune"
 *                               track.params["mix.sendA"]  → hint "param.mix.sendA"
 *                               step params (from stepParams()) → "param.step.<id>"
 *   fx.<EffectType>      — the effect itself (shown on the header row in EffectEditor)
 *   fx.<EffectType>.<id> — a parameter of that effect
 *
 * When passing a hint to an Encoder in the sound/mix encoder banks:
 *   hint={`param.${prefix}.${def.id}`}
 * When passing a hint in an FX encoder bank:
 *   hint={`fx.${fx.name}.${def.id}`}
 * When passing a hint in the step encoder bank:
 *   hint={`param.step.${def.id}`}
 */
import type { Step, TrackKind } from "./types";
import { notesLabel } from "./notes";

/** An encoder parameter. Values are stored normalized (0..1). */
export interface ParamDef {
  id: string;
  label: string;
  bipolar?: boolean;
  default: number;
  steps?: number; // number of discrete positions, for stepped encoders
  format: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
export const lin = (lo: number, hi: number) => (v: number) => lo + v * (hi - lo);
export const expo = (lo: number, hi: number) => (v: number) => lo * Math.pow(hi / lo, v);

/** Normalized encoder values (0..1) → real units, shared by the UI and the audio engine. */
export const toUnit = {
  semis: (range: number) => (v: number) => (v - 0.5) * 2 * range,
  hz: expo(20, 20000),
  /** Seconds; 1 = the full sample (no envelope cut). */
  drumDecay: (v: number) => (v >= 0.995 ? Infinity : expo(10, 2000)(v) / 1000),
  q: (v: number) => 0.3 + v * v * 18,
  db: (lo: number, hi: number) => lin(lo, hi),
  ms: (lo: number, hi: number) => (v: number) => expo(lo, hi)(v),
  pan: (v: number) => (v - 0.5) * 2,
  choke: (v: number) => Math.round(v * 8),
};

const hz = (v: number) => {
  const f = expo(20, 20000)(v);
  return f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${Math.round(f)}`;
};
const ms = (lo: number, hi: number) => (v: number) => {
  const t = expo(lo, hi)(v);
  return t >= 1000 ? `${(t / 1000).toFixed(2)}s` : `${Math.round(t)}ms`;
};
const db = (lo: number, hi: number) => (v: number) => {
  const d = lin(lo, hi)(v);
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}`;
};
const semis = (range: number) => (v: number) => {
  const s = (v - 0.5) * 2 * range;
  return `${s > 0 ? "+" : ""}${s.toFixed(1)}`;
};
const pan = (v: number) => {
  const p = Math.round((v - 0.5) * 200);
  return p === 0 ? "C" : p < 0 ? `L${-p}` : `R${p}`;
};

export const VOLUME_FORMAT = (v: number) => {
  if (v <= 0.001) return "-∞";
  const dB = 40 * Math.log10(v / 0.8); // 0.8 fader position = 0 dB
  return `${dB > 0 ? "+" : ""}${dB.toFixed(1)}`;
};

const SOUND_DRUM: ParamDef[] = [
  { id: "tune", label: "Tune", bipolar: true, default: 0.5, format: semis(24) },
  {
    id: "decay",
    label: "Decay",
    default: 1,
    format: (v) => (v >= 0.995 ? "Full" : ms(10, 2000)(v)),
  },
  { id: "start", label: "Start", default: 0, format: pct },
  { id: "cutoff", label: "Cutoff", default: 1, format: hz },
  { id: "reso", label: "Reso", default: 0.1, format: pct },
  { id: "drive", label: "Drive", default: 0, format: pct },
  {
    id: "choke",
    label: "Choke",
    default: 0,
    steps: 9,
    format: (v) => (Math.round(v * 8) === 0 ? "—" : `${Math.round(v * 8)}`),
  },
  { id: "gain", label: "Gain", bipolar: true, default: 0.5, format: db(-12, 12) },
];

const SOUND_INSTRUMENT: ParamDef[] = [
  { id: "attack", label: "Attack", default: 0.05, format: ms(1, 4000) },
  { id: "decay", label: "Decay", default: 0.4, format: ms(1, 4000) },
  { id: "sustain", label: "Sustain", default: 0.7, format: pct },
  { id: "release", label: "Release", default: 0.35, format: ms(1, 8000) },
  { id: "cutoff", label: "Cutoff", default: 0.7, format: hz },
  { id: "reso", label: "Reso", default: 0.2, format: pct },
  { id: "glide", label: "Glide", default: 0, format: ms(1, 1000) },
  { id: "detune", label: "Detune", bipolar: true, default: 0.5, format: semis(1) },
];

const SOUND_AUDIO: ParamDef[] = [
  { id: "gain", label: "Gain", bipolar: true, default: 0.5, format: db(-12, 12) },
  { id: "start", label: "Start", default: 0, format: pct },
  { id: "pitch", label: "Pitch", bipolar: true, default: 0.5, format: semis(12) },
  {
    id: "warp",
    label: "Warp",
    default: 1,
    steps: 2,
    format: (v) => (v >= 0.5 ? "On" : "Off"),
  },
  { id: "cutoff", label: "Cutoff", default: 1, format: hz },
  { id: "reso", label: "Reso", default: 0.1, format: pct },
  { id: "fadein", label: "Fade in", default: 0, format: ms(1, 2000) },
  { id: "fadeout", label: "Fade out", default: 0, format: ms(1, 2000) },
];

export const SOUND_PARAMS: Record<TrackKind, ParamDef[]> = {
  drum: SOUND_DRUM,
  instrument: SOUND_INSTRUMENT,
  audio: SOUND_AUDIO,
};

export const MIX_PARAMS: ParamDef[] = [
  { id: "volume", label: "Level", default: 0.8, format: VOLUME_FORMAT },
  { id: "pan", label: "Pan", bipolar: true, default: 0.5, format: pan },
  { id: "sendA", label: "Reverb", default: 0, format: pct },
  { id: "sendB", label: "Delay", default: 0, format: pct },
  { id: "width", label: "Width", default: 1, format: pct },
  { id: "low", label: "Low", bipolar: true, default: 0.5, format: db(-15, 15) },
  { id: "mid", label: "Mid", bipolar: true, default: 0.5, format: db(-15, 15) },
  { id: "high", label: "High", bipolar: true, default: 0.5, format: db(-15, 15) },
];

const rate = (lo: number, hi: number) => (v: number) => `${expo(lo, hi)(v).toFixed(2)}Hz`;
const MIX = (d: number): ParamDef => ({ id: "mix", label: "Mix", default: d, format: pct });

export const DELAY_TIMES = ["1/32", "1/16", "1/8T", "1/8", "1/8.", "1/4", "1/4.", "1/2"];

/** Insert/bus/master effects. Values are normalized; the engine maps them (effects.ts). */
export const EFFECT_PARAMS: Record<string, ParamDef[]> = {
  EQ3: [
    { id: "low", label: "Low", bipolar: true, default: 0.5, format: db(-15, 15) },
    { id: "mid", label: "Mid", bipolar: true, default: 0.5, format: db(-15, 15) },
    { id: "high", label: "High", bipolar: true, default: 0.5, format: db(-15, 15) },
    { id: "lowFreq", label: "Lo freq", default: 0.33, format: hz },
    { id: "highFreq", label: "Hi freq", default: 0.75, format: hz },
  ],
  Filter: [
    {
      id: "type",
      label: "Type",
      default: 0,
      steps: 3,
      format: (v) => ["LP", "HP", "BP"][Math.round(v * 2)],
    },
    { id: "cutoff", label: "Cutoff", default: 0.6, format: hz },
    { id: "reso", label: "Reso", default: 0.3, format: pct },
    { id: "rate", label: "LFO rate", default: 0.3, format: rate(0.05, 20) },
    { id: "depth", label: "LFO amt", default: 0, format: pct },
    MIX(1),
  ],
  Compressor: [
    { id: "threshold", label: "Thresh", default: 0.6, format: db(-60, 0) },
    { id: "ratio", label: "Ratio", default: 0.15, format: (v) => `${lin(1, 20)(v).toFixed(1)}:1` },
    { id: "attack", label: "Attack", default: 0.4, format: ms(0.1, 200) },
    { id: "release", label: "Release", default: 0.4, format: ms(10, 2000) },
    { id: "makeup", label: "Makeup", default: 0.1, format: db(0, 24) },
    MIX(1),
  ],
  Distortion: [
    { id: "drive", label: "Drive", default: 0.4, format: pct },
    { id: "tone", label: "Tone", default: 0.8, format: hz },
    { id: "output", label: "Output", bipolar: true, default: 0.5, format: db(-12, 12) },
    MIX(1),
  ],
  Bitcrusher: [
    {
      id: "bits",
      label: "Bits",
      default: 0.43,
      steps: 15,
      format: (v) => `${Math.round(lin(2, 16)(v))}`,
    },
    { id: "tone", label: "Tone", default: 1, format: hz },
    MIX(1),
  ],
  Delay: [
    {
      id: "time",
      label: "Time",
      default: 4 / 7,
      steps: DELAY_TIMES.length,
      format: (v) => DELAY_TIMES[Math.round(v * (DELAY_TIMES.length - 1))],
    },
    { id: "feedback", label: "Feedbk", default: 0.35, format: pct },
    { id: "tone", label: "Tone", default: 0.7, format: hz },
    {
      id: "spread",
      label: "Ping-pong",
      default: 0,
      steps: 2,
      format: (v) => (v >= 0.5 ? "On" : "Off"),
    },
    MIX(0.25),
  ],
  Reverb: [
    { id: "size", label: "Size", default: 0.5, format: pct },
    { id: "decay", label: "Decay", default: 0.4, format: ms(100, 10000) },
    { id: "predelay", label: "Pre-dly", default: 0.1, format: ms(1, 250) },
    { id: "damp", label: "Damp", default: 0.5, format: pct },
    MIX(0.3),
  ],
  Chorus: [
    { id: "rate", label: "Rate", default: 0.35, format: rate(0.1, 8) },
    { id: "depth", label: "Depth", default: 0.6, format: pct },
    { id: "delay", label: "Delay", default: 0.4, format: ms(2, 20) },
    MIX(0.5),
  ],
  Phaser: [
    { id: "rate", label: "Rate", default: 0.3, format: rate(0.05, 8) },
    { id: "octaves", label: "Octaves", default: 0.5, format: (v) => lin(0.5, 6)(v).toFixed(1) },
    { id: "base", label: "Base", default: 0.4, format: hz },
    { id: "q", label: "Q", default: 0.3, format: pct },
    MIX(0.5),
  ],
  Tremolo: [
    { id: "rate", label: "Rate", default: 0.5, format: rate(0.5, 20) },
    { id: "depth", label: "Depth", default: 0.6, format: pct },
    { id: "spread", label: "Spread", default: 0, format: pct },
    MIX(1),
  ],
  AutoPan: [
    { id: "rate", label: "Rate", default: 0.4, format: rate(0.05, 10) },
    { id: "depth", label: "Depth", default: 0.8, format: pct },
    MIX(1),
  ],
  Limiter: [{ id: "ceiling", label: "Ceiling", default: 0.95, format: db(-24, 0) }],
};

export const EFFECT_TYPES = Object.keys(EFFECT_PARAMS);

export const CONDITIONS = ["—", "1:2", "2:2", "1:3", "1:4", "FILL", "!FILL"];

/** STEP bank: encoder ↔ step field mapping. */
export interface StepParamDef extends ParamDef {
  get: (s: Step) => number;
  set: (s: Step, v: number) => void;
}

export function stepParams(kind: TrackKind, flats: boolean): StepParamDef[] {
  return [
    {
      id: "velocity",
      label: "Velocity",
      default: 0.8,
      format: (v) => `${Math.round(v * 127)}`,
      get: (s) => s.velocity,
      set: (s, v) => {
        s.velocity = v;
        for (const n of s.notes ?? []) n.velocity = v;
      },
    },
    {
      id: "probability",
      label: "Prob",
      default: 1,
      format: pct,
      get: (s) => s.probability,
      set: (s, v) => (s.probability = v),
    },
    {
      id: "nudge",
      label: "Nudge",
      bipolar: true,
      default: 0.5,
      format: (v) => {
        const n = Math.round((v - 0.5) * 100);
        return `${n > 0 ? "+" : ""}${n}%`;
      },
      get: (s) => s.nudge + 0.5,
      set: (s, v) => (s.nudge = v - 0.5),
    },
    {
      id: "ratchet",
      label: "Ratchet",
      default: 0,
      steps: 8,
      format: (v) => `${Math.round(v * 7) + 1}×`,
      get: (s) => (s.ratchet - 1) / 7,
      set: (s, v) => (s.ratchet = Math.round(v * 7) + 1),
    },
    kind === "instrument"
      ? {
          id: "note",
          label: "Note",
          default: 0.5,
          steps: 61,
          format: (v) => notesLabel([Math.round(24 + v * 60)], flats),
          get: (s) => ((s.notes?.[0]?.pitch ?? 48) - 24) / 60,
          set: (s, v) => {
            const root = Math.round(24 + v * 60);
            const old = s.notes?.length
              ? s.notes
              : [{ pitch: root, length: 1, velocity: s.velocity }];
            const shift = root - old[0].pitch;
            s.notes = old.map((n) => ({ ...n, pitch: n.pitch + shift }));
          },
        }
      : {
          id: "pitch",
          label: "Pitch",
          bipolar: true,
          default: 0.5,
          steps: 25,
          format: semis(12),
          get: (s) => (s.pitch + 12) / 24,
          set: (s, v) => (s.pitch = Math.round(v * 24) - 12),
        },
    kind === "instrument"
      ? {
          id: "length",
          label: "Length",
          default: 0,
          steps: 16,
          format: (v) => `${Math.round(v * 15) + 1} st`,
          get: (s) => ((s.notes?.[0]?.length ?? 1) - 1) / 15,
          set: (s, v) => {
            for (const n of s.notes ?? []) n.length = Math.round(v * 15) + 1;
          },
        }
      : {
          id: "gate",
          label: "Gate",
          default: 1,
          format: pct,
          get: (s) => s.gate,
          set: (s, v) => (s.gate = v),
        },
    {
      id: "condition",
      label: "Cond",
      default: 0,
      steps: CONDITIONS.length,
      format: (v) => CONDITIONS[Math.round(v * (CONDITIONS.length - 1))],
      get: (s) => CONDITIONS.indexOf(s.condition ?? "—") / (CONDITIONS.length - 1),
      set: (s, v) => {
        const c = CONDITIONS[Math.round(v * (CONDITIONS.length - 1))];
        s.condition = c === "—" ? undefined : c;
      },
    },
    {
      id: "accent",
      label: "Accent",
      default: 0,
      steps: 2,
      format: (v) => (v >= 0.5 ? "On" : "Off"),
      get: (s) => (s.accent ? 1 : 0),
      set: (s, v) => (s.accent = v >= 0.5),
    },
  ];
}

export function defaultParams(defs: ParamDef[]): Record<string, number> {
  return Object.fromEntries(defs.map((d) => [d.id, d.default]));
}
