/**
 * The partials of the modal resonators (D251): each model's pattern as frequency ratios, in two
 * kinds that Structure morphs between, and the bodies (D252) as a few fixed resonances. Pure.
 */
import type { BodyType, ResonatorModel } from "../../model/synth";

export const MAX_MODES = 32;

/** Continue a list of ratios to MAX_MODES, each the one before × `step`. */
function extend(list: number[], step: number) {
  const out = list.slice(0, MAX_MODES);
  while (out.length < MAX_MODES) out.push(out[out.length - 1] * step);
  return out;
}

/** A free bar's partials: (2k + 1)² / 9 (1, 2.76, 5.40, 8.93, … for the first few). */
const FREE_BAR = extend([1, 2.756, 5.404, 8.933], 1).map((r, k) =>
  k < 4 ? r : ((2 * k + 3) * (2 * k + 3)) / 9,
);
/** A tuned bar (marimba, xylophone): the overtones cut to 4 and 10 times the note. */
const TUNED_BAR = FREE_BAR.map((r) => Math.pow(r, 1.32));

/** A church bell (hum, prime, tierce, quint, nominal…): the prime is the note. */
const CHURCH_BELL = extend(
  [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433, 6.796, 8.215],
  1.16,
);
/** A handbell or tubular bell: brighter, fewer low partials. */
const HANDBELL = extend([1, 2.32, 2.76, 3.74, 4.07, 5.43, 6.07, 7.2, 8.9, 10.6], 1.15);

/** An ideal round membrane's partials (zeros of the Bessel functions). */
const MEMBRANE = extend(
  [
    1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.6, 3.652, 4.06, 4.154, 4.601, 4.832,
    4.903, 5.131, 5.412, 5.494, 5.54, 5.651,
  ],
  1.04,
);
/** A loaded membrane (timpani, tabla): pulled toward harmonics. */
const TIMPANI = extend([1, 1.504, 1.742, 2, 2.245, 2.494, 2.8, 2.852, 3, 3.15, 3.5, 4], 1.06);

/** A wine glass and a singing bowl. */
const GLASS = extend([1, 2.32, 4.25, 6.63, 9.38, 12.6], 1.25);
const BOWL = extend([1, 2.71, 5.15, 8.27, 12, 16.4], 1.22);

/** A rectangular plate's partials with sides 1 : r (m² + n²/r², lowest first). */
export function plateRatios(r: number): number[] {
  const out: number[] = [];
  for (let a = 1; a <= 8; a++) for (let b = 1; b <= 8; b++) out.push(a * a + (b * b) / (r * r));
  out.sort((x, y) => x - y);
  return out.slice(0, MAX_MODES).map((f) => f / out[0]);
}

/**
 * A model's ratios with Structure at s (0..1): the two kinds blended in octaves; a plate's
 * proportions change instead.
 */
export function modeRatios(model: ResonatorModel, s: number): number[] {
  if (model === "plate") return plateRatios(1.15 + s * 1.1);
  const [a, b] =
    model === "bell"
      ? [CHURCH_BELL, HANDBELL]
      : model === "membrane"
        ? [MEMBRANE, TIMPANI]
        : model === "glass"
          ? [GLASS, BOWL]
          : [TUNED_BAR, FREE_BAR];
  return a.map((x, k) => x * Math.pow(b[k] / x, s));
}

/**
 * How much of partial k an exciter at `x` (or a pickup there) reaches: a standing wave's shape,
 * with a little of every partial everywhere (a real strike isn't a point).
 */
export function modeShape(model: ResonatorModel, k: number, x: number): number {
  const n = model === "membrane" || model === "plate" ? 1 + k * 0.71 : k + 1;
  return 0.15 + 0.85 * Math.abs(Math.sin(Math.PI * n * x));
}

/** How loud each partial starts, before position and pickup (the pattern's own balance). */
export function modeLevel(model: ResonatorModel, k: number): number {
  if (model === "glass") return Math.pow(0.45, k);
  if (model === "bell") return k === 1 ? 1 : 0.8 / (1 + k * 0.25);
  return 1 / (1 + k * 0.45);
}

/** A body's resonances (D252): [Hz, Q, gain], before Size. "tube" follows the note. */
export const BODY_MODES: Record<Exclude<BodyType, "none" | "tube">, [number, number, number][]> = {
  guitar: [
    [98, 8, 1],
    [204, 10, 0.8],
    [390, 6, 0.5],
    [1000, 4, 0.4],
    [2500, 3, 0.25],
  ],
  violin: [
    [275, 12, 0.8],
    [460, 10, 1],
    [700, 8, 0.6],
    [1500, 4, 0.5],
    [2800, 3, 0.4],
  ],
  cello: [
    [100, 10, 0.9],
    [200, 10, 1],
    [330, 8, 0.6],
    [600, 5, 0.4],
    [1200, 4, 0.3],
  ],
  piano: [
    [80, 4, 0.8],
    [160, 4, 0.7],
    [320, 4, 0.6],
    [640, 4, 0.5],
    [1300, 3, 0.4],
    [2600, 3, 0.3],
  ],
  box: [
    [110, 6, 1],
    [230, 6, 0.7],
    [560, 5, 0.5],
    [1100, 4, 0.3],
  ],
};
