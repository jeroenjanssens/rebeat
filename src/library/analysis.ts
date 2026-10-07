/** Audio analysis: tempo of loops, onsets for slicing, and a sound category guess from the name. */
import type { SoundCategory } from "../model/types";

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
