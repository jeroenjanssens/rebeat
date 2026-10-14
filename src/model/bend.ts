/**
 * A note's bend over time (D220, D223): how many semitones it's away from its pitch at a moment
 * of the note. Pure, so the synth's worklet, the tests and the piano roll's drawing share it.
 */
import { easeAt, inShape, outShape, type Ease } from "./ease";
import { BEND_SHAPES, type BendShape, type NoteBend } from "./types";

/** The bend's movement from 0 to 1 over its time, shaped by its ease. */
export function bendEase(e: Ease | undefined, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  if (!e || e.type === "linear" || e.type === "none") return x;
  if (e.type === "smooth") return easeAt(e, e, x);
  if (e.type === "exponential") return outShape(e, x);
  return inShape(e, x);
}

/** Shapes that start when the note is let go (and keep it sounding until they're done, D221). */
export const atRelease = (b: NoteBend) => b.shape === "fall" || b.shape === "doit";

/** A bend's time and delay in seconds, at `secPerQ` seconds per quarter note. */
export function bendSeconds(b: NoteBend, secPerQ: number) {
  const k = b.unit === "q" ? secPerQ : 1;
  return { time: Math.max(0.001, b.time * k), delay: Math.max(0, b.delay * k) };
}

/** How long a Fall or a Doit keeps a let-go note sounding, in seconds. */
export function releaseTail(b: NoteBend, secPerQ: number): number {
  if (!atRelease(b)) return 0;
  const { time, delay } = bendSeconds(b, secPerQ);
  return time + delay;
}

/**
 * The bend in semitones `t` seconds into the note; `released`: seconds into the note when it was
 * let go (null while held).
 */
export function bendAt(b: NoteBend, t: number, released: number | null, secPerQ: number): number {
  const { time, delay } = bendSeconds(b, secPerQ);
  const a = b.amount;
  if (atRelease(b)) {
    if (released === null || t < released + delay) return 0;
    return a * bendEase(b.ease, (t - released - delay) / time);
  }
  if (b.shape === "scoop") return t < delay ? a : a * (1 - bendEase(b.ease, (t - delay) / time));
  if (t < delay) return 0;
  const u = (t - delay) / time;
  if (b.shape === "dip") {
    if (u >= 1) return 0;
    return a * bendEase(b.ease, u < 0.5 ? u * 2 : (1 - u) * 2);
  }
  if (b.shape === "shake") {
    // a vibrato that grows to its depth over the time (the build-up)
    const rate = b.rate ?? 5.5;
    const hz = b.unit === "q" ? rate / secPerQ : rate;
    return a * bendEase(b.ease, u) * Math.sin(2 * Math.PI * hz * (t - delay));
  }
  // rise, next: there and stays
  return a * bendEase(b.ease, u);
}

/** A saved bend, checked (D224): undefined when it isn't one. */
export function sanitizeBend(v: unknown): NoteBend | undefined {
  const b = v as Partial<NoteBend> | null;
  if (!b || typeof b !== "object" || !BEND_SHAPES.includes(b.shape as BendShape)) return undefined;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : NaN);
  const amount = num(b.amount);
  const time = num(b.time);
  if (Number.isNaN(amount) || Number.isNaN(time)) return undefined;
  const out: NoteBend = {
    shape: b.shape as BendShape,
    amount: Math.max(-24, Math.min(24, amount)),
    time: Math.max(0.001, time),
    delay: Math.max(0, num(b.delay) || 0),
    unit: b.unit === "q" ? "q" : "s",
  };
  if (b.ease && typeof b.ease === "object" && typeof b.ease.type === "string") out.ease = b.ease;
  if (b.shape === "shake") out.rate = Math.max(0.1, Math.min(20, num(b.rate) || 5.5));
  return out;
}

const SHAPE_NAME: Record<BendShape, string> = {
  scoop: "Scoop",
  fall: "Fall",
  doit: "Doit",
  dip: "Dip",
  rise: "Rise",
  next: "Next",
  shake: "Shake",
};

/** "Scoop −2 st, 120 ms", "Rise +12 st, 1/1 bar" (D224: the Inspector, the piano roll). */
export function describeBend(b: NoteBend): string {
  const sign = b.amount > 0 ? "+" : b.amount < 0 ? "−" : "";
  const amount = `${sign}${Math.abs(Math.round(b.amount * 10) / 10)} st`;
  const t = (v: number) =>
    b.unit === "q"
      ? `${Math.round(v * 100) / 100} beat${v === 1 ? "" : "s"}`
      : v < 1
        ? `${Math.round(v * 1000)} ms`
        : `${Math.round(v * 10) / 10} s`;
  const delay = b.delay > 0 ? ` after ${t(b.delay)}` : "";
  return `${SHAPE_NAME[b.shape]} ${amount}, ${t(b.time)}${delay}`;
}
