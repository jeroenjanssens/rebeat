/**
 * Finding beatbox hits (D105): spectral flux on a log-magnitude spectrogram with an adaptive
 * threshold, each peak moved back to where its attack starts. Works on 16 kHz mono.
 */
import { fft } from "../fft";
import { MODEL_RATE } from "./resample";

export interface Onset {
  /** Seconds from the start of the audio, where the attack starts. */
  time: number;
  /** Peak level in dBFS over the first 120 ms (for velocity). */
  peakDb: number;
}

const N = 512;
const HOP = 80; // 5 ms

/** Onset strength per hop of 5 ms. */
export function flux(x: Float32Array): Float32Array {
  const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
  const out = new Float32Array(frames);
  const win = Float32Array.from(
    { length: N },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N),
  );
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let prev = new Float32Array(N / 2);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) {
      re[i] = x[f * HOP + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(N / 2);
    let s = 0;
    // from ~60 Hz up: below that is rumble and handling noise
    for (let k = 2; k < N / 2; k++) {
      mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      s += Math.max(0, mag[k] - prev[k]);
    }
    out[f] = f ? s : 0;
    prev = mag;
  }
  return out;
}

export interface OnsetOptions {
  /** 0..1: higher finds quieter hits. */
  sensitivity?: number;
  /** Seconds between two hits at least. */
  minGap?: number;
}

export function detectOnsets(x: Float32Array, opts: OnsetOptions = {}): Onset[] {
  const sensitivity = opts.sensitivity ?? 0.5;
  const minGap = opts.minGap ?? 0.04;
  const sr = MODEL_RATE;
  const env = flux(x);
  if (!env.length) return [];
  let max = 0;
  for (const v of env) max = Math.max(max, v);
  if (max <= 0) return [];
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  // quieter than this (relative to the take's loudest moment) is never a hit
  const floor = peak * 10 ** ((-34 - 20 * sensitivity) / 20);
  const delta = max * (0.12 - 0.1 * sensitivity);
  const W = 10; // ±50 ms for the local mean
  const out: Onset[] = [];
  let last = -Infinity;
  for (let f = 1; f < env.length - 1; f++) {
    const v = env[f];
    if (v < env[f - 1] || v < env[f + 1]) continue;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, f - W); j <= Math.min(env.length - 1, f + W); j++) {
      sum += env[j];
      n++;
    }
    if (v < (sum / n) * 1.4 + delta) continue;
    // a larger peak within 30 ms after this one wins
    let bigger = false;
    for (let j = f + 1; j <= Math.min(env.length - 1, f + 6); j++) if (env[j] > v) bigger = true;
    if (bigger) continue;
    const t = attackStart(x, (f * HOP + N / 2) / sr);
    const level = peakAfter(x, t);
    if (level < floor) continue;
    if (t - last < minGap) continue;
    last = t;
    out.push({ time: t, peakDb: 20 * Math.log10(level + 1e-9) });
  }
  return out;
}

/** Back from a flux peak to where the attack starts: the quiet point before the rise. */
function attackStart(x: Float32Array, t: number): number {
  const sr = MODEL_RATE;
  const centre = Math.round(t * sr);
  const lo = Math.max(0, centre - Math.round(0.04 * sr));
  const hi = Math.min(x.length, centre + Math.round(0.02 * sr));
  // 1 ms envelope
  const step = 16;
  let top = 0;
  let topAt = lo;
  const env: number[] = [];
  for (let i = lo; i < hi; i += step) {
    let m = 0;
    for (let j = i; j < Math.min(hi, i + step); j++) m = Math.max(m, Math.abs(x[j]));
    env.push(m);
    if (m > top) {
      top = m;
      topAt = env.length - 1;
    }
  }
  let k = topAt;
  while (k > 0 && env[k - 1] > top * 0.1 && env[k - 1] <= env[k] * 1.05) k--;
  return (lo + k * step) / sr;
}

function peakAfter(x: Float32Array, t: number, span = 0.12): number {
  const a = Math.max(0, Math.round(t * MODEL_RATE));
  const b = Math.min(x.length, a + Math.round(span * MODEL_RATE));
  let m = 0;
  for (let i = a; i < b; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}

/** Where a hit ends: the next hit, or once it has decayed 40 dB below its peak (at most 1 s). */
export function hitEnd(x: Float32Array, start: number, next?: number): number {
  const sr = MODEL_RATE;
  const a = Math.round(start * sr);
  const limit = Math.min(x.length, a + sr, next !== undefined ? Math.round(next * sr) : Infinity);
  const top = peakAfter(x, start, 0.05);
  const quiet = top * 0.01;
  const block = 160; // 10 ms
  let end = limit;
  for (let i = a + Math.round(0.03 * sr); i < limit; i += block) {
    let m = 0;
    for (let j = i; j < Math.min(limit, i + block); j++) m = Math.max(m, Math.abs(x[j]));
    if (m < quiet) {
      end = i;
      break;
    }
  }
  return Math.max(start + 0.02, end / sr);
}

/**
 * The window the model classifies: 20 ms before the onset to 180 ms after, zero-padded, and
 * silenced from the next hit on with a 5 ms fade, exactly as in training
 * (`ml/rebeat_ml/windows.py: gate`).
 */
export function hitWindow(
  x: Float32Array,
  start: number,
  next?: number,
  pre = 320,
  size = 3200,
): Float32Array {
  const out = new Float32Array(size);
  const a = Math.round(start * MODEL_RATE) - pre;
  for (let i = 0; i < size; i++) {
    const j = a + i;
    if (j >= 0 && j < x.length) out[i] = x[j];
  }
  if (next !== undefined) {
    const at = Math.round(next * MODEL_RATE) - a;
    if (at < size) {
      const from = Math.max(0, at - GATE_FADE);
      for (let i = from; i < at; i++) if (i >= 0) out[i] *= 1 - (i - from) / (at - from);
      out.fill(0, Math.max(0, at));
    }
  }
  return out;
}

const GATE_FADE = 80;

/** A hit's peak level in dBFS over its first 120 ms. */
export const peakDb = (x: Float32Array, start: number) =>
  20 * Math.log10(peakAfter(x, start) + 1e-9);
