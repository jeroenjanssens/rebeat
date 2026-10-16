/**
 * The tracker's edits (D268–D272): pure functions on a project draft, used inside `commit`. Rows
 * are the pattern's rows on the tracker's grid (`n` rows per pattern step); a ghost row edits the
 * step it repeats. Each returns null when it wrote, or a sentence saying why it didn't (shown in
 * the status line).
 */
import { addNote, removeNote } from "./noteOps";
import { emptyLane, type Project } from "./project";
import {
  MAX_NOTE_COLS,
  applyFx,
  clearFx,
  fromByte,
  fromVolume,
  hitPitch,
  placeNotes,
  rowPlace,
  soundingAt,
  stepFx,
  toVolume,
  trackGrid,
  type FxLetter,
  type TrackGrid,
} from "./tracker";
import { emptyStep, type Lane, type Note, type Pattern, type Step, type Track } from "./types";

/** Where an edit happens: the pattern and its grid. */
export interface EditAt {
  patternId: string;
  /** Rows per pattern step. */
  n: number;
}

interface Target {
  track: Track;
  pattern: Pattern;
  lane: Lane;
  grid: TrackGrid;
}

function target(p: Project, at: EditAt, trackId: string): Target | string {
  const track = p.tracks.find((t) => t.id === trackId);
  const pattern = p.patterns[at.patternId];
  if (!track || !pattern) return "Nothing to edit here";
  if (track.mode === "clip") return "A Clip track plays its clip: no steps to edit";
  pattern.lanes[trackId] ??= emptyLane(track.mode);
  const lane = pattern.lanes[trackId];
  const grid = trackGrid(pattern, trackId, at.n);
  if (!grid.onGrid) return `${track.name}'s steps don't sit on these rows: try Rows Auto`;
  return { track, pattern, lane, grid };
}

/** The step that starts on a row, or why there isn't one. */
function stepOn(t: Target, row: number): { step: Step; index: number } | string {
  const place = rowPlace(t.grid, row);
  if (!place || place.step === undefined)
    return `Between ${t.track.name}'s steps: its steps are every ${t.grid.k} rows`;
  return { step: t.lane.steps[place.step], index: place.step };
}

/** A lane row as a step and an offset (±½ step), for a note that starts there. */
function stepAndOffset(grid: TrackGrid, laneRow: number) {
  let step = Math.round(laneRow / grid.k);
  if (step >= grid.length) step = grid.length - 1;
  const offset = laneRow / grid.k - step;
  return { step, offset: Math.abs(offset) < 1e-9 ? 0 : offset };
}

/** Write a note in a note column (edit mode's note keys, MIDI entry). */
export function writeNote(
  p: Project,
  at: EditAt,
  trackId: string,
  row: number,
  col: number,
  pitch: number,
  velocity: number,
): string | null {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  if (t.track.mode === "hits") {
    const s = stepOn(t, row);
    if (typeof s === "string") return s;
    const { pitch: d, clamped } = hitPitch(t.track, pitch);
    s.step.on = true;
    s.step.pitch = d;
    s.step.velocity = velocity;
    return clamped ? "A hit plays up to an octave from its note" : null;
  }
  const place = rowPlace(t.grid, row)!;
  const r = place.row;
  const placed = placeNotes(t.lane, t.grid);
  const here = placed.find((x) => x.col === col && x.start === r);
  let length: number;
  if (here) {
    removeNote(t.lane, { step: here.step, pitch: here.note.pitch });
    length = here.note.length;
  } else {
    // a tracker column plays one note at a time: the one sounding here ends here
    const before = soundingAt(placed, col, r);
    if (before) before.note.length = (r - before.start) / t.grid.k;
    const next = placed
      .filter((x) => x.col === col && x.start > r)
      .reduce((m, x) => Math.min(m, x.start), t.grid.laneRows);
    length = (next - r) / t.grid.k;
  }
  const { step, offset } = stepAndOffset(t.grid, r);
  const note: Note = { pitch, length, velocity, col: Math.min(MAX_NOTE_COLS - 1, col) };
  if (offset) note.offset = offset;
  if (here?.note.slide) note.slide = true;
  if (here?.note.bend) note.bend = here.note.bend;
  addNote(t.lane, step, note);
  return null;
}

/** A note-off: the note sounding in the column ends here (or the note starting here goes). */
export function writeOff(p: Project, at: EditAt, trackId: string, row: number, col: number) {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  if (t.track.mode === "hits") return "Hits end by themselves: ECx cuts one short";
  const r = rowPlace(t.grid, row)!.row;
  const placed = placeNotes(t.lane, t.grid);
  const here = placed.find((x) => x.col === col && x.start === r);
  if (here) removeNote(t.lane, { step: here.step, pitch: here.note.pitch });
  const before = soundingAt(placed, col, r) ?? placed.find((x) => x.col === col && x.end === r);
  if (!before) return here ? null : "No note sounds here to end";
  before.note.length = (r - before.start) / t.grid.k;
  return null;
}

/** Clear the note field (the note starting here; on a Hits track, the hit). */
export function clearNote(p: Project, at: EditAt, trackId: string, row: number, col: number) {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  if (t.track.mode === "hits") {
    const s = stepOn(t, row);
    if (typeof s === "string") return s;
    s.step.on = false;
    return null;
  }
  const r = rowPlace(t.grid, row)!.row;
  const placed = placeNotes(t.lane, t.grid);
  const here = placed.find((x) => x.col === col && x.start === r);
  if (here) {
    removeNote(t.lane, { step: here.step, pitch: here.note.pitch });
    return null;
  }
  // a note-off here: the note before it lasts until the next one in its column, or the end
  const ending = placed.find((x) => x.col === col && x.end === r);
  if (ending) {
    const next = placed
      .filter((x) => x.col === col && x.start >= r)
      .reduce((m, x) => Math.min(m, x.start), t.grid.laneRows);
    ending.note.length = (next - ending.start) / t.grid.k;
  }
  return null;
}

/** The volume field: a note's velocity (Notes) or the step's (Hits), 01–7F. */
export function setVolume(
  p: Project,
  at: EditAt,
  trackId: string,
  row: number,
  col: number,
  volume: number,
) {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  const v = fromVolume(volume);
  if (t.track.mode === "hits") {
    const s = stepOn(t, row);
    if (typeof s === "string") return s;
    if (!s.step.on) return "Type a note first: the volume belongs to it";
    s.step.velocity = v;
    return null;
  }
  const r = rowPlace(t.grid, row)!.row;
  const here = placeNotes(t.lane, t.grid).find((x) => x.col === col && x.start === r);
  if (!here) return "Type a note first: the volume belongs to it";
  here.note.velocity = v;
  const step = t.lane.steps[here.step];
  step.velocity = Math.max(...(step.notes ?? []).map((x) => x.velocity));
  return null;
}

/** Write an effect command on the step that starts on the row. */
export function writeFx(p: Project, at: EditAt, trackId: string, row: number, cmd: string) {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  const s = stepOn(t, row);
  if (typeof s === "string") return s;
  return applyFx(s.step, t.track, cmd);
}

export function removeFx(p: Project, at: EditAt, trackId: string, row: number, letter: FxLetter) {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  const s = stepOn(t, row);
  if (typeof s === "string") return s;
  clearFx(s.step, t.track, letter);
  return null;
}

/** A lock column's value on the step (null: no lock). */
export function setLock(
  p: Project,
  at: EditAt,
  trackId: string,
  row: number,
  key: string,
  byte: number | null,
) {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  const s = stepOn(t, row);
  if (typeof s === "string") return s;
  if (byte === null) {
    if (s.step.locks) {
      const { [key]: _, ...rest } = s.step.locks;
      if (Object.keys(rest).length) s.step.locks = rest;
      else delete s.step.locks;
    }
  } else s.step.locks = { ...s.step.locks, [key]: fromByte(byte) };
  return null;
}

/** Clear a whole cell of a track: its notes starting on the row, and the step's fields. */
export function clearCell(p: Project, at: EditAt, trackId: string, row: number) {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  const r = rowPlace(t.grid, row)!.row;
  for (const x of placeNotes(t.lane, t.grid))
    if (x.start === r) removeNote(t.lane, { step: x.step, pitch: x.note.pitch });
  const s = stepOn(t, row);
  if (typeof s !== "string") {
    const notes = s.step.notes;
    Object.assign(s.step, emptyStep());
    delete s.step.condition;
    delete s.step.locks;
    if (notes?.length) {
      s.step.notes = notes;
      s.step.on = true;
    } else delete s.step.notes;
  }
  return null;
}

// ---------- rows and blocks ----------

/**
 * Insert an empty step (`dir` 1) or delete one (−1) at the row, in each track: the track's later
 * steps move down or up within its length (its first step at or after the row).
 */
export function shiftRows(p: Project, at: EditAt, trackIds: string[], row: number, dir: 1 | -1) {
  for (const id of trackIds) {
    const t = target(p, at, id);
    if (typeof t === "string") continue;
    const r = rowPlace(t.grid, row)!.row;
    const from = Math.ceil(r / t.grid.k - 1e-9);
    const L = t.grid.length;
    if (from >= L) continue;
    const steps = t.lane.steps;
    if (dir === 1) {
      for (let i = L - 1; i > from; i--) steps[i] = steps[i - 1];
      steps[from] = emptyStep();
    } else {
      for (let i = from; i < L - 1; i++) steps[i] = steps[i + 1];
      steps[L - 1] = emptyStep();
    }
  }
  return null;
}

/** A block of rows in some tracks (inclusive). */
export interface Block {
  trackIds: string[];
  from: number;
  to: number;
}

/** The steps (by index) and notes that start in a block's rows, per track. */
function inBlock(t: Target, from: number, to: number) {
  const rows = new Set<number>();
  for (let r = from; r <= to; r++) rows.add(rowPlace(t.grid, r)!.row);
  const steps: number[] = [];
  for (const r of rows)
    if (r % t.grid.k === 0 && r / t.grid.k < t.grid.length) steps.push(r / t.grid.k);
  const notes = placeNotes(t.lane, t.grid).filter((x) => rows.has(x.start));
  return { steps: steps.sort((a, b) => a - b), notes };
}

/** Transpose the notes (and hits) starting in a block by semitones. */
export function transposeBlock(p: Project, at: EditAt, block: Block, semis: number) {
  let clamped = false;
  for (const id of block.trackIds) {
    const t = target(p, at, id);
    if (typeof t === "string") continue;
    const { steps, notes } = inBlock(t, block.from, block.to);
    if (t.track.mode === "hits") {
      for (const i of steps) {
        const s = t.lane.steps[i];
        if (!s.on) continue;
        const next = Math.max(-12, Math.min(12, s.pitch + semis));
        clamped ||= next !== s.pitch + semis;
        s.pitch = next;
      }
      continue;
    }
    for (const x of notes) {
      const pitch = x.note.pitch + semis;
      if (pitch < 0 || pitch > 127) {
        clamped = true;
        continue;
      }
      const step = t.lane.steps[x.step];
      if (step.notes?.some((o) => o !== x.note && o.pitch === pitch)) continue;
      x.note.pitch = pitch;
    }
    for (const i of steps) t.lane.steps[i].notes?.sort((a, b) => a.pitch - b.pitch);
  }
  return clamped ? "Some notes were already at the edge" : null;
}

/** Scale the volume of the notes (and hits) starting in a block. */
export function scaleVolume(p: Project, at: EditAt, block: Block, factor: number) {
  for (const id of block.trackIds) {
    const t = target(p, at, id);
    if (typeof t === "string") continue;
    const { steps, notes } = inBlock(t, block.from, block.to);
    const scale = (v: number) => fromVolume(Math.round(toVolume(v) * factor));
    if (t.track.mode === "hits")
      for (const i of steps) t.lane.steps[i].velocity = scale(t.lane.steps[i].velocity);
    else {
      for (const x of notes) x.note.velocity = scale(x.note.velocity);
      for (const i of steps) {
        const s = t.lane.steps[i];
        if (s.notes?.length) s.velocity = Math.max(...s.notes.map((x) => x.velocity));
      }
    }
  }
  return null;
}

/** What a column of the interpolation is: a note column's volume, a command, or a lock. */
export type InterpolateWhat =
  | { kind: "volume"; col: number }
  | { kind: "fx"; letter: FxLetter }
  | { kind: "lock"; key: string };

/**
 * Interpolate a column from the block's first value to its last, on the rows in between that
 * have something to set (notes for volumes, steps for commands and locks).
 */
export function interpolate(
  p: Project,
  at: EditAt,
  trackId: string,
  block: Block,
  what: InterpolateWhat,
) {
  const t = target(p, at, trackId);
  if (typeof t === "string") return t;
  const { steps, notes } = inBlock(t, block.from, block.to);
  type Item = { row: number; get: () => number | undefined; set: (v: number) => void };
  const items: Item[] = [];
  if (what.kind === "volume") {
    if (t.track.mode === "hits")
      for (const i of steps) {
        const s = t.lane.steps[i];
        if (s.on)
          items.push({ row: i * t.grid.k, get: () => s.velocity, set: (v) => (s.velocity = v) });
      }
    else
      for (const x of notes.filter((x) => x.col === what.col))
        items.push({ row: x.start, get: () => x.note.velocity, set: (v) => (x.note.velocity = v) });
  } else if (what.kind === "lock") {
    for (const i of steps) {
      const s = t.lane.steps[i];
      items.push({
        row: i * t.grid.k,
        get: () => s.locks?.[what.key],
        set: (v) => (s.locks = { ...s.locks, [what.key]: v }),
      });
    }
  } else {
    const field = FX_FIELDS[what.letter];
    if (!field) return "That command has no value to interpolate";
    for (const i of steps) {
      const s = t.lane.steps[i];
      items.push({
        row: i * t.grid.k,
        get: () =>
          stepFx(s, t.track).some((c) => c[0] === what.letter) ? field.get(s) : undefined,
        set: (v) => field.set(s, v),
      });
    }
  }
  const valued = items.filter((i) => i.get() !== undefined).sort((a, b) => a.row - b.row);
  if (valued.length < 2) return "Interpolating needs a value on the block's first and last rows";
  const a = valued[0];
  const b = valued[valued.length - 1];
  const va = a.get()!;
  const vb = b.get()!;
  for (const i of items) {
    if (i.row < a.row || i.row > b.row) continue;
    i.set(va + ((vb - va) * (i.row - a.row)) / (b.row - a.row || 1));
  }
  if (what.kind === "volume" && t.track.mode === "notes")
    for (const i of steps) {
      const s = t.lane.steps[i];
      if (s.notes?.length) s.velocity = Math.max(...s.notes.map((x) => x.velocity));
    }
  return null;
}

/** The commands whose value can be interpolated, as a number on the step. */
const FX_FIELDS: Partial<
  Record<FxLetter, { get: (s: Step) => number; set: (s: Step, v: number) => void }>
> = {
  N: { get: (s) => s.nudge, set: (s, v) => (s.nudge = v) },
  Y: { get: (s) => s.probability, set: (s, v) => (s.probability = v) },
  R: { get: (s) => s.ratchet, set: (s, v) => (s.ratchet = Math.round(v)) },
  E: { get: (s) => s.gate, set: (s, v) => (s.gate = v) },
};

// ---------- the clipboard ----------

/** A copied block: per track, its steps and the notes that start in it, by row from the top. */
export interface TrackerClip {
  rows: number;
  tracks: {
    mode: "hits" | "notes";
    hitNote: number;
    /** Step fields (without notes), by row. */
    steps: { row: number; step: Step }[];
    notes: { row: number; length: number; note: Note }[];
  }[];
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function copyBlock(
  p: Project,
  at: EditAt,
  block: Block,
  hitNote: (t: Track) => number,
): TrackerClip {
  const out: TrackerClip = { rows: block.to - block.from + 1, tracks: [] };
  for (const id of block.trackIds) {
    const t = target(p, at, id);
    if (typeof t === "string") continue;
    const { steps, notes } = inBlock(t, block.from, block.to);
    const base = rowPlace(t.grid, block.from)!.row;
    out.tracks.push({
      mode: t.track.mode as "hits" | "notes",
      hitNote: hitNote(t.track),
      steps: steps.map((i) => {
        const { notes: _, ...rest } = clone(t.lane.steps[i]);
        return { row: i * t.grid.k - base, step: rest as Step };
      }),
      notes: notes.map((x) => ({
        row: x.start - base,
        length: x.end - x.start,
        note: clone(x.note),
      })),
    });
  }
  return out;
}

/** Clear the notes and steps in a block (Cut). */
export function clearBlock(p: Project, at: EditAt, block: Block) {
  for (const id of block.trackIds) {
    const t = target(p, at, id);
    if (typeof t === "string") continue;
    const { steps, notes } = inBlock(t, block.from, block.to);
    for (const x of notes) removeNote(t.lane, { step: x.step, pitch: x.note.pitch });
    for (const i of steps) t.lane.steps[i] = emptyStep();
  }
  return null;
}

/**
 * Paste a clip at a row into tracks from `trackIds` on (one clip track per track). `mix`: only
 * into empty places (steps that are off, rows without a note in that column).
 */
export function pasteBlock(
  p: Project,
  at: EditAt,
  clip: TrackerClip,
  trackIds: string[],
  row: number,
  mix: boolean,
) {
  clip.tracks.forEach((src, i) => {
    const id = trackIds[i];
    if (!id) return;
    const t = target(p, at, id);
    if (typeof t === "string") return;
    const base = rowPlace(t.grid, row)!.row;
    const toStep = (r: number) => {
      const lr = base + r;
      return lr % t.grid.k === 0 && lr / t.grid.k < t.grid.length ? lr / t.grid.k : undefined;
    };
    if (!mix) {
      const end = base + clip.rows - 1;
      clearBlock(p, at, { trackIds: [id], from: row, to: row + (end - base) });
    }
    for (const s of src.steps) {
      const i = toStep(s.row);
      if (i === undefined) continue;
      const step = t.lane.steps[i];
      if (mix && step.on) continue;
      const notes = step.notes;
      Object.assign(step, emptyStep(), clone(s.step));
      if (notes) step.notes = notes;
      if (t.track.mode === "hits" && src.mode === "notes") {
        // a pasted note becomes the hit (its pitch against this track's hit note)
        const first = src.notes.find((x) => x.row === s.row);
        step.on = !!first;
        if (first) step.pitch = hitPitch(t.track, first.note.pitch).pitch;
      } else if (t.track.mode === "notes") step.on = !!notes?.length;
    }
    if (t.track.mode === "notes") {
      const placed = placeNotes(t.lane, t.grid);
      const fromHits = src.mode === "hits";
      const list: { row: number; length: number; note: Note }[] = fromHits
        ? src.steps
            .filter((s) => s.step.on)
            .map((s) => ({
              row: s.row,
              length: t.grid.k,
              note: { pitch: src.hitNote + s.step.pitch, length: 1, velocity: s.step.velocity },
            }))
        : src.notes;
      for (const x of list) {
        const lr = base + x.row;
        if (lr >= t.grid.laneRows) continue;
        const col = x.note.col ?? 0;
        if (mix && placed.some((o) => o.col === col && o.start <= lr && o.end > lr)) continue;
        let step = Math.round(lr / t.grid.k);
        if (step >= t.grid.length) step = t.grid.length - 1;
        const offset = lr / t.grid.k - step;
        const note: Note = { ...clone(x.note), length: x.length / t.grid.k };
        if (Math.abs(offset) > 1e-9) note.offset = offset;
        else delete note.offset;
        addNote(t.lane, step, note);
      }
    }
  });
  return null;
}
