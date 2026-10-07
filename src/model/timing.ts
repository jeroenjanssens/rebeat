/**
 * Lane steps (of a track with its own step size) that start within one page step.
 * Positions are in quarter notes; returns the lane step index and its offset into the page step.
 */
export function laneStepsWithin(pageStep: number, qPage: number, qLane: number, length: number) {
  const eps = 1e-6;
  const startQ = pageStep * qPage;
  const out: { index: number; offsetQ: number }[] = [];
  for (let j = Math.max(0, Math.ceil(startQ / qLane - eps)); j * qLane < startQ + qPage - eps; j++)
    out.push({ index: j % length, offsetQ: j * qLane - startQ });
  return { current: Math.floor(startQ / qLane + eps) % length, steps: out };
}
