/**
 * The tracker's text layout (pure): each track's fields (note, volume digits, effect letter and
 * digits, lock digits) at character positions, and what every field shows on a row.
 */
import type { Project, TrackerColumns } from "./project";
import {
  hex2,
  rowPlace,
  toByte,
  toVolume,
  trackLayout,
  trackerNote,
  type TrackLayout,
} from "./tracker";
import { clipOf, type Pattern, type Track } from "./types";

export type FieldKind = "note" | "vol" | "fx" | "lock" | "clip";

/** One place the cursor can be: a note, a digit of a volume, an effect's letter or a digit. */
export interface Field {
  kind: FieldKind;
  /** The note column, effect column or lock column. */
  col: number;
  /** Which character of the column (volume and lock digits; 0 is an effect's letter). */
  digit: number;
  /** Characters from the track's left edge, and width. */
  x: number;
  w: number;
}

export interface TrackCols {
  track: Track;
  layout: TrackLayout;
  fields: Field[];
  /** Where the track starts, in characters from the first track, and its width. */
  x: number;
  width: number;
}

/** Characters: a note column ("C-4 7F "), an effect column ("R03 "), a lock column ("FF  "). */
const NOTE_W = 7;
const FX_W = 4;
const LOCK_W = 4;
const CLIP_W = 5;
const MIN_W = 9;

function fieldsOf(layout: TrackLayout, decimal: boolean): { fields: Field[]; width: number } {
  const fields: Field[] = [];
  let x = 1;
  if (layout.track.mode === "clip") {
    fields.push({ kind: "clip", col: 0, digit: 0, x, w: 4 });
    return { fields, width: Math.max(MIN_W, x + CLIP_W) };
  }
  const volDigits = decimal ? 3 : 2;
  layout.notes.forEach((_, c) => {
    fields.push({ kind: "note", col: c, digit: 0, x, w: 3 });
    for (let d = 0; d < volDigits; d++)
      fields.push({ kind: "vol", col: c, digit: d, x: x + 4 + d, w: 1 });
    x += NOTE_W + (decimal ? 1 : 0);
  });
  for (let i = 0; i < layout.fxCols; i++) {
    for (let d = 0; d < 3; d++) fields.push({ kind: "fx", col: i, digit: d, x: x + d, w: 1 });
    x += FX_W;
  }
  layout.locks.forEach((_, j) => {
    for (let d = 0; d < 2; d++) fields.push({ kind: "lock", col: j, digit: d, x: x + d, w: 1 });
    x += LOCK_W;
  });
  return { fields, width: Math.max(MIN_W, x) };
}

/** Every track's columns, laid out left to right. */
export function trackerColumns(project: Project, pattern: Pattern, n: number, decimal: boolean) {
  const out: TrackCols[] = [];
  let x = 0;
  for (const track of project.tracks) {
    const view: TrackerColumns | undefined = project.tracker?.columns[track.id];
    const layout = trackLayout(track, pattern, n, view);
    const { fields, width } = fieldsOf(layout, decimal);
    out.push({ track, layout, fields, x, width });
    x += width + 1;
  }
  return out;
}

/** How a piece of text is drawn. */
export type Role = "text" | "dim" | "faint" | "volume" | "fx" | "lock";

export interface Segment {
  /** Characters from the track's left edge. */
  x: number;
  text: string;
  role: Role;
  /** The field index this text belongs to (for the cursor's highlight). */
  fields: number[];
}

const pad = (s: string, w: number) =>
  s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);

/** The text of a track on a row. */
export function rowSegments(
  cols: TrackCols,
  pattern: Pattern,
  row: number,
  decimal: boolean,
): { segments: Segment[]; ghost: boolean; shaded: boolean; offGrid: boolean } {
  const { layout, fields, track } = cols;
  const place = rowPlace(layout.grid, row);
  const segments: Segment[] = [];
  if (track.mode === "clip") {
    const lane = pattern.lanes[track.id];
    const clip = lane ? clipOf(lane) : null;
    const text =
      row === 0 && clip
        ? clip.active
          ? clip.launchMode === "loop"
            ? "LOOP"
            : "ONCE"
          : "OFF"
        : "";
    if (text)
      segments.push({ x: fields[0].x, text, role: clip?.active ? "text" : "dim", fields: [0] });
    return { segments, ghost: false, shaded: false, offGrid: false };
  }
  if (!place) {
    return { segments, ghost: false, shaded: true, offGrid: true };
  }
  const lane = pattern.lanes[track.id];
  const step = place.step !== undefined ? lane?.steps[place.step] : undefined;
  const base = place.ghost ? "dim" : undefined;
  const between = place.step === undefined;
  // between a Hits track's steps nothing can go; a Notes track's notes can start there
  if (between && track.mode === "hits")
    return { segments, ghost: place.ghost, shaded: true, offGrid: false };
  fields.forEach((f, i) => {
    if (between && f.kind !== "note") return;
    if (f.kind === "note") {
      const nf = layout.notes[f.col]?.get(place.row);
      const text = !nf ? "···" : nf.kind === "off" ? "===" : trackerNote(nf.pitch);
      segments.push({ x: f.x, text, role: base ?? (nf ? "text" : "faint"), fields: [i] });
      const volIdx = fields.findIndex((g) => g.kind === "vol" && g.col === f.col);
      const digits = fields.filter((g) => g.kind === "vol" && g.col === f.col).length;
      if (volIdx >= 0) {
        const vol =
          nf?.kind === "note"
            ? decimal
              ? String(toVolume(nf.velocity)).padStart(3, "0")
              : hex2(toVolume(nf.velocity))
            : "·".repeat(digits);
        segments.push({
          x: f.x + 4,
          text: vol,
          role: base ?? (nf?.kind === "note" ? "volume" : "faint"),
          fields: Array.from({ length: digits }, (_, d) => volIdx + d),
        });
      }
    } else if (f.kind === "fx" && f.digit === 0) {
      const code = place.step !== undefined ? layout.fx.get(place.row)?.[f.col] : undefined;
      segments.push({
        x: f.x,
        text: code ? pad(code, 3) : "···",
        role: base ?? (code ? (step?.on ? "fx" : "dim") : "faint"),
        fields: [i, i + 1, i + 2],
      });
    } else if (f.kind === "lock" && f.digit === 0) {
      const key = layout.locks[f.col];
      const v = step?.locks?.[key];
      segments.push({
        x: f.x,
        text: v !== undefined ? hex2(toByte(v)) : "··",
        role: base ?? (v !== undefined ? (step?.on ? "lock" : "dim") : "faint"),
        fields: [i, i + 1],
      });
    }
  });
  return { segments, ghost: place.ghost, shaded: place.step === undefined, offGrid: false };
}

/** A lock column's header: the knob's short name, three characters. */
export function lockLabel(key: string, labels: Record<string, string>): string {
  const name = labels[key] ?? key.split(".").pop() ?? key;
  return name
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

/** The hex digits a row number needs. */
export const rowDigits = (rows: number) => (rows > 256 ? 3 : 2);

export const rowLabel = (row: number, digits: number) =>
  row.toString(16).toUpperCase().padStart(digits, "0");
