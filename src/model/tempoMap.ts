/**
 * The tempo map (D192): `project.bpm` is the tempo at the song's start, `project.tempo` the
 * changes after it (jumps, or linear ramps in quarter notes), anchored to sections. Durations are
 * exact integrals of 60 / bpm(q); without changes they're `quarters × 60 / bpm`, as before.
 */
import { isDraft } from "immer";
import { songLength, toSong } from "./arrangement";
import type { Project } from "./project";

export const MIN_BPM = 20;
export const MAX_BPM = 300;

/** A piece of the map: from `q` the tempo goes from `bpm` to `to` (linearly) at `end`. */
export interface TempoSegment {
  q: number;
  end: number;
  bpm: number;
  to: number;
}

const maps = new WeakMap<
  object,
  { slots: Project["slots"]; patterns: Project["patterns"]; bpm: number; segments: TempoSegment[] }
>();

/** The tempo map as segments in song order; the last one runs forever. */
export function tempoMap(project: Project): TempoSegment[] {
  const key = project.tempo ?? project;
  const draft = isDraft(key) || isDraft(project.slots) || isDraft(project.patterns);
  const cached = draft ? undefined : maps.get(key);
  if (
    cached &&
    cached.slots === project.slots &&
    cached.patterns === project.patterns &&
    cached.bpm === project.bpm
  )
    return cached.segments;
  const changes = (project.tempo ?? [])
    .map((t) => ({ q: toSong(project, t), bpm: clampBpm(t.bpm), ramp: !!t.ramp }))
    .filter((t): t is { q: number; bpm: number; ramp: boolean } => t.q !== null)
    .sort((a, b) => a.q - b.q);
  const segments: TempoSegment[] = [];
  let q = 0;
  let bpm = clampBpm(project.bpm);
  for (const c of changes) {
    if (c.ramp) {
      // ramp from the tempo before, starting at the change before
      if (c.q > q) segments.push({ q, end: c.q, bpm, to: c.bpm });
    } else if (c.q > q) segments.push({ q, end: c.q, bpm, to: bpm });
    q = Math.max(q, c.q);
    bpm = c.bpm;
  }
  segments.push({ q, end: Infinity, bpm, to: bpm });
  if (!draft)
    maps.set(key, { slots: project.slots, patterns: project.patterns, bpm: project.bpm, segments });
  return segments;
}

export const clampBpm = (bpm: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Number(bpm) || 120));

export function hasTempoChanges(project: Project): boolean {
  return tempoMap(project).length > 1;
}

function bpmIn(s: TempoSegment, q: number) {
  if (s.to === s.bpm || s.end === Infinity) return s.bpm;
  return s.bpm + ((s.to - s.bpm) * (q - s.q)) / (s.end - s.q);
}

/** The tempo at song position q. */
export function tempoAt(project: Project, q: number): number {
  const map = tempoMap(project);
  for (const s of map) if (q < s.end) return bpmIn(s, Math.max(s.q, q));
  return map[map.length - 1].bpm;
}

/** Seconds of the quarter notes from a to b inside one segment. */
function seconds(s: TempoSegment, a: number, b: number) {
  const b0 = bpmIn(s, a);
  const b1 = bpmIn(s, b);
  if (Math.abs(b1 - b0) < 1e-9) return ((b - a) * 60) / b0;
  // ∫ 60 / bpm(q) dq for a linear bpm(q)
  return ((60 * (b - a)) / (b1 - b0)) * Math.log(b1 / b0);
}

/** Seconds from song position q0 to q1 (q1 ≥ q0). */
export function secondsBetween(project: Project, q0: number, q1: number): number {
  const map = tempoMap(project);
  if (map.length === 1) return ((q1 - q0) * 60) / map[0].bpm;
  let t = 0;
  for (const s of map) {
    const a = Math.max(q0, s.q);
    const b = Math.min(q1, s.end);
    if (b > a) t += seconds(s, a, b);
    if (s.end >= q1) break;
  }
  return t;
}

/** The song position `sec` seconds after the song's start (the inverse of secondsBetween). */
export function quarterAt(project: Project, sec: number): number {
  let t = 0;
  for (const s of tempoMap(project)) {
    const d = s.end === Infinity ? Infinity : seconds(s, s.q, s.end);
    if (t + d >= sec) {
      // bisect inside the segment (monotonic)
      let lo = s.q;
      let hi = s.end === Infinity ? s.q + ((sec - t) * s.bpm) / 60 : s.end;
      if (s.end === Infinity) return hi;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (t + seconds(s, s.q, mid) < sec) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    t += d;
  }
  return 0;
}

/** The song's length in seconds, through the tempo map. */
export function songSeconds(project: Project): number {
  return secondsBetween(project, 0, songLength(project));
}

/** Whether the tempo changes between song positions q0 and q1 (a ramp, or a jump inside). */
export function tempoChangesIn(project: Project, q0: number, q1: number) {
  return tempoMap(project).some(
    (s) => s.q < q1 && s.end > q0 && (s.bpm !== s.to || (s.q > q0 && s.q < q1)),
  );
}
