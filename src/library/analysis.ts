/** Audio analysis: tempo of loops, onsets for slicing, and a sound category guess from the name. */
import type { SoundCategory } from "../model/types";
import { stft } from "./fft";

export interface MonoSignal {
  data: Float32Array;
  sampleRate: number;
}

export function toMono(buffer: AudioBuffer): MonoSignal {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return { data: out, sampleRate: buffer.sampleRate };
}

/** Onset strength per hop: the rise in log energy. */
export function onsetEnvelope(
  { data, sampleRate }: MonoSignal,
  hop = Math.round(sampleRate / 100),
) {
  const frames = Math.floor(data.length / hop);
  const env = new Float32Array(frames);
  let prev = -9; // log energy of silence, so a hit at the very start counts
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += data[i] * data[i];
    const le = Math.log10(1e-9 + e / hop);
    env[f] = Math.max(0, le - prev);
    prev = le;
  }
  return { env, rate: sampleRate / hop };
}

function autocorr(env: Float32Array, lag: number) {
  let s = 0;
  for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
  return s / (env.length - lag);
}

/**
 * Tempo of a loop. Loops are usually a whole number of bars, so tempi where the length is
 * 4/8/16/32 beats are preferred; otherwise the strongest periodicity between 70 and 180 BPM.
 */
export function detectBpm(signal: MonoSignal): number | undefined {
  const duration = signal.data.length / signal.sampleRate;
  if (duration < 1.2) return undefined;
  const { env, rate } = onsetEnvelope(signal);
  const score = (bpm: number) => {
    const lag = (60 / bpm) * rate;
    const l0 = Math.floor(lag);
    const frac = lag - l0;
    // the beat lag, plus two beats for robustness
    const at = (l: number) => autocorr(env, Math.max(1, Math.round(l)));
    const s = (1 - frac) * at(l0) + frac * at(l0 + 1) + 0.5 * at(lag * 2);
    // octave errors: prefer the common 85–170 BPM range
    return bpm < 85 || bpm > 170 ? s * 0.8 : s;
  };
  let best: { bpm: number; s: number } | undefined;
  for (const beats of [4, 8, 16, 32]) {
    const bpm = (beats * 60) / duration;
    if (bpm < 70 || bpm > 180) continue;
    const s = score(bpm) * 1.15;
    if (!best || s > best.s) best = { bpm, s };
  }
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const s = score(bpm);
    if (!best || s > best.s * 1.25) best = { bpm, s };
  }
  if (!best || best.s <= 0) return undefined;
  return Math.round(best.bpm * 10) / 10;
}

/** Onset positions (in seconds), for slicing by transients. */
export function detectOnsets(signal: MonoSignal, sensitivity = 0.5, minGap = 0.05): number[] {
  const { env, rate } = onsetEnvelope(signal, Math.round(signal.sampleRate / 200));
  const sorted = [...env].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * (0.97 - sensitivity * 0.2))] || 0.1;
  const out: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < env.length; i++) {
    const t = i / rate;
    const peak = env[i] >= (env[i - 1] ?? 0) && env[i] >= (env[i + 1] ?? 0);
    if (env[i] > threshold && peak && t - last > minGap) {
      out.push(Math.max(0, t - 0.005));
      last = t;
    }
  }
  return out;
}

export function guessCategory(name: string): SoundCategory {
  const n = name.toLowerCase();
  if (/kick|\bbd\b|bassdrum|bd\d|_bd/.test(n)) return "kick";
  if (/snare|\bsd\b|_sd/.test(n)) return "snare";
  if (/clap|\bcp\b|_cp/.test(n)) return "clap";
  if (/hat|\bhh\b|\boh\b|_hh|_oh|cymbal|crash|ride|\bcr\b|\brd\b/.test(n)) return "hat";
  if (/tom|\b[hml]t\b/.test(n)) return "tom";
  if (/bass|808|sub/.test(n)) return "bass";
  if (/vox|vocal|voice|sing/.test(n)) return "vocal";
  if (/piano|keys|chord|pad|synth|organ|rhodes/.test(n)) return "keys";
  if (/fx|riser|sweep|impact|noise/.test(n)) return "fx";
  return "perc";
}

// ---------- key ----------

// Krumhansl–Kessler key profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a: number[], b: number[]) {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

/** Pitch-class energy profile (chroma) from a few seconds of audio. */
export function chroma({ data, sampleRate }: MonoSignal): number[] {
  const size = 4096;
  const frames = stft(data.subarray(0, Math.min(data.length, sampleRate * 30)), size, size);
  const c = new Array(12).fill(0);
  for (const mag of frames)
    for (let k = 1; k < mag.length; k++) {
      const f = (k * sampleRate) / size;
      if (f < 55 || f > 2000) continue;
      const midi = 69 + 12 * Math.log2(f / 440);
      c[((Math.round(midi) % 12) + 12) % 12] += mag[k] * mag[k];
    }
  return c;
}

/** Best matching key, e.g. { root: 9, scale: "minor" } for A minor. */
export function detectKey(
  signal: MonoSignal,
): { root: number; scale: "major" | "minor"; confidence: number } | undefined {
  const c = chroma(signal);
  if (c.every((x) => x === 0)) return undefined;
  let best = { root: 0, scale: "major" as "major" | "minor", confidence: -2 };
  for (let r = 0; r < 12; r++) {
    const rot = c.map((_, i) => c[(i + r) % 12]);
    for (const [scale, prof] of [
      ["major", MAJOR],
      ["minor", MINOR],
    ] as const) {
      const k = correlate(rot, prof);
      if (k > best.confidence) best = { root: r, scale, confidence: k };
    }
  }
  return best;
}

// ---------- loudness ----------

/** Biquad coefficients of the BS.1770 K-weighting filters for a sample rate. */
function kWeighting(sr: number) {
  // high shelf (+4 dB above ~1.5 kHz)
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / sr);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  const shelf = {
    b: [
      (Vh + (Vb * K) / Q + K * K) / a0,
      (2 * (K * K - Vh)) / a0,
      (Vh - (Vb * K) / Q + K * K) / a0,
    ],
    a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  // high pass (~38 Hz)
  const f1 = 38.13547087602444;
  const Q1 = 0.5003270373238773;
  const K1 = Math.tan((Math.PI * f1) / sr);
  const a1 = 1 + K1 / Q1 + K1 * K1;
  const hp = { b: [1, -2, 1], a: [(2 * (K1 * K1 - 1)) / a1, (1 - K1 / Q1 + K1 * K1) / a1] };
  return [shelf, hp];
}

function biquad(x: Float32Array, f: { b: number[]; a: number[] }) {
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = f.b[0] * x[i] + f.b[1] * x1 + f.b[2] * x2 - f.a[0] * y1 - f.a[1] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

export interface Loudness {
  peakDb: number;
  rmsDb: number;
  /** Integrated loudness (BS.1770 with gating), in LUFS. */
  lufs: number;
}

export function loudness(channels: Float32Array[], sampleRate: number): Loudness {
  let peak = 0;
  let sq = 0;
  let n = 0;
  for (const c of channels)
    for (const v of c) {
      peak = Math.max(peak, Math.abs(v));
      sq += v * v;
      n++;
    }
  const [shelf, hp] = kWeighting(sampleRate);
  const weighted = channels.slice(0, 2).map((c) => biquad(biquad(c, shelf), hp));
  // 400 ms blocks with 75% overlap
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  const blocks: number[] = [];
  for (let s = 0; s + block <= weighted[0].length; s += step) {
    let z = 0;
    for (const w of weighted) {
      let e = 0;
      for (let i = s; i < s + block; i++) e += w[i] * w[i];
      z += e / block;
    }
    blocks.push(z);
  }
  const lk = (z: number) => -0.691 + 10 * Math.log10(z || 1e-12);
  const abs = blocks.filter((z) => lk(z) > -70);
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const rel = lk(mean(abs)) - 10;
  const gated = abs.filter((z) => lk(z) > rel);
  const db = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  return {
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sq / (n || 1))),
    lufs: gated.length ? lk(mean(gated)) : -Infinity,
  };
}
