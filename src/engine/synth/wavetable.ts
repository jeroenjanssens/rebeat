/**
 * Wavetable oscillators in the synth's DSP (D243–D245): the tables this context has (shared by
 * every synth: all processors of a context share one global scope), reading a table at a
 * position with its mip levels crossfaded by pitch, and the warps. Pure, like core.ts.
 */
import type { MippedTable } from "../../model/wavetables";
import type { Warp } from "../../model/synth";

/** The tables sent to this context, by id. */
export const TABLES = new Map<string, MippedTable>();

export function addTable(t: MippedTable) {
  if (!TABLES.has(t.id)) TABLES.set(t.id, t);
}

/**
 * Which two mip levels a phase increment `dt` (cycles per sample) reads, and how much of the
 * second (D244): level a keeps every harmonic below a quarter to half the sample rate, and in
 * the upper half of each octave a crossfade toward the next level rises with the pitch, so a
 * glide never jumps in brightness.
 */
export function levelFor(dt: number, levels: number): { a: number; w: number } {
  const x = Math.log2(Math.max(1e-9, dt) * 2048);
  if (x < -1) return { a: 0, w: 0 };
  const c = Math.max(0, x + 1);
  const a = Math.min(levels - 1, Math.floor(c));
  // the lower half of each octave reads one level (half the work); the upper half fades
  return { a, w: a >= levels - 1 ? 0 : Math.max(0, (c - Math.floor(c)) * 2 - 1) };
}

/** One level of a table at frame position `fp` (0..frames−1) and phase t (0..1). */
function readLevel(m: MippedTable, k: number, fp: number, smooth: boolean, t: number) {
  const size = m.sizes[k];
  const data = m.levels[k];
  const x = t * size;
  const i0 = Math.floor(x);
  const a = x - i0;
  const j0 = i0 & (size - 1);
  const j1 = (i0 + 1) & (size - 1);
  let f0 = Math.floor(fp);
  let ff = fp - f0;
  if (!smooth) {
    f0 = Math.round(fp);
    ff = 0;
  }
  if (f0 >= m.frames - 1) {
    f0 = m.frames - 1;
    ff = 0;
  }
  const b0 = f0 * size;
  const s0 = data[b0 + j0] + (data[b0 + j1] - data[b0 + j0]) * a;
  if (ff < 1e-4) return s0;
  const b1 = b0 + size;
  const s1 = data[b1 + j0] + (data[b1 + j1] - data[b1 + j0]) * a;
  return s0 + (s1 - s0) * ff;
}

/**
 * A sample of table `m` at `position` (0..1) and phase `t`, for a note whose phase moves `dt`
 * per sample. `level` is levelFor(dt) (once per block).
 */
export function readTable(
  m: MippedTable,
  position: number,
  smooth: boolean,
  t: number,
  level: { a: number; w: number },
) {
  const fp = Math.min(1, Math.max(0, position)) * (m.frames - 1);
  const s = readLevel(m, level.a, fp, smooth, t);
  if (level.w < 1e-3) return s;
  return s + (readLevel(m, level.a + 1, fp, smooth, t) - s) * level.w;
}

const frac = (x: number) => x - Math.floor(x);

/**
 * A warp (D245): where in the frame to read for phase t (0..1), and a gain (Formant windows each
 * cycle). `fm` is the modulating oscillator's last sample (FM only).
 */
export function warpPhase(warp: Warp, amount: number, t: number, fm: number): number {
  switch (warp) {
    case "bend": {
      // toward the start (−) or the end (+) of the cycle
      const e = Math.pow(2, -amount * 2.5);
      return Math.pow(t, e);
    }
    case "sync":
    case "formant":
      return frac(t * (1 + amount * 7));
    case "mirror": {
      const m = t < 0.5 ? t * 2 : 2 - t * 2;
      return Math.min(0.9999, t + (m - t) * amount);
    }
    case "asym": {
      const k = 0.5 - amount * 0.45;
      return t < k ? (0.5 * t) / k : 0.5 + (0.5 * (t - k)) / (1 - k);
    }
    case "squeeze": {
      const u = t * 2 - 1;
      const s = Math.sign(u) * Math.pow(Math.abs(u), 1 + amount * 3);
      return Math.min(0.9999, (s + 1) / 2);
    }
    case "quantize": {
      const steps = Math.max(4, Math.round(2048 / Math.pow(2, amount * 9)));
      return Math.floor(t * steps) / steps;
    }
    case "fm":
      return frac(t + amount * 0.5 * fm);
    default:
      return t;
  }
}

/** Formant's window: each sped-up cycle fades in and out, so the pitch stays the note's. */
export const formantGain = (t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
