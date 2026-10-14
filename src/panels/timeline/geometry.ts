/** The timeline's geometry: snapping song positions, the rows' sizes. */
import { bars, barQuarters, blockAt } from "../../model/arrangement";
import type { Project } from "../../model/project";
import type { TimelineSnap } from "../../state/settings";

/** The width of the row headers, in pixels. */
export const HEADER = 128;
export const RULER_H = 34;
export const SECTIONS_H = 58;
export const TRACK_H = 22;
export const LANE_H = 44;
/** A folded automation lane (D233). */
export const LANE_FOLDED_H = 16;
export const TEMPO_OPEN_H = 64;
export const TEMPO_FOLDED_H = 14;

/** The zoom range, pixels per quarter note. */
export const MIN_ZOOM = 1.5;
export const MAX_ZOOM = 80;

/**
 * Snap a song position (quarter notes) to the grid: bars and beats count from each section's
 * repeat (D185), so a short section doesn't push the grid off its downbeats.
 */
export function snapQ(project: Project, q: number, snap: TimelineSnap): number {
  if (snap === "off") return Math.max(0, q);
  if (snap === "16th") return Math.max(0, Math.round(q * 4) / 4);
  const lines = bars(project);
  const barQ = barQuarters(project);
  // the bar line at or before q
  let line = lines[0]?.q ?? 0;
  for (const l of lines) {
    if (l.q > q + 1e-9) break;
    line = l.q;
  }
  const block = blockAt(project, q);
  const repeatEnd =
    block.start + (Math.floor((q - block.start) / block.length + 1e-9) + 1) * block.length;
  const next = Math.min(line + barQ, repeatEnd);
  if (snap === "bar") return q - line < next - q ? line : next;
  const beatQ = 4 / project.timeSignature[1];
  const beat = line + Math.round((q - line) / beatQ) * beatQ;
  return Math.max(0, Math.min(beat, next));
}

/** "1:23" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
