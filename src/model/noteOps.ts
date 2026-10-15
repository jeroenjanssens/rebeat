/** Note editing on an instrument lane (pure; use inside an immer recipe). */
import type { Note, Lane } from "./types";

export interface NoteRef {
  step: number;
  pitch: number;
}

export interface PlacedNote extends NoteRef {
  note: Note;
}

export const noteKey = (r: NoteRef) => `${r.step}:${r.pitch}`;

export function parseNoteKey(k: string): NoteRef {
  const [step, pitch] = k.split(":").map(Number);
  return { step, pitch };
}

export function listNotes(lane: Lane, length: number): PlacedNote[] {
  const out: PlacedNote[] = [];
  for (let step = 0; step < length; step++)
    for (const note of lane.steps[step].notes ?? []) out.push({ step, pitch: note.pitch, note });
  return out;
}

export function getNote(lane: Lane, r: NoteRef): Note | undefined {
  return lane.steps[r.step]?.notes?.find((n) => n.pitch === r.pitch);
}

export function addNote(lane: Lane, step: number, note: Note) {
  const s = lane.steps[step];
  s.notes = [...(s.notes ?? []).filter((n) => n.pitch !== note.pitch), note].sort(
    (a, b) => a.pitch - b.pitch,
  );
  s.on = true;
  s.velocity = Math.max(...s.notes.map((n) => n.velocity));
}

export function removeNote(lane: Lane, r: NoteRef): Note | undefined {
  const s = lane.steps[r.step];
  const n = s?.notes?.find((x) => x.pitch === r.pitch);
  if (!n) return undefined;
  s.notes = s.notes!.filter((x) => x !== n);
  s.on = s.notes.length > 0;
  return n;
}

/**
 * Move notes by steps and semitones. When `freeOffset` is true (Snap off or Alt held), the
 * movement is in fractional step units (dStep can be non-integer); the note's `offset` is
 * updated to track the sub-step position. Notes stay inside the lane (steps 0..length−1,
 * pitches 0..127); returns the new positions.
 */
export function moveNotes(
  lane: Lane,
  refs: NoteRef[],
  dStep: number,
  dPitch: number,
  length: number,
  freeOffset = false,
): NoteRef[] {
  if (!freeOffset) {
    // Snap mode: integer steps only
    const minStep = Math.min(...refs.map((r) => r.step));
    const maxStep = Math.max(...refs.map((r) => r.step));
    const ds = Math.max(-minStep, Math.min(length - 1 - maxStep, dStep));
    const minP = Math.min(...refs.map((r) => r.pitch));
    const maxP = Math.max(...refs.map((r) => r.pitch));
    const dp = Math.max(-minP, Math.min(127 - maxP, dPitch));
    const moved = refs.map((r) => ({ r, note: removeNote(lane, r) })).filter((x) => x.note);
    return moved.map(({ r, note }) => {
      const to = { step: r.step + ds, pitch: r.pitch + dp };
      addNote(lane, to.step, { ...note!, pitch: to.pitch });
      return to;
    });
  }

  // Free mode: fractional movement, offset carries the sub-step part
  const minExact = Math.min(...refs.map((r) => r.step + (getNote(lane, r)?.offset ?? 0)));
  const maxExact = Math.max(...refs.map((r) => r.step + (getNote(lane, r)?.offset ?? 0)));
  const rawDs = dStep;
  // clamp so no note goes outside 0..length-1
  const clampedDs = Math.max(-minExact, Math.min(length - 1 - maxExact + 0.499, rawDs));
  const minP = Math.min(...refs.map((r) => r.pitch));
  const maxP = Math.max(...refs.map((r) => r.pitch));
  const dp = Math.max(-minP, Math.min(127 - maxP, dPitch));

  const moved = refs.map((r) => ({ r, note: removeNote(lane, r) })).filter((x) => x.note);
  return moved.map(({ r, note }) => {
    const oldOffset = note!.offset ?? 0;
    const exact = r.step + oldOffset + clampedDs;
    const newStep = Math.max(0, Math.min(length - 1, Math.floor(exact)));
    const newOffset = exact - newStep;
    const clampedOffset = Math.max(-0.5, Math.min(0.5, newOffset));
    const adjustedStep = newOffset < -0.5 || newOffset > 0.5 ? Math.round(exact) : newStep;
    const finalOffset = clampedOffset === 0 ? undefined : clampedOffset;
    const to = { step: adjustedStep, pitch: r.pitch + dp };
    addNote(lane, to.step, {
      ...note!,
      pitch: to.pitch,
      ...(finalOffset !== undefined ? { offset: finalOffset } : { offset: undefined }),
    });
    return to;
  });
}

export function resizeNotes(lane: Lane, refs: NoteRef[], length: (old: number) => number) {
  resizeNotesFree(lane, refs, length, 1);
}

/**
 * Free resize: lengths can be fractional (min 0.05). Used when Snap is off or Alt is held.
 */
export function resizeNotesFree(
  lane: Lane,
  refs: NoteRef[],
  length: (old: number) => number,
  minLength = 0.05,
) {
  for (const r of refs) {
    const n = getNote(lane, r);
    if (n) n.length = Math.max(minLength, Math.min(128, length(n.length)));
  }
}

/**
 * Snap notes to the Q grid: move starts to the nearest grid boundary and round lengths to the
 * nearest grid unit (minimum one grid unit).
 */
export function quantizeNotes(lane: Lane, refs: NoteRef[], grid: number) {
  for (const r of refs) {
    const n = getNote(lane, r);
    if (!n) continue;
    // snap start: move to the nearest grid boundary within the step
    const exact = r.step + (n.offset ?? 0);
    const snapped = Math.round(exact / grid) * grid;
    const newStep = Math.max(0, Math.floor(snapped));
    // if the snapped position moved to a different step, we have to move the note
    if (newStep !== r.step) {
      const oldNote = removeNote(lane, r);
      if (oldNote) {
        const snappedLen = Math.max(grid, Math.round(oldNote.length / grid) * grid);
        addNote(lane, newStep, { ...oldNote, length: snappedLen, offset: undefined });
      }
    } else {
      delete n.offset;
      n.length = Math.max(grid, Math.round(n.length / grid) * grid);
    }
  }
}
