import type { SoundCategory } from "../model/types";

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, Float32Array>();

/** Fake but plausible waveform peaks (0..1) for a sample, deterministic per name. */
export function fakePeaks(name: string, category: SoundCategory, n = 512): Float32Array {
  const key = `${name}:${n}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(name);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / n;
    let v: number;
    switch (category) {
      case "kick":
        v = Math.exp(-x * 5) * (0.75 + 0.25 * Math.cos(x * 60));
        break;
      case "snare":
      case "clap":
        v = Math.exp(-x * 7) * (0.6 + 0.4 * r());
        break;
      case "hat":
        v = Math.exp(-x * (name.includes("open") ? 3 : 14)) * (0.5 + 0.5 * r());
        break;
      case "vocal": {
        // phrases: a few syllable bursts with gaps
        const syl = Math.sin(x * Math.PI * 9) ** 2;
        const phrase = x % 0.5 < 0.42 ? 1 : 0.08;
        v = (0.25 + 0.75 * syl) * phrase * (0.7 + 0.3 * r());
        break;
      }
      default:
        v = Math.exp(-x * 4) * (0.7 + 0.3 * r());
    }
    out[i] = Math.min(1, v);
  }
  cache.set(key, out);
  return out;
}
