/**
 * A fake audio engine: no sound, only levels and waveforms so the scopes, meters and
 * pad flashes behave as if audio were playing. Replaced by the Tone.js engine in Phase 1.
 */
import type { SoundCategory, Track } from "../model/types";
import { fakePeaks } from "./peaks";

interface Voice {
  env: number;
  decayPerMs: number;
  holdUntil: number;
  midi: number[];
  pending: { at: number; velocity: number }[];
  clip: { start: number; duration: number; oneshot: boolean } | null;
  scratch: { pos: number; speed: number } | null;
  category: SoundCategory;
  source: string;
  gain: number;
}

const voices = new Map<string, Voice>();

function voice(track: Track): Voice {
  let v = voices.get(track.id);
  if (!v) {
    v = {
      env: 0,
      decayPerMs: 0.99,
      holdUntil: 0,
      midi: [48],
      pending: [],
      clip: null,
      scratch: null,
      category: track.category,
      source: track.source,
      gain: 1,
    };
    voices.set(track.id, v);
  }
  v.category = track.category;
  v.source = track.source;
  v.gain = Math.min(1.25, track.volume / 0.8);
  return v;
}

const DECAY_MS: Partial<Record<SoundCategory, number>> = {
  kick: 260,
  snare: 180,
  clap: 200,
  hat: 70,
  perc: 90,
  tom: 220,
  bass: 300,
  keys: 600,
};

export interface TriggerOptions {
  now: number;
  ratchet?: number;
  stepMs?: number;
  notes?: number[];
  lengthSteps?: number;
}

export function trigger(track: Track, velocity: number, o: TriggerOptions) {
  const v = voice(track);
  const decay = DECAY_MS[track.category] ?? 200;
  const tau = track.name.toLowerCase().includes("op") && track.category === "hat" ? 350 : decay;
  v.decayPerMs = Math.exp(-1 / tau);
  v.env = Math.max(v.env, velocity);
  if (o.notes) v.midi = o.notes;
  v.holdUntil = o.lengthSteps && o.stepMs ? o.now + o.lengthSteps * o.stepMs * 0.9 : 0;
  const r = o.ratchet ?? 1;
  if (r > 1 && o.stepMs) {
    for (let i = 1; i < r; i++)
      v.pending.push({ at: o.now + (o.stepMs / r) * i, velocity: velocity * 0.85 });
  }
}

export function startClip(track: Track, now: number, duration: number, oneshot: boolean) {
  voice(track).clip = { start: now, duration: oneshot ? duration * 0.6 : duration, oneshot };
}

export function stopClip(trackId: string) {
  const v = voices.get(trackId);
  if (v) v.clip = null;
}

export function stopAll() {
  for (const v of voices.values()) {
    v.clip = null;
    v.pending = [];
  }
}

/** Override the clip position while scratching (0..1), or release with `null`. */
export function scratch(track: Track, pos: number | null, speed = 0) {
  voice(track).scratch = pos === null ? null : { pos, speed };
}

/** Clip playhead position (0..1) or null when the clip isn't playing. */
export function clipPosition(trackId: string, now: number): number | null {
  const v = voices.get(trackId);
  if (!v) return null;
  if (v.scratch) return v.scratch.pos;
  if (!v.clip) return null;
  const p = (now - v.clip.start) / v.clip.duration;
  if (p >= 1 && v.clip.oneshot) return null;
  return p % 1;
}

export function update(now: number, dt: number) {
  for (const v of voices.values()) {
    for (let i = v.pending.length - 1; i >= 0; i--) {
      if (now >= v.pending[i].at) {
        v.env = Math.max(v.env, v.pending[i].velocity);
        v.pending.splice(i, 1);
      }
    }
    if (now > v.holdUntil) v.env *= Math.pow(v.decayPerMs, dt);
    else v.env = Math.max(v.env * Math.pow(v.decayPerMs, dt * 0.15), 0.35);
    if (v.env < 0.002) v.env = 0;
  }
}

/** Current output level (0..1) of a track, after its fader. */
export function level(trackId: string, now: number): number {
  const v = voices.get(trackId);
  if (!v) return 0;
  let clipLevel = 0;
  const pos = clipPosition(trackId, now);
  if (pos !== null) {
    const peaks = fakePeaks(v.source, v.category);
    clipLevel = peaks[Math.floor(pos * (peaks.length - 1))] * 0.8;
    if (v.scratch) clipLevel *= Math.min(1, Math.abs(v.scratch.speed) * 0.6);
  }
  return Math.min(1, Math.max(v.env, clipLevel) * v.gain);
}

const TAU = Math.PI * 2;

/** A plausible waveform value (-1..1) at position x (0..1) of the scope window. */
export function waveform(trackId: string, x: number, phase: number): number {
  const v = voices.get(trackId);
  if (!v) return 0;
  const noise = Math.random() * 2 - 1;
  const cyc = (m: number) => (440 * Math.pow(2, (m - 69) / 12)) / 25;
  switch (v.category) {
    case "kick":
      return Math.sin(TAU * (2.2 * x + phase * 0.1));
    case "snare":
    case "clap":
      return 0.45 * Math.sin(TAU * 7 * x) + 0.65 * noise;
    case "hat":
      return 0.9 * noise + 0.15 * Math.sin(TAU * 40 * x);
    case "bass": {
      const t = cyc(v.midi[0]) * x + phase;
      return 2 * (t - Math.floor(t + 0.5));
    }
    case "keys":
      return (
        v.midi.reduce((sum, m) => sum + Math.sin(TAU * (cyc(m) * x + phase)), 0) / v.midi.length
      );
    case "vocal":
      return (
        0.6 * Math.sin(TAU * (6 * x + phase)) + 0.3 * Math.sin(TAU * 13 * x + 1) + 0.12 * noise
      );
    default:
      return 0.6 * Math.sin(TAU * 5 * x) * (1 - x * 0.5) + 0.3 * noise;
  }
}

/** Master output level (0..1). */
export function masterLevel(now: number): number {
  let sum = 0;
  for (const id of voices.keys()) sum += level(id, now) ** 2;
  return Math.min(1, Math.sqrt(sum) * 0.8);
}
