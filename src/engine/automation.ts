/**
 * Automation (D186) and audio on the timeline (D188), step by step: the transport and the
 * offline render call these for every step, so a song sounds the same live and exported.
 */
import { curveAt, lanePoints, toSong, type ResolvedPoint } from "../model/arrangement";
import { isLinear } from "../model/ease";
import type { Project } from "../model/project";
import { secondsBetween } from "../model/tempoMap";
import type { AudioRegion } from "../model/types";
import { isOverridden } from "../state/automationOverride";
import { automateTarget, automationState, startRegion } from "./engine";
import type { AutoEvent } from "./effects";
import { sampleInfo } from "./samples";

const EPS = 1e-6;
/** A jump in a curve (where a held point ends) takes this long: an instant one clicks (a filter
 * that jumps rings). */
const JUMP = 0.003;

/**
 * A curve's events over one step, from song position q0 to q1 (heard from `time` for `dur`
 * seconds): its points inside the step, a jump where an ease out of None ends, the value at the
 * step's end, and with `jumped` (a start, a jump in the song) the value at its start first.
 * Eased stretches (D197) are sampled `samples` times over the step; `linearSamples` adds points
 * on straight stretches too (every target ramps today, D228: none asks for them).
 */
export function curveEvents(
  points: ResolvedPoint[],
  q0: number,
  q1: number,
  time: number,
  dur: number,
  jumped: boolean,
  samples = 8,
  linearSamples = 0,
): AutoEvent[] {
  if (!points.length || q1 <= q0) return [];
  const at = (q: number) => time + ((q - q0) / (q1 - q0)) * dur;
  const out: AutoEvent[] = [];
  if (jumped) out.push({ t: time, v: curveAt(points, q0)!, ramp: false });
  // is the curve shaped anywhere in this step?
  let shaped = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.q < q1 - EPS && b.q > q0 + EPS && a.out?.type !== "none" && !isLinear(a.out, b.in))
      shaped = true;
  }
  const n = shaped ? samples : linearSamples;
  const marks: number[] = [];
  for (let k = 1; k <= n; k++) marks.push(q0 + (k * (q1 - q0)) / (n + 1));
  let m = 0;
  points.forEach((p, i) => {
    if (p.q <= q0 + EPS || p.q > q1 + EPS) return;
    while (m < marks.length && marks[m] < p.q) {
      out.push({ t: at(marks[m]), v: curveAt(points, marks[m])!, ramp: true });
      m++;
    }
    const prev = points[i - 1];
    if (prev?.out?.type === "none") {
      // held until here, then the new value at once (in a few milliseconds)
      out.push({ t: at(p.q) - JUMP, v: prev.value, ramp: true });
      out.push({ t: at(p.q), v: p.value, ramp: true });
    } else out.push({ t: at(p.q), v: p.value, ramp: true });
  });
  for (; m < marks.length; m++)
    out.push({ t: at(marks[m]), v: curveAt(points, marks[m])!, ramp: true });
  out.push({ t: time + dur, v: curveAt(points, q1)!, ramp: true });
  return out;
}

/** Automation for one step of the song: every lane that's on (and not overridden, live). */
export function automationStep(
  project: Project,
  q0: number,
  q1: number,
  time: number,
  dur: number,
) {
  const lanes = project.automation;
  if (!lanes?.length) return;
  const { last, live } = automationState();
  for (const lane of lanes) {
    if (!lane.on || (live && isOverridden(lane.target))) {
      last.delete(lane.id);
      continue;
    }
    const points = lanePoints(project, lane.points);
    if (!points.length) continue;
    const prev = last.get(lane.id);
    const jumped = prev === undefined || Math.abs(prev - q0) > EPS;
    last.set(lane.id, q1);
    automateTarget(lane.target, curveEvents(points, q0, q1, time, dur, jumped));
  }
}

/** Where a region is in the song (null: its section is gone, or it's hidden). */
export function regionSpan(project: Project, r: AudioRegion): { q0: number; q1: number } | null {
  const q0 = toSong(project, r.start);
  return q0 === null ? null : { q0, q1: q0 + r.length };
}

/**
 * The regions of each track in song order, each cut where the next one on its track starts
 * (D188: one at a time).
 */
function trackRegions(project: Project) {
  const by = new Map<string, { r: AudioRegion; q0: number; q1: number }[]>();
  for (const r of project.regions ?? []) {
    const s = regionSpan(project, r);
    if (!s) continue;
    const list = by.get(r.trackId) ?? [];
    list.push({ r, ...s });
    by.set(r.trackId, list);
  }
  for (const list of by.values()) {
    list.sort((a, b) => a.q0 - b.q0);
    for (let i = 0; i < list.length - 1; i++) list[i].q1 = Math.min(list[i].q1, list[i + 1].q0);
  }
  return by;
}

/** The tracks whose timeline audio sounds at song position q (their own clips stay silent). */
export function coveredTracks(project: Project, q: number): Set<string> {
  const out = new Set<string>();
  if (!project.regions?.length) return out;
  for (const [trackId, list] of trackRegions(project))
    if (list.some((x) => x.q0 <= q + EPS && x.q1 > q + EPS)) out.add(trackId);
  return out;
}

/**
 * Start the regions that begin in this step; with `jumped` (a start, a jump), also the ones
 * already playing there, part-way. Seconds into a warped sample run at its own tempo; others at
 * the song's.
 */
export function regionStep(
  project: Project,
  q0: number,
  q1: number,
  time: number,
  dur: number,
  jumped: boolean,
) {
  if (!project.regions?.length) return;
  const at = (q: number) => time + ((q - q0) / (q1 - q0)) * dur;
  for (const [trackId, list] of trackRegions(project)) {
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track || track.mode !== "clip") continue;
    for (const { r, q0: a, q1: b } of list) {
      const starts = a >= q0 - EPS && a < q1 - EPS;
      const inside = jumped && a < q0 - EPS && b > q0 + EPS;
      if (!starts && !inside) continue;
      const from = starts ? a : q0;
      const t = starts ? at(a) : time;
      const until = t + secondsBetween(project, from, b);
      const bpm = sampleInfo(r.sampleId)?.bpm;
      const warp = (track.params["sound.warp"] ?? 1) >= 0.5 && bpm;
      const into =
        from === a ? 0 : warp ? ((from - a) * 60) / bpm : secondsBetween(project, a, from);
      startRegion(track, r, t, into, until);
    }
  }
}
