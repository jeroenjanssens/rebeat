/**
 * An 8×8 grid controller view of the drum machine: rows are tracks, columns are steps (eight at a
 * time), lit in the track colors; the playing step is highlighted. Pure, so it is unit-tested.
 */
import type { Project } from "../../model/project";
import { clipOf, type Pattern } from "../../model/types";

export interface GridView {
  /** First visible track and step. */
  trackOffset: number;
  stepOffset: number;
}

export type RGB = [number, number, number];

const hex = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const scale = (c: RGB, k: number): RGB => [
  Math.round(c[0] * k),
  Math.round(c[1] * k),
  Math.round(c[2] * k),
];

/** Pad colors, row 0 = top, column 0 = left (so each device maps them to its own layout). */
export function gridColors(
  project: Project,
  pattern: Pattern,
  view: GridView,
  playStep: number | null,
): RGB[][] {
  const rows: RGB[][] = [];
  for (let r = 0; r < 8; r++) {
    const track = project.tracks[view.trackOffset + r];
    const row: RGB[] = [];
    for (let c = 0; c < 8; c++) {
      const step = view.stepOffset + c;
      const lane = track && pattern.lanes[track.id];
      if (!track || !lane) {
        row.push([0, 0, 0]);
        continue;
      }
      // a Clip track: its row lights while the clip plays on this page (a pad turns it on or off)
      if (track.mode === "clip") {
        row.push(scale(hex(track.color), clipOf(lane).active ? (track.mute ? 0.1 : 0.6) : 0.04));
        continue;
      }
      const len = lane.stepCountOverride ?? pattern.stepCount;
      if (step >= len) {
        row.push([0, 0, 0]);
        continue;
      }
      const s = lane.steps[step];
      const base = hex(track.color);
      let color = s.on
        ? scale(base, 0.35 + 0.65 * s.velocity)
        : scale(base, track.mute ? 0.02 : 0.08);
      if (playStep !== null && playStep % len === step)
        color = s.on ? [255, 255, 255] : [60, 60, 60];
      row.push(color);
    }
    rows.push(row);
  }
  return rows;
}

/** Which step a pad press toggles. */
export function padTarget(project: Project, view: GridView, row: number, col: number) {
  const track = project.tracks[view.trackOffset + row];
  return track ? { trackId: track.id, step: view.stepOffset + col } : null;
}

export function clampView(project: Project, pattern: Pattern, v: GridView): GridView {
  return {
    trackOffset: Math.max(0, Math.min(Math.max(0, project.tracks.length - 8), v.trackOffset)),
    stepOffset: Math.max(0, Math.min(Math.max(0, pattern.stepCount - 8), v.stepOffset)),
  };
}
