/**
 * Eases between automation points and tempo changes (D196). Each point has an ease in (how the
 * curve arrives at it) and an ease out (how it leaves); the stretch from A to B composes them:
 * f(t) = in(out(t)). A's out shapes how it sets off, B's in how it lands: a flat start stays flat,
 * a flat landing stays flat, and a bounce stays a whole bounce.
 */

export type EaseType = "none" | "linear" | "smooth" | "exponential" | "bounce";

export interface Ease {
  type: EaseType;
  /** 0..1 (default 0.5); 0 is linear for every type. */
  strength?: number;
}

/** The types each side offers: a jump belongs to the side that leaves, a bounce to the arrival. */
export const OUT_TYPES: EaseType[] = ["none", "linear", "smooth", "exponential"];
export const IN_TYPES: EaseType[] = ["linear", "smooth", "exponential", "bounce"];
/** Tempo ramps (D198): no jumps (that's a ramp off) and no bounces. */
export const TEMPO_TYPES: EaseType[] = ["linear", "smooth", "exponential"];

export const EASE_LABEL: Record<EaseType, string> = {
  none: "None (jump)",
  linear: "Linear",
  smooth: "Smooth",
  exponential: "Exponential",
  bounce: "Bounce",
};

export const DEFAULT_STRENGTH = 0.5;
const strengthOf = (e?: Ease) => Math.max(0, Math.min(1, e?.strength ?? DEFAULT_STRENGTH));

/** Whether a side changes the shape (not linear). */
export const isShaped = (e?: Ease) =>
  !!e && e.type !== "linear" && e.type !== "none" && strengthOf(e) > 0;

/** The stretch from a point with ease out `out` to one with ease in `inn` is a straight line. */
export const isLinear = (out?: Ease, inn?: Ease) => !isShaped(out) && !isShaped(inn);

/** Bounce onto the target (the classic "ease out bounce"). */
function bounceOut(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

function expo(t: number, s: number): number {
  const k = 10 * s;
  if (k < 1e-6) return t;
  return (Math.pow(2, k * t) - 1) / (Math.pow(2, k) - 1);
}

/** How the curve leaves a point, 0..1 over the stretch. */
export function outShape(e: Ease | undefined, t: number): number {
  const s = strengthOf(e);
  switch (e?.type) {
    case "smooth":
      return (1 - s) * t + s * (1 - Math.cos((Math.PI * t) / 2));
    case "exponential":
      return expo(t, s);
    default:
      return t;
  }
}

/** How the curve arrives at a point, 0..1 over the stretch. */
export function inShape(e: Ease | undefined, t: number): number {
  const s = strengthOf(e);
  switch (e?.type) {
    case "smooth":
      return (1 - s) * t + s * Math.sin((Math.PI * t) / 2);
    case "exponential":
      return 1 - expo(1 - t, s);
    case "bounce":
      return (1 - s) * t + s * bounceOut(t);
    default:
      return t;
  }
}

/**
 * The share of the way from A to B at t (0..1): A's out, then B's in. An ease out of None holds
 * (0 until the end; the caller jumps at B).
 */
export function easeAt(out: Ease | undefined, inn: Ease | undefined, t: number): number {
  if (out?.type === "none") return t >= 1 ? 1 : 0;
  const x = Math.max(0, Math.min(1, t));
  if (isLinear(out, inn)) return x;
  return inShape(inn, outShape(out, x));
}
