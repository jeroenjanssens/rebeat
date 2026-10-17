/**
 * FT2's instrument envelopes and fadeouts (D287), pure. The part up to the sustain point (and a
 * loop) is played into the rendered sample; what comes after key-off (the rest of the envelope and
 * the fadeout) becomes the track's release.
 */
import type { XmEnvelope, XmInstrument } from "./parse";

/** An envelope's value (0–64) at a tick of a held note: up to its sustain point, around its loop,
 * held at its last point. */
export function envAt(env: XmEnvelope, tick: number): number {
  const pts = env.points;
  if (!pts.length) return 64;
  let t = tick;
  if (env.loop && (env.sustain === undefined || env.loop[1] <= env.sustain)) {
    const [a, b] = env.loop;
    const start = pts[a][0];
    const end = pts[b][0];
    if (end > start && t > end) t = start + ((t - start) % (end - start));
  }
  if (env.sustain !== undefined && t >= pts[env.sustain][0]) return pts[env.sustain][1];
  return valueAt(pts, t);
}

/** Linear between points; before the first and after the last, held. */
function valueAt(pts: [number, number][], t: number): number {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (t <= x1) return x1 > x0 ? y0 + ((y1 - y0) * (t - x0)) / (x1 - x0) : y1;
  }
  return pts[pts.length - 1][1];
}

/**
 * How long a note sounds after key-off, in seconds: without a volume envelope FT2 cuts it at once;
 * with one, the envelope goes on past its sustain point and the fadeout (if any) takes it to
 * silence, whichever is first (`tick`: seconds per tick).
 */
export function releaseSeconds(inst: XmInstrument, tick: number): number {
  const env = inst.volumeEnvelope;
  if (!env) return 0.005;
  const fade = inst.fadeout ? (32768 / inst.fadeout) * tick : Infinity;
  const pts = env.points;
  // the envelope after the sustain point: where it gets to zero (if it does)
  let toZero = Infinity;
  if (env.sustain !== undefined) {
    const from = pts[env.sustain][0];
    const zero = pts.slice(env.sustain).find(([, y]) => y === 0);
    if (zero) toZero = (zero[0] - from) * tick;
  }
  const s = Math.min(fade, toZero);
  // neither ends it: it rings on (FT2 keeps it until the sample ends); a long release
  return Number.isFinite(s) ? Math.max(0.005, s) : 4;
}

/** The knob position (0..1) of the voices' Release for a time, the inverse of its 1 ms–8 s curve. */
export const releaseKnob = (seconds: number) =>
  Math.max(0, Math.min(1, Math.log(Math.max(1, seconds * 1000)) / Math.log(8000)));
