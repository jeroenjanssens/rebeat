/** Note editing on an instrument lane (pure; use inside an immer recipe). */
import type { Note, StepLane } from "./types";

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

export function listNotes(lane: StepLane, length: number): PlacedNote[] {
  const out: PlacedNote[] = [];
  for (let step = 0; step < length; step++)
    for (const note of lane.steps[step].notes ?? []) out.push({ step, pitch: note.pitch, note });
  return out;
}

export function getNote(lane: StepLane, r: NoteRef): Note | undefined {
  return lane.steps[r.step]?.notes?.find((n) => n.pitch === r.pitch);
}

export function addNote(lane: StepLane, step: number, note: Note) {
  const s = lane.steps[step];
  s.notes = [...(s.notes ?? []).filter((n) => n.pitch !== note.pitch), note].sort(
    (a, b) => a.pitch - b.pitch,
  );
  s.on = true;
  s.velocity = Math.max(...s.notes.map((n) => n.velocity));
}

export function removeNote(lane: StepLane, r: NoteRef): Note | undefined {
  const s = lane.steps[r.step];
  const n = s?.notes?.find((x) => x.pitch === r.pitch);
  if (!n) return undefined;
  s.notes = s.notes!.filter((x) => x !== n);
  s.on = s.notes.length > 0;
  return n;
}

/**
 * Move notes by whole steps and semitones. Notes stay inside the lane (steps 0..length-1,
 * pitches 0..127); returns the new positions.
 */
export function moveNotes(
  lane: StepLane,
  refs: NoteRef[],
  dStep: number,
  dPitch: number,
  length: number,
): NoteRef[] {
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

export function resizeNotes(lane: StepLane, refs: NoteRef[], length: (old: number) => number) {
  for (const r of refs) {
    const n = getNote(lane, r);
    if (n) n.length = Math.max(1, Math.min(128, length(n.length)));
  }
}
