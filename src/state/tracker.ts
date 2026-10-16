/**
 * The tracker's state and actions (D265–D277): the cursor, edit mode, the selection, the
 * clipboard and the message in the status line. Nothing here is project data: every edit goes
 * through `commit` with the pure recipes in `model/trackerEdit.ts`, and the column counts through
 * `editView` (view data, no undo step).
 */
import { create } from "zustand";
import type { Project, TrackerColumns } from "../model/project";
import {
  FX_NAMES,
  MAX_FX_COLS,
  MAX_NOTE_COLS,
  fromByte,
  fxLetter,
  hex2,
  rowFactor,
  rowPlace,
  toByte,
  toVolume,
  type FxLetter,
  type RowsSetting,
} from "../model/tracker";
import {
  clearBlock,
  clearCell,
  clearNote,
  copyBlock,
  interpolate,
  pasteBlock,
  removeFx,
  scaleVolume,
  setLock,
  setVolume,
  shiftRows,
  transposeBlock,
  writeFx,
  writeNote,
  writeOff,
  type Block,
  type EditAt,
  type TrackerClip,
} from "../model/trackerEdit";
import { hitNoteOf } from "../model/tracks";
import { STEP_SIZE_QUARTERS, clipOf } from "../model/types";
import { trackerColumns, type Field, type TrackCols } from "../model/trackerText";
import { useSettings } from "./settings";
import { useStore } from "./store";

export interface TrackerCursor {
  trackId: string;
  /** Index into the track's fields. */
  field: number;
  row: number;
}

interface TrackerState {
  cursor: TrackerCursor;
  edit: boolean;
  /** Where a block selection started (the cursor is its other corner). */
  anchor: { trackId: string; row: number } | null;
  /** What the status line says after an edit that didn't happen (else it describes the cursor). */
  message: string | null;
  clip: TrackerClip | null;
  /** The row the playhead is on in the edited pattern, while playing (null: elsewhere). */
  playRow: number | null;
  /** Whether the tracker has the keyboard focus. */
  focused: boolean;
}

export const useTracker = create<TrackerState>()(() => ({
  cursor: { trackId: "", field: 0, row: 0 },
  edit: false,
  anchor: null,
  message: null,
  clip: null,
  playRow: null,
  focused: false,
}));

const DEFAULTS = {
  octave: 4,
  add: 1,
  rows: "auto" as RowsSetting,
  scale: 1.5,
  compact: false,
  ft2Keys: false,
  decimal: false,
  volume: 100,
};

/** The tracker's settings, with defaults for anything an older save didn't have. */
export const trackerSettings = () => ({ ...DEFAULTS, ...useSettings.getState().tracker });

export function setTrackerSettings(patch: Partial<typeof DEFAULTS>) {
  useSettings.getState().set({ tracker: { ...trackerSettings(), ...patch } });
}

// ---------- where things are ----------

let memo: {
  project: Project;
  pattern: unknown;
  n: number;
  decimal: boolean;
  cols: TrackCols[];
} | null = null;

/** The edited section's pattern, its grid and every track's columns. */
export function trackerContext() {
  const s = useStore.getState();
  const settings = trackerSettings();
  const project = s.project;
  const slot = project.slots.find((x) => x.id === s.editSlotId) ?? project.slots[0];
  const pattern = project.patterns[slot.patternId];
  const n = rowFactor(settings.rows, pattern, project.tracks);
  if (
    !memo ||
    memo.project.tracks !== project.tracks ||
    memo.project.tracker !== project.tracker ||
    memo.pattern !== pattern ||
    memo.n !== n ||
    memo.decimal !== settings.decimal
  )
    memo = {
      project,
      pattern,
      n,
      decimal: settings.decimal,
      cols: trackerColumns(project, pattern, n, settings.decimal),
    };
  const rows = pattern.stepCount * n;
  const at: EditAt = { patternId: pattern.id, n };
  // rows per quarter note and per bar, for the lighter rows
  const perQuarter = n / STEP_SIZE_QUARTERS[pattern.stepSize];
  const [beats, unit] = project.timeSignature;
  return {
    project,
    slot,
    pattern,
    n,
    rows,
    at,
    cols: memo.cols,
    settings,
    perQuarter,
    perBar: perQuarter * beats * (4 / unit),
    /** The section's own shorter length, in rows. */
    sectionRows: slot.steps ? slot.steps * n : rows,
  };
}

export type TrackerContext = ReturnType<typeof trackerContext>;

/** The cursor, made valid for the project as it is now. */
export function cursorIn(
  ctx: TrackerContext,
): { ci: number; col: TrackCols; field: Field; row: number } | null {
  const { cursor } = useTracker.getState();
  if (!ctx.cols.length) return null;
  let ci = ctx.cols.findIndex((c) => c.track.id === cursor.trackId);
  if (ci < 0) {
    const selected = useStore.getState().selectedTrackId;
    ci = Math.max(
      0,
      ctx.cols.findIndex((c) => c.track.id === selected),
    );
  }
  const col = ctx.cols[ci];
  const fi = Math.max(0, Math.min(col.fields.length - 1, cursor.field));
  const row = Math.max(0, Math.min(ctx.rows - 1, cursor.row));
  return { ci, col, field: col.fields[fi], row };
}

function setCursor(next: Partial<TrackerCursor>, keepSelection = false) {
  const t = useTracker.getState();
  const cursor = { ...t.cursor, ...next };
  useTracker.setState({
    cursor,
    message: null,
    ...(keepSelection ? {} : { anchor: null }),
  });
  // the cursor's track is the selected track: the Inspector, the piano roll and the keys follow
  if (cursor.trackId && useStore.getState().selectedTrackId !== cursor.trackId)
    useStore.getState().setUi({ selectedTrackId: cursor.trackId });
}

const say = (message: string | null) => useTracker.setState({ message });

/** Put the cursor on a track (keeping it in range). */
function placeCursor(ctx: TrackerContext, ci: number, field: number, row: number, keep = false) {
  const col = ctx.cols[Math.max(0, Math.min(ctx.cols.length - 1, ci))];
  if (!col) return;
  setCursor(
    {
      trackId: col.track.id,
      field: Math.max(0, Math.min(col.fields.length - 1, field)),
      row: ((row % ctx.rows) + ctx.rows) % ctx.rows,
    },
    keep,
  );
}

// ---------- moving ----------

export function moveRows(d: number, select = false, wrap = true) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  startSelection(select, c.col.track.id, c.row);
  const to = wrap ? c.row + d : Math.max(0, Math.min(ctx.rows - 1, c.row + d));
  placeCursor(ctx, c.ci, useTracker.getState().cursor.field, to, select);
}

export function setRow(row: number, select = false) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  startSelection(select, c.col.track.id, c.row);
  placeCursor(
    ctx,
    c.ci,
    useTracker.getState().cursor.field,
    Math.max(0, Math.min(ctx.rows - 1, row)),
    select,
  );
}

/** One field left or right, into the next track at the ends. */
export function moveField(d: number, select = false) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  startSelection(select, c.col.track.id, c.row);
  let fi = useTracker.getState().cursor.field + d;
  let ci = c.ci;
  if (fi < 0) {
    ci = (ci - 1 + ctx.cols.length) % ctx.cols.length;
    fi = ctx.cols[ci].fields.length - 1;
  } else if (fi >= c.col.fields.length) {
    ci = (ci + 1) % ctx.cols.length;
    fi = 0;
  }
  placeCursor(ctx, ci, fi, c.row, select);
}

/** The next or previous track, on its note field. */
export function moveTrack(d: number, select = false) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  startSelection(select, c.col.track.id, c.row);
  const ci = (c.ci + d + ctx.cols.length) % ctx.cols.length;
  placeCursor(ctx, ci, select ? useTracker.getState().cursor.field : 0, c.row, select);
}

/** Put the cursor on a track's field and row (a click). */
export function clickCursor(trackId: string, field: number, row: number, select = false) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (c) startSelection(select, c.col.track.id, c.row);
  const ci = ctx.cols.findIndex((x) => x.track.id === trackId);
  if (ci >= 0) placeCursor(ctx, ci, field, Math.max(0, Math.min(ctx.rows - 1, row)), select);
}

function startSelection(select: boolean, trackId: string, row: number) {
  if (select && !useTracker.getState().anchor) useTracker.setState({ anchor: { trackId, row } });
}

/** The selected block (or the cursor's cell when nothing is selected). */
export function selectionBlock(ctx = trackerContext()): Block | null {
  const c = cursorIn(ctx);
  if (!c) return null;
  const { anchor } = useTracker.getState();
  if (!anchor) return { trackIds: [c.col.track.id], from: c.row, to: c.row };
  const ai = Math.max(
    0,
    ctx.cols.findIndex((x) => x.track.id === anchor.trackId),
  );
  const [lo, hi] = [Math.min(ai, c.ci), Math.max(ai, c.ci)];
  return {
    trackIds: ctx.cols.slice(lo, hi + 1).map((x) => x.track.id),
    from: Math.min(anchor.row, c.row),
    to: Math.max(anchor.row, c.row),
  };
}

/** Mod+A: the cursor's track, all rows; again: the whole pattern. */
export function selectAll() {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  const b = selectionBlock(ctx);
  const whole = b && b.trackIds.length === 1 && b.from === 0 && b.to === ctx.rows - 1;
  if (whole) {
    useTracker.setState({ anchor: { trackId: ctx.cols[0].track.id, row: 0 } });
    placeCursor(ctx, ctx.cols.length - 1, useTracker.getState().cursor.field, ctx.rows - 1, true);
  } else {
    useTracker.setState({ anchor: { trackId: c.col.track.id, row: 0 } });
    placeCursor(ctx, c.ci, useTracker.getState().cursor.field, ctx.rows - 1, true);
  }
}

// ---------- editing ----------

const commit = (recipe: (p: Project) => unknown, key?: string) => {
  let out: unknown = null;
  useStore.getState().commit((d) => {
    out = recipe(d as Project);
  }, key);
  say(typeof out === "string" ? out : null);
  return out;
};

function advance(ctx: TrackerContext, ci: number, field: number, row: number) {
  const add = trackerSettings().add;
  if (add) placeCursor(ctx, ci, field, row + add);
}

/** The row an edit goes to: the playhead's while playing with edit mode on, else the cursor's. */
function editRow(row: number) {
  const { playRow } = useTracker.getState();
  return useStore.getState().playing && playRow !== null ? playRow : row;
}

/** A note typed (or played on MIDI) in edit mode: written where the cursor is (D273). */
export function enterNote(pitch: number, velocity?: number, opts: { chordOf?: number } = {}) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c || c.field.kind !== "note") return null;
  const playing = useStore.getState().playing;
  const row = opts.chordOf ?? editRow(c.row);
  const col = opts.chordOf !== undefined ? nextFreeColumn(c.col, row, c.field.col) : c.field.col;
  const v = velocity ?? trackerSettings().volume / 127;
  if (col >= MAX_NOTE_COLS) {
    say("Eight notes at once is the most a track's columns hold");
    return null;
  }
  commit((p) => writeNote(p, ctx.at, c.col.track.id, row, col, pitch, v));
  if (col >= c.col.layout.notes.length && c.col.track.mode === "notes")
    ensureNoteColumns(c.col.track.id, col + 1);
  if (!playing && opts.chordOf === undefined)
    advance(ctx, c.ci, useTracker.getState().cursor.field, c.row);
  return { row, col };
}

/** A chord typed or played: the next free note column on the row. */
function nextFreeColumn(col: TrackCols, row: number, from: number) {
  const fresh = trackerContext().cols.find((x) => x.track.id === col.track.id) ?? col;
  const place = rowPlace(fresh.layout.grid, row);
  for (let c = from; c < MAX_NOTE_COLS; c++) {
    const here = fresh.layout.notes[c]?.get(place?.row ?? row);
    if (!here || here.kind === "off") return c;
  }
  return MAX_NOTE_COLS;
}

/** The note-off key. */
export function enterOff(row?: number, col?: number) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c || c.field.kind !== "note") return;
  const r = row ?? editRow(c.row);
  commit((p) => writeOff(p, ctx.at, c.col.track.id, r, col ?? c.field.col));
  if (row === undefined && !useStore.getState().playing)
    advance(ctx, c.ci, useTracker.getState().cursor.field, c.row);
}

/** A hex digit (or a decimal one, for decimal volumes) typed on a value field. */
export function enterDigit(digit: number) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  const { field, col, row } = c;
  const id = col.track.id;
  const place = rowPlace(col.layout.grid, row);
  const key = `trk-${id}-${row}-${field.kind}${field.col}`;
  const next = () => moveField(1);
  if (field.kind === "vol") {
    const nf = col.layout.notes[field.col]?.get(place?.row ?? -1);
    if (nf?.kind !== "note") return say("Type a note first: the volume belongs to it");
    const decimal = trackerSettings().decimal;
    const cur = toVolume(nf.velocity);
    let v: number;
    if (decimal) {
      if (digit > 9) return;
      const s = String(cur).padStart(3, "0").split("");
      s[field.digit] = String(digit);
      v = Number(s.join(""));
    } else {
      const s = hex2(cur).split("");
      s[field.digit] = digit.toString(16).toUpperCase();
      v = parseInt(s.join(""), 16);
    }
    commit((p) => setVolume(p, ctx.at, id, row, field.col, Math.max(1, Math.min(127, v))), key);
    if (field.digit < (decimal ? 2 : 1)) next();
    else advanceAfterValue(ctx, c.ci, row, field);
    return;
  }
  if (field.kind === "fx") {
    const code = col.layout.fx.get(place?.row ?? -1)?.[field.col];
    if (field.digit === 0) {
      // a digit as the command: 3 (glide) and 9 (sample start) are commands
      return enterFxLetter(digit.toString(16).toUpperCase());
    }
    if (!code) return say("Type the command's letter first");
    const s = code.split("");
    s[field.digit] = digit.toString(16).toUpperCase();
    commit((p) => writeFx(p, ctx.at, id, row, s.join("")), key);
    // the command keeps its place in the column order: follow it
    followFx(id, row, s[0]);
    if (field.digit === 1) moveField(1);
    else advanceAfterValue(ctx, c.ci, row, field);
    return;
  }
  if (field.kind === "lock") {
    const lockKey = col.layout.locks[field.col];
    const lane = ctx.pattern.lanes[id];
    const stepIndex = place?.step;
    if (stepIndex === undefined) return say(`Between ${col.track.name}'s steps`);
    const cur = lane?.steps[stepIndex].locks?.[lockKey];
    const s = hex2(cur === undefined ? 0 : toByte(cur)).split("");
    s[field.digit] = digit.toString(16).toUpperCase();
    commit((p) => setLock(p, ctx.at, id, row, lockKey, parseInt(s.join(""), 16)), key);
    if (field.digit === 0) moveField(1);
    else advanceAfterValue(ctx, c.ci, row, field);
  }
}

/** After a value's last digit: back to its first digit, Add rows down (as FT2 does). */
function advanceAfterValue(ctx: TrackerContext, ci: number, row: number, field: Field) {
  const col = trackerContext().cols[ci];
  const first = col.fields.findIndex(
    (f) => f.kind === field.kind && f.col === field.col && (f.kind !== "fx" || f.digit === 1),
  );
  const fi = first >= 0 ? first : useTracker.getState().cursor.field;
  const add = trackerSettings().add;
  placeCursor(ctx, ci, add ? fi : useTracker.getState().cursor.field, row + add);
}

/** After a command's letter changed its place in the order: the cursor goes where it is. */
function followFx(trackId: string, row: number, letter: string) {
  const ctx = trackerContext();
  const col = ctx.cols.find((x) => x.track.id === trackId);
  if (!col) return;
  const place = rowPlace(col.layout.grid, row);
  const list = col.layout.fx.get(place?.row ?? -1) ?? [];
  const i = list.findIndex((c) => c[0] === letter);
  if (i < 0) return;
  const { field } = useTracker.getState().cursor;
  const digit = col.fields[field]?.digit ?? 0;
  const fi = col.fields.findIndex((f) => f.kind === "fx" && f.col === i && f.digit === digit);
  if (fi >= 0) useTracker.setState({ cursor: { ...useTracker.getState().cursor, field: fi } });
}

/** A command letter typed on an effect's letter field. */
export function enterFxLetter(letter: string) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c || c.field.kind !== "fx") return;
  const { col, row } = c;
  const id = col.track.id;
  const place = rowPlace(col.layout.grid, row);
  const list = col.layout.fx.get(place?.row ?? -1) ?? [];
  const old = list[c.field.col];
  const L = letter.toUpperCase();
  // the command's current value when the step has it, else a starting value
  const existing = list.find((x) => x[0] === L);
  const start = existing ?? `${L}${STARTS[L] ?? "00"}`;
  const result = commit((p) => {
    if (old && old[0] !== L) {
      const ol = fxLetter(old);
      if (ol) removeFx(p, ctx.at, id, row, ol);
    }
    return writeFx(p, ctx.at, id, row, start);
  });
  if (result === null) {
    followFx(id, row, L);
    moveField(1);
    useTracker.setState({ message: null });
  }
}

/** Where a command starts when it's typed without digits: its plain value. */
const STARTS: Record<string, string> = {
  "3": "00",
  "9": "00",
  E: "C8",
  N: "80",
  R: "02",
  Y: "80",
  I: "12",
  S: "01",
};

/** Delete: the field under the cursor. */
export function deleteField() {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  const { field, col, row } = c;
  const id = col.track.id;
  if (field.kind === "clip") return setClip("off");
  if (field.kind === "note") commit((p) => clearNote(p, ctx.at, id, row, field.col));
  else if (field.kind === "vol") {
    commit((p) => setVolume(p, ctx.at, id, row, field.col, trackerSettings().volume));
  } else if (field.kind === "fx") {
    const place = rowPlace(col.layout.grid, row);
    const code = col.layout.fx.get(place?.row ?? -1)?.[field.col];
    const letter = code && fxLetter(code);
    if (letter) commit((p) => removeFx(p, ctx.at, id, row, letter as FxLetter));
  } else if (field.kind === "lock") {
    commit((p) => setLock(p, ctx.at, id, row, col.layout.locks[field.col], null));
  }
  advance(ctx, c.ci, useTracker.getState().cursor.field, row);
}

/** Shift+Delete: the whole cell (or the selected block). */
export function deleteCell() {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  if (useTracker.getState().anchor) {
    const b = selectionBlock(ctx)!;
    commit((p) => clearBlock(p, ctx.at, b));
    return;
  }
  commit((p) => clearCell(p, ctx.at, c.col.track.id, c.row));
  advance(ctx, c.ci, useTracker.getState().cursor.field, c.row);
}

/** Backspace and Insert: delete or insert a row in the cursor's track (or every track). */
export function shiftRow(dir: 1 | -1, all = false) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  const ids = all ? ctx.cols.map((x) => x.track.id) : [c.col.track.id];
  if (dir === -1 && c.row === 0) return say("Nothing above the first row to delete");
  const row = dir === -1 ? c.row - 1 : c.row;
  commit((p) => shiftRows(p, ctx.at, ids, row, dir));
  if (dir === -1) placeCursor(ctx, c.ci, useTracker.getState().cursor.field, c.row - 1);
}

export function transpose(semis: number) {
  const ctx = trackerContext();
  const b = selectionBlock(ctx);
  if (b) commit((p) => transposeBlock(p, ctx.at, b, semis), `trk-transpose`);
}

export function scaleVolumes(factor: number) {
  const ctx = trackerContext();
  const b = selectionBlock(ctx);
  if (b) commit((p) => scaleVolume(p, ctx.at, b, factor), `trk-scale`);
}

export function interpolateColumn() {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  const b = selectionBlock(ctx);
  if (!c || !b || b.from === b.to) return say("Select some rows first (Shift and the arrows)");
  const f = c.field;
  if (f.kind === "vol")
    return void commit((p) =>
      interpolate(p, ctx.at, c.col.track.id, b, { kind: "volume", col: f.col }),
    );
  if (f.kind === "lock")
    return void commit((p) =>
      interpolate(p, ctx.at, c.col.track.id, b, { kind: "lock", key: c.col.layout.locks[f.col] }),
    );
  if (f.kind === "fx") {
    const place = rowPlace(c.col.layout.grid, b.from);
    const code = c.col.layout.fx.get(place?.row ?? -1)?.[f.col];
    const letter = code ? fxLetter(code) : undefined;
    if (!letter) return say("Put the cursor on a command that's on the block's first row");
    return void commit((p) => interpolate(p, ctx.at, c.col.track.id, b, { kind: "fx", letter }));
  }
  say("Interpolating works on volumes, commands and locks");
}

// ---------- the clipboard ----------

export function copySelection(cut = false) {
  const ctx = trackerContext();
  const b = selectionBlock(ctx);
  if (!b) return;
  const clip = copyBlock(ctx.project, ctx.at, b, hitNoteOf);
  useTracker.setState({ clip });
  if (cut) commit((p) => clearBlock(p, ctx.at, b));
  say(
    `${cut ? "Cut" : "Copied"} ${b.to - b.from + 1} rows of ${b.trackIds.length} track${b.trackIds.length > 1 ? "s" : ""}`,
  );
}

export function paste(mix = false) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  const { clip } = useTracker.getState();
  if (!c || !clip) return say("Nothing copied yet (Mod+C copies the selection)");
  const ids = ctx.cols.slice(c.ci).map((x) => x.track.id);
  commit((p) => pasteBlock(p, ctx.at, clip, ids, c.row, mix));
}

// ---------- columns, clips, tracks ----------

function editColumns(trackId: string, fn: (c: TrackerColumns) => void) {
  useStore.getState().editView((p) => {
    p.tracker ??= { columns: {} };
    const c = (p.tracker.columns[trackId] ??= {});
    fn(c);
  });
}

function ensureNoteColumns(trackId: string, count: number) {
  editColumns(trackId, (c) => {
    c.notes = Math.max(c.notes ?? 1, Math.min(MAX_NOTE_COLS, count));
  });
}

/** Alt+Shift+→ / ←: a note column more or less (an empty one goes). */
export function noteColumns(d: 1 | -1) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  if (c.col.track.mode !== "notes") return say("Hits tracks have one note column");
  const shown = c.col.layout.notes.length;
  if (d === 1 && shown >= MAX_NOTE_COLS) return say("Eight note columns is the most");
  if (d === -1) {
    if (shown <= 1) return say("A track keeps one note column");
    if (c.col.layout.notes[shown - 1].size)
      return say("The last note column has notes: clear it first");
  }
  editColumns(c.col.track.id, (v) => {
    v.notes = Math.max(1, Math.min(MAX_NOTE_COLS, shown + d));
  });
}

/** Alt+E / Alt+Shift+E: an effect column more or less. */
export function fxColumns(d: 1 | -1) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c || c.col.track.mode === "clip") return;
  const shown = c.col.layout.fxCols;
  if (d === 1 && shown >= MAX_FX_COLS) return say("Four effect columns is the most");
  if (d === -1 && shown <= 1) return say("A track keeps one effect column");
  editColumns(c.col.track.id, (v) => {
    v.fx = Math.max(1, Math.min(MAX_FX_COLS, shown + d));
  });
}

/** A lock column for a knob (from the knob picker). */
export function addLockColumn(trackId: string, key: string) {
  editColumns(trackId, (v) => {
    if (!(v.locks ?? []).includes(key)) v.locks = [...(v.locks ?? []), key];
  });
}

export function removeLockColumn() {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c || c.field.kind !== "lock") return say("Put the cursor on a lock column");
  const key = c.col.layout.locks[c.field.col];
  const used = ctx.pattern.lanes[c.col.track.id]?.steps.some((s) => s.locks?.[key] !== undefined);
  if (used) return say("That lock column has values: clear them first");
  editColumns(c.col.track.id, (v) => {
    v.locks = (v.locks ?? []).filter((k) => k !== key);
  });
  moveField(-1);
}

/** A Clip track's field: Loop, Once or Off. */
export function setClip(mode: "loop" | "oneshot" | "off") {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c || c.col.track.mode !== "clip") return;
  const id = c.col.track.id;
  useStore.getState().commit((p) => {
    const lane = p.patterns[ctx.pattern.id].lanes[id];
    if (!lane) return;
    const clip = clipOf(lane);
    lane.clip = mode === "off" ? { ...clip, active: false } : { active: true, launchMode: mode };
  });
}

export function toggleMute(solo = false) {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  const id = c.col.track.id;
  useStore.getState().commit((p) => {
    const t = p.tracks.find((x) => x.id === id);
    if (!t) return;
    if (solo) t.solo = !t.solo;
    else t.mute = !t.mute;
  });
}

/** What the field under the cursor means, in words (the status line, a screen reader). */
export function describeCursor(ctx = trackerContext()): string {
  const c = cursorIn(ctx);
  if (!c) return "No tracks";
  const { col, field, row } = c;
  const name = col.track.name.toUpperCase();
  const place = rowPlace(col.layout.grid, row);
  const where = `Row ${row.toString(16).toUpperCase().padStart(2, "0")} · ${name}`;
  if (!place) return `${where} · its steps don't sit on these rows (Rows Auto shows them)`;
  const ghost = place.ghost
    ? " · a repeat of row " + place.row.toString(16).toUpperCase().padStart(2, "0")
    : "";
  if (field.kind === "clip") return `${where} · its clip: L loop, O once, Delete off`;
  if (field.kind === "note") {
    const nf = col.layout.notes[field.col]?.get(place.row);
    const what = !nf ? "no note" : nf.kind === "off" ? "note-off" : `note ${nameOf(nf.pitch)}`;
    return `${where} · note column ${field.col + 1}: ${what}${ghost}`;
  }
  if (field.kind === "vol") {
    const nf = col.layout.notes[field.col]?.get(place.row);
    return `${where} · volume${nf?.kind === "note" ? ` ${toVolume(nf.velocity)} of 127` : ": no note"}${ghost}`;
  }
  if (field.kind === "fx") {
    const code = col.layout.fx.get(place.row)?.[field.col];
    const l = code ? fxLetter(code) : undefined;
    return `${where} · effect ${field.col + 1}: ${code ? `${code}, ${l ? FX_NAMES[l] : ""}` : "none"}${ghost}`;
  }
  const key = col.layout.locks[field.col];
  const v =
    place.step !== undefined
      ? ctx.pattern.lanes[col.track.id]?.steps[place.step].locks?.[key]
      : undefined;
  return `${where} · lock ${key.replace(/^sound\./, "")}: ${v === undefined ? "none" : `${Math.round(fromByte(toByte(v)) * 100)}%`}${ghost}`;
}

const nameOf = (pitch: number) => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
};
