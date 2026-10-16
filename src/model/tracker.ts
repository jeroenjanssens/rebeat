/**
 * The tracker (D265–D277): a pattern as rows of text, top to bottom. Pure: the row grid, which
 * rows a track's steps sit on, which note column each note goes in, and the effect commands
 * (a step's fields as `R03`, `Y80`…). The edits are in `trackerEdit.ts`.
 */
import { CONDITIONS } from "./params";
import type { TrackerColumns } from "./project";
import { hitNoteOf, player } from "./tracks";
import {
  STEP_SIZE_QUARTERS,
  type Lane,
  type Note,
  type Pattern,
  type Step,
  type Track,
} from "./types";

/** At most this many note columns per track (a note's column hint, `Note.col`, is 0–7). */
export const MAX_NOTE_COLS = 8;
export const MAX_FX_COLS = 4;
/** The finest Auto grid: rows per pattern step (1/32 and 1/16T under 1/4 steps need 24). */
export const MAX_ROW_FACTOR = 24;
/** A hit plays up to an octave from its hit note (the step bank's Pitch). */
export const HIT_PITCH_RANGE = 12;

/** The row grid: Auto, or rows per pattern step. */
export type RowsSetting = "auto" | 1 | 2 | 3 | 4;
export const ROWS_SETTINGS: RowsSetting[] = ["auto", 1, 2, 3, 4];

const EPS = 1e-6;
const whole = (x: number) => Math.abs(x - Math.round(x)) < EPS;

const laneQuarters = (pattern: Pattern, lane: Lane | undefined) =>
  STEP_SIZE_QUARTERS[lane?.stepSizeOverride ?? pattern.stepSize];

/** The coarsest grid (rows per pattern step) every stepped track's steps land on. */
export function autoRows(pattern: Pattern, tracks: Track[]): number {
  const qp = STEP_SIZE_QUARTERS[pattern.stepSize];
  const qs = tracks
    .filter((t) => t.mode !== "clip")
    .map((t) => laneQuarters(pattern, pattern.lanes[t.id]));
  for (let n = 1; n <= MAX_ROW_FACTOR; n++) if (qs.every((q) => whole((q * n) / qp))) return n;
  return MAX_ROW_FACTOR;
}

/** Rows per pattern step for a setting. */
export const rowFactor = (setting: RowsSetting, pattern: Pattern, tracks: Track[]) =>
  setting === "auto" ? autoRows(pattern, tracks) : setting;

/** Where a track's steps sit on the rows. */
export interface TrackGrid {
  /** Rows per track step; whole when the track is on the grid. */
  k: number;
  /** Whether every step of the track starts on a row (else the tracker can't show it). */
  onGrid: boolean;
  /** The lane's length in its own steps. */
  length: number;
  /** The lane's length in rows: later rows repeat it (ghost rows). */
  laneRows: number;
}

export function trackGrid(pattern: Pattern, trackId: string, n: number): TrackGrid {
  const lane = pattern.lanes[trackId];
  const k = (laneQuarters(pattern, lane) * n) / STEP_SIZE_QUARTERS[pattern.stepSize];
  const length = lane?.stepCountOverride ?? pattern.stepCount;
  const onGrid = k >= 1 - EPS && whole(k);
  const kk = onGrid ? Math.round(k) : k;
  return { k: kk, onGrid, length, laneRows: Math.round(length * kk) };
}

/** A row as a place in the lane: the row it repeats (ghost rows), and the step that starts on it. */
export interface RowPlace {
  /** The row within the lane's own span (0..laneRows−1). */
  row: number;
  ghost: boolean;
  /** The track step that starts on this row, if one does. */
  step?: number;
}

export function rowPlace(grid: TrackGrid, row: number): RowPlace | null {
  if (!grid.onGrid || grid.laneRows <= 0) return null;
  const r = row % grid.laneRows;
  const step = r % grid.k === 0 ? r / grid.k : undefined;
  return { row: r, ghost: row >= grid.laneRows, ...(step !== undefined ? { step } : {}) };
}

// ---------- notes and columns ----------

/** A note as rows: where it starts and ends, and the column it's in. */
export interface PlacedRowNote {
  step: number;
  note: Note;
  start: number;
  end: number;
  col: number;
}

/** A note's start row (its step plus its offset) and end row, within the lane's rows. */
export function noteRows(step: number, note: Note, k: number) {
  const start = Math.round((step + (note.offset ?? 0)) * k);
  const end = Math.max(start + 1, Math.round((step + (note.offset ?? 0) + note.length) * k));
  return { start, end };
}

/**
 * Every note of a Notes lane in rows, each in a note column: in order of start (then pitch), the
 * column it was typed in when that one is free (D269), else the lowest free one.
 */
export function placeNotes(lane: Lane, grid: TrackGrid): PlacedRowNote[] {
  if (!grid.onGrid) return [];
  const all: Omit<PlacedRowNote, "col">[] = [];
  for (let s = 0; s < grid.length; s++)
    for (const note of lane.steps[s]?.notes ?? [])
      all.push({ step: s, note, ...noteRows(s, note, grid.k) });
  all.sort((a, b) => a.start - b.start || a.note.pitch - b.note.pitch);
  const busyUntil: number[] = [];
  const free = (c: number, at: number) => (busyUntil[c] ?? -Infinity) <= at;
  return all.map((n) => {
    const hint = n.note.col;
    let col = hint !== undefined && free(hint, n.start) ? hint : -1;
    if (col < 0) {
      col = 0;
      while (!free(col, n.start)) col++;
    }
    busyUntil[col] = n.end;
    return { ...n, col };
  });
}

/** What a note field shows. */
export type NoteField =
  | { kind: "note"; pitch: number; velocity: number; step: number; ref?: PlacedRowNote }
  | { kind: "off" };

/** The note columns of a track as maps from lane rows to fields. */
export function noteColumns(track: Track, lane: Lane, grid: TrackGrid): Map<number, NoteField>[] {
  if (!grid.onGrid) return [new Map()];
  if (track.mode === "hits") {
    const col = new Map<number, NoteField>();
    const base = hitNoteOf(track);
    for (let s = 0; s < grid.length; s++) {
      const st = lane.steps[s];
      if (st?.on)
        col.set(s * grid.k, {
          kind: "note",
          pitch: base + st.pitch,
          velocity: st.velocity,
          step: s,
        });
    }
    return [col];
  }
  const placed = placeNotes(lane, grid);
  const cols: Map<number, NoteField>[] = [];
  for (const p of placed) {
    cols[p.col] ??= new Map();
    cols[p.col].set(p.start, {
      kind: "note",
      pitch: p.note.pitch,
      velocity: p.note.velocity,
      step: p.step,
      ref: p,
    });
  }
  // a note that ends before the next one in its column (and inside the lane) shows its note-off
  for (const p of placed) {
    const col = cols[p.col];
    if (p.end < grid.laneRows && !col.has(p.end)) col.set(p.end, { kind: "off" });
  }
  for (let c = 0; c < cols.length; c++) cols[c] ??= new Map();
  return cols.length ? cols : [new Map()];
}

/** The note sounding in a column at a row (started before it, not yet ended), if any. */
export function soundingAt(placed: PlacedRowNote[], col: number, row: number) {
  return placed.find((p) => p.col === col && p.start < row && p.end > row);
}

// ---------- effect commands (D271) ----------

/** The effect commands, in the order they fill a step's effect columns. */
export const FX_ORDER = ["3", "9", "E", "N", "R", "Y", "I", "S"] as const;
export type FxLetter = (typeof FX_ORDER)[number];

/** The lock a sample track's `9xx` writes (FT2's sample offset). */
export const SAMPLE_START = "sound.start";

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
const hex1 = (n: number) =>
  Math.max(0, Math.min(15, Math.round(n)))
    .toString(16)
    .toUpperCase();

/** Whether `9xx` (sample start) applies to a track: one-shot hits of a sample. */
export const hasSampleStart = (track: Track) => player(track) === "drum";

/** A step's effect commands (fields that aren't at their default), e.g. `["N90", "R03"]`. */
export function stepFx(step: Step, track: Track): string[] {
  const out: string[] = [];
  if (track.mode === "notes" && step.notes?.some((n) => n.slide)) out.push("300");
  const start = step.locks?.[SAMPLE_START];
  if (hasSampleStart(track) && start !== undefined) out.push(`9${hex2(start * 255)}`);
  if (track.mode === "hits" && step.gate < 1 - EPS)
    out.push(`EC${hex1(Math.max(1, Math.min(15, step.gate * 16)))}`);
  if (Math.abs(step.nudge) > EPS) out.push(`N${hex2(step.nudge * 256 + 128)}`);
  if (step.ratchet > 1) out.push(`R${hex2(step.ratchet)}`);
  if (step.probability < 1 - EPS) out.push(`Y${hex2(step.probability * 255)}`);
  if (step.condition) out.push(conditionCode(step.condition));
  if (step.accent) out.push("S01");
  return out;
}

function conditionCode(c: string): string {
  if (c === "FILL") return "IF1";
  if (c === "!FILL") return "IF0";
  const [x, y] = c.split(":");
  return `I${x}${y}`;
}

/** What each command means, in words (the status line and the guide). */
export const FX_NAMES: Record<FxLetter, string> = {
  "3": "glide into this note",
  "9": "sample start",
  E: "cut (ECx) or delay (EDx)",
  N: "nudge",
  R: "ratchet",
  Y: "probability",
  I: "condition",
  S: "accent",
};

/** Why an FT2 command that Rebeat doesn't have isn't accepted, and what to use instead. */
const NOT_HERE: Record<string, string> = {
  "0": "Arpeggios are the track's own: the arpeggiator in the Inspector",
  "1": "Bends come later: use the Bend card for now",
  "2": "Bends come later: use the Bend card for now",
  "4": "Bends come later: use the Bend card for now",
  A: "Rebeat has no volume slides: automate the track's level on the timeline",
  B: "The song's order is the sections: the song strip or the timeline",
  C: "The volume is the column next to the note",
  D: "A pattern's length is Len in the tracker's top panel",
  F: "Tempo changes live on the timeline's Tempo lane",
  G: "The master level is in the mixer",
  P: "Panning is the track's own: the mixer, or a lock column on Pan",
  W: "Bends come later: use the Bend card for now",
};

export function fxLetter(cmd: string): FxLetter | undefined {
  const l = cmd[0]?.toUpperCase();
  return (FX_ORDER as readonly string[]).includes(l) ? (l as FxLetter) : undefined;
}

/**
 * Write a command (`"R03"`, `"EC8"`, `"IF1"`) into a step. Returns null when it was written, or
 * why it wasn't. Use inside a recipe.
 */
export function applyFx(step: Step, track: Track, cmd: string): string | null {
  const code = cmd.toUpperCase();
  const letter = code[0];
  const x = parseInt(code[1] ?? "0", 16);
  const y = parseInt(code[2] ?? "0", 16);
  const xx = parseInt(code.slice(1, 3) || "0", 16);
  if (Number.isNaN(xx) && letter !== "I") return `${code} isn't a command`;
  switch (letter) {
    case "3":
      if (track.mode !== "notes" || !step.notes?.length)
        return "Glide (3xx) goes on a note of a Notes track";
      for (const n of step.notes) n.slide = true;
      return null;
    case "9":
      if (!hasSampleStart(track)) return "Sample start (9xx) is for hits of a sample";
      step.locks = { ...step.locks, [SAMPLE_START]: xx / 255 };
      return null;
    case "E":
      if (code[1] === "C") {
        if (track.mode !== "hits")
          return "Cut (ECx) is for Hits tracks: a note's length is its note-off";
        step.gate = y >= 1 ? y / 16 : 1;
        return null;
      }
      if (code[1] === "D") {
        step.nudge = Math.min(0.5, y / 16);
        return null;
      }
      return "Of the E commands, Rebeat has ECx (cut) and EDx (delay)";
    case "N":
      step.nudge = Math.max(-0.5, Math.min(0.5, (xx - 128) / 256));
      return null;
    case "R":
      step.ratchet = Math.max(1, Math.min(8, xx));
      return null;
    case "Y":
      step.probability = xx / 255;
      return null;
    case "I": {
      if (code[1] === "F") {
        step.condition = y ? "FILL" : "!FILL";
        return null;
      }
      const c = `${x}:${y}`;
      if (!CONDITIONS.includes(c))
        return "Conditions: I12, I22, I13, I14, IF1 (fill), IF0 (not fill)";
      step.condition = c;
      return null;
    }
    case "S":
      step.accent = xx > 0;
      return null;
  }
  return NOT_HERE[letter] ?? `${letter} isn't a command in Rebeat`;
}

/** Take a command's field back to its default. Use inside a recipe. */
export function clearFx(step: Step, track: Track, letter: FxLetter) {
  switch (letter) {
    case "3":
      for (const n of step.notes ?? []) delete n.slide;
      return;
    case "9":
      if (step.locks) {
        const { [SAMPLE_START]: _, ...rest } = step.locks;
        if (Object.keys(rest).length) step.locks = rest;
        else delete step.locks;
      }
      return;
    case "E":
      if (track.mode === "hits") step.gate = 1;
      step.nudge = 0;
      return;
    case "N":
      step.nudge = 0;
      return;
    case "R":
      step.ratchet = 1;
      return;
    case "Y":
      step.probability = 1;
      return;
    case "I":
      delete step.condition;
      return;
    case "S":
      step.accent = false;
      return;
  }
}

// ---------- volume and locks ----------

/** Velocity (0..1) as the volume field, 01–7F (MIDI velocity, D270). */
export const toVolume = (v: number) => Math.max(1, Math.min(127, Math.round(v * 127)));
export const fromVolume = (b: number) => Math.max(1, Math.min(127, b)) / 127;

/** A lock's value (0..1) as a byte, 00–FF. */
export const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
export const fromByte = (b: number) => Math.max(0, Math.min(255, b)) / 255;

export { hex1, hex2 };

/** The lock columns of a track: the ones asked for, then any other lock its steps have. */
export function lockColumns(track: Track, lane: Lane | undefined, view?: TrackerColumns): string[] {
  const out = [...(view?.locks ?? [])];
  const seen = new Set(out);
  const found = new Set<string>();
  for (const s of lane?.steps ?? []) for (const k of Object.keys(s.locks ?? {})) found.add(k);
  for (const k of [...found].sort()) {
    if (seen.has(k) || (k === SAMPLE_START && hasSampleStart(track))) continue;
    out.push(k);
  }
  return out;
}

// ---------- a track's columns ----------

/** What a track shows: its note columns, effect columns and lock columns. */
export interface TrackLayout {
  track: Track;
  grid: TrackGrid;
  notes: Map<number, NoteField>[];
  /** Effect commands by lane row (steps only). */
  fx: Map<number, string[]>;
  fxCols: number;
  locks: string[];
}

export function trackLayout(
  track: Track,
  pattern: Pattern,
  n: number,
  view?: TrackerColumns,
): TrackLayout {
  const lane = pattern.lanes[track.id];
  const grid = trackGrid(pattern, track.id, n);
  if (track.mode === "clip" || !lane)
    return { track, grid, notes: [], fx: new Map(), fxCols: 0, locks: [] };
  const notes = noteColumns(track, lane, grid);
  const minNotes = track.mode === "notes" ? (view?.notes ?? 1) : 1;
  while (notes.length < minNotes) notes.push(new Map());
  const fx = new Map<number, string[]>();
  let most = 0;
  if (grid.onGrid)
    for (let s = 0; s < grid.length; s++) {
      const list = stepFx(lane.steps[s], track);
      if (list.length) fx.set(s * grid.k, list);
      most = Math.max(most, list.length);
    }
  const fxCols = Math.min(MAX_FX_COLS, Math.max(view?.fx ?? 1, most));
  return { track, grid, notes, fx, fxCols, locks: lockColumns(track, lane, view) };
}

/** The pitch a hit plays for a typed note, and whether it had to be clamped. */
export function hitPitch(track: Track, pitch: number) {
  const d = pitch - hitNoteOf(track);
  const clamped = Math.max(-HIT_PITCH_RANGE, Math.min(HIT_PITCH_RANGE, d));
  return { pitch: clamped, clamped: clamped !== d };
}

/** A note's name as the tracker writes it: `C-4`, `C#4`. */
export function trackerNote(pitch: number): string {
  const names = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[((pitch % 12) + 12) % 12]}${octave < 0 ? "-" : octave}`;
}
