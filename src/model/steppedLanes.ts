/**
 * Stepped lanes (D229, D230): a lane on a knob with a fixed number of values holds each point's
 * value until the next point. Turning a lane that used to slope between values into one that
 * steps keeps what it played: a point where the old curve crossed into another band.
 */
import { curveAt, lanePoints, snapStep, toAnchor } from "./arrangement";
import type { Project } from "./project";
import type { AutomationPoint } from "./types";

/** Samples per stretch when looking for where an old curve crossed into another band. */
const SAMPLES = 64;

/**
 * A lane's points as a stepped lane of `steps` values: every point rounded to its band, no
 * eases, and a new point wherever the old curve (eased, rounded as the engine did) changed band
 * between two points. Hidden points and points that are off are kept, rounded.
 */
export function steppedPoints(
  project: Project,
  points: AutomationPoint[],
  steps: number,
): AutomationPoint[] {
  const plain = (p: AutomationPoint): AutomationPoint => {
    const { in: _in, out: _out, ...rest } = p;
    return { ...rest, value: snapStep(p.value, steps) };
  };
  const out = points.map(plain);
  const curve = lanePoints(project, points);
  const band = (q: number) => snapStep(curveAt(curve, q) ?? 0, steps);
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    // a hold jumps at the next point: that's what a stepped lane does already
    if (a.out?.type === "none" || b.q <= a.q) continue;
    let prevQ = a.q;
    let prev = snapStep(a.value, steps);
    for (let k = 1; k <= SAMPLES; k++) {
      const q = a.q + ((b.q - a.q) * k) / SAMPLES;
      const now = k === SAMPLES ? snapStep(b.value, steps) : band(q);
      if (now !== prev && k < SAMPLES) {
        // where it changed, to well under a tick
        let lo = prevQ;
        let hi = q;
        for (let j = 0; j < 24; j++) {
          const mid = (lo + hi) / 2;
          if (band(mid) === prev) lo = mid;
          else hi = mid;
        }
        out.push({ ...toAnchor(project, hi), value: band(hi) });
      }
      prev = now;
      prevQ = q;
    }
  }
  return out;
}
