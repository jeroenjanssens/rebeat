/**
 * Timeline edits (D184): sections (order, copies, clones, repeats, settings), tempo changes,
 * automation and regions. Each is one commit; drags pass a merge key.
 */
import { anchoredTo, snapStep, toAnchor, toSong } from "../model/arrangement";
import { laneSteps, laneValueAt } from "../model/automation";
import { steppedPoints } from "../model/steppedLanes";
import type { Ease } from "../model/ease";
import { uid } from "../model/id";
import {
  addTrack,
  cloneSlot,
  copySlot,
  deleteSlot,
  makeTrack,
  type Project,
} from "../model/project";
import { clampBpm, tempoAt, tempoMap } from "../model/tempoMap";
import { getBuffer, sampleInfo } from "../engine/samples";
import { loadSample, sampleName } from "../library/library";
import type { AutomationLane, AutomationPoint, Section } from "../model/types";
import { toast } from "../components/Toast";
import { useStore } from "./store";

const store = () => useStore.getState();
const sectionOf = (p: Project, id: string) => p.slots.find((s) => s.id === id);

// ---------- sections ----------

/**
 * Move sections to before index `to` (in the order without them), or put copies or clones of
 * them there. Their automation, tempo changes and regions go with them (D187).
 */
export function moveSections(ids: string[], to: number, mode: "move" | "copy" | "clone") {
  let made: string[] = [];
  store().commit((p) => {
    const order = p.slots.filter((s) => ids.includes(s.id)).map((s) => s.id);
    if (mode === "move") {
      const moving = p.slots.filter((s) => ids.includes(s.id));
      const rest = p.slots.filter((s) => !ids.includes(s.id));
      const before = p.slots.slice(0, to).filter((s) => !ids.includes(s.id)).length;
      rest.splice(before, 0, ...moving);
      p.slots = rest;
      return;
    }
    // copies or clones: made after the last one, then moved to the drop place
    made = order.map((id) => (mode === "copy" ? copySlot : cloneSlot)(p, id));
    const fresh = p.slots.filter((s) => made.includes(s.id));
    const rest = p.slots.filter((s) => !made.includes(s.id));
    const before = Math.min(to, rest.length);
    rest.splice(before, 0, ...fresh);
    p.slots = rest;
  });
  if (made.length) store().setUi({ editSlotId: made[0], selectedSteps: {} });
  return made;
}

/** Copies or clones of the sections right after the last of them (⌘D / ⇧⌘D). */
export function duplicateSections(ids: string[], linked: boolean) {
  const last = Math.max(...ids.map((id) => store().project.slots.findIndex((s) => s.id === id)));
  return moveSections(ids, last + 1, linked ? "clone" : "copy");
}

/** Delete sections (never the last one); the toast says what went with them. */
export function deleteSections(ids: string[]) {
  const { project, editSlotId, playSlotId } = store();
  const doomed = ids.filter((id) => sectionOf(project, id)).slice(0, project.slots.length - 1);
  if (!doomed.length) return;
  const counts = doomed.map((id) => anchoredTo(project, id));
  const points = counts.reduce((n, c) => n + c.points, 0);
  const tempo = counts.reduce((n, c) => n + c.tempo, 0);
  const regions = counts.reduce((n, c) => n + c.regions, 0);
  const left = project.slots.filter((s) => !doomed.includes(s.id));
  const firstIndex = project.slots.findIndex((s) => doomed.includes(s.id));
  const next = left[Math.max(0, Math.min(left.length - 1, firstIndex - 1))].id;
  store().commit((p) => {
    for (const id of doomed) deleteSlot(p, id);
  });
  store().setUi({
    ...(doomed.includes(editSlotId) ? { editSlotId: next, selectedSteps: {} } : {}),
    ...(doomed.includes(playSlotId) ? { playSlotId: next } : {}),
    startAt: null,
  });
  const extra = [
    regions && `${regions} audio clip${regions > 1 ? "s" : ""}`,
    points && `${points} automation point${points > 1 ? "s" : ""}`,
    tempo && `${tempo} tempo change${tempo > 1 ? "s" : ""}`,
  ].filter(Boolean);
  const what = doomed.length > 1 ? `${doomed.length} sections` : "the section";
  toast(
    extra.length
      ? `Deleted ${what} with ${extra.join(" and ")} · ⌘Z brings them back`
      : `Deleted ${what} · ⌘Z brings it back`,
  );
}

export function setRepeats(slotId: string, repeats: number) {
  store().commit((p) => {
    const s = sectionOf(p, slotId);
    if (s) s.repeats = Math.max(1, Math.min(64, Math.round(repeats)));
  }, `repeats-${slotId}`);
}

/** Play only the first `steps` steps (undefined: all of them). */
export function setSectionSteps(slotId: string, steps: number | undefined) {
  store().commit((p) => {
    const s = sectionOf(p, slotId);
    if (!s) return;
    const n = p.patterns[s.patternId].stepCount;
    if (steps === undefined || steps >= n) delete s.steps;
    else s.steps = Math.max(1, Math.round(steps));
  }, `steps-${slotId}`);
}

/** Mute a track in this section only (D183), or unmute it there. */
export function toggleMuteHere(slotId: string, trackId: string) {
  store().commit((p) => {
    const s = sectionOf(p, slotId);
    if (!s) return;
    const mutes = new Set(s.mutes ?? []);
    if (mutes.has(trackId)) mutes.delete(trackId);
    else mutes.add(trackId);
    if (mutes.size) s.mutes = [...mutes];
    else delete s.mutes;
  });
}

export function setSectionTranspose(slotId: string, semis: number) {
  store().commit((p) => {
    const s = sectionOf(p, slotId);
    if (!s) return;
    const t = Math.max(-12, Math.min(12, Math.round(semis)));
    if (t) s.transpose = t;
    else delete s.transpose;
  });
}

export function setSectionFill(slotId: string, fill: Section["fill"]) {
  store().commit((p) => {
    const s = sectionOf(p, slotId);
    if (!s) return;
    if (fill) s.fill = fill;
    else delete s.fill;
  });
}

/** Clear a section's own settings: it plays exactly as its pattern again. */
export function clearSectionSettings(slotId: string) {
  store().commit((p) => {
    const s = sectionOf(p, slotId);
    if (!s) return;
    delete s.mutes;
    delete s.transpose;
    delete s.fill;
    delete s.steps;
  });
}

/** What a section changes, in words ("2 tracks muted · +2 · fill on the last repeat"). */
export function sectionSummary(p: Project, s: Section): string[] {
  const out: string[] = [];
  if (s.mutes?.length) {
    const names = s.mutes.map((id) => p.tracks.find((t) => t.id === id)?.name).filter(Boolean);
    out.push(`${names.length} muted: ${names.join(", ")}`);
  }
  if (s.transpose) out.push(`${s.transpose > 0 ? "+" : ""}${s.transpose} semitones`);
  if (s.fill) out.push(s.fill === "last" ? "fill on the last repeat" : "fill on every repeat");
  if (s.steps) out.push(`plays ${s.steps} of ${p.patterns[s.patternId].stepCount} steps`);
  return out;
}

// ---------- tempo changes (D192) ----------

export function setStartTempo(bpm: number) {
  store().commit((p) => void (p.bpm = Math.round(clampBpm(bpm) * 10) / 10), "bpm");
}

/** A tempo change at song position q (snapped by the caller); returns its index. */
export function addTempoChange(q: number, bpm: number, ramp = false): number {
  let index = 0;
  store().commit((p) => {
    p.tempo ??= [];
    index = p.tempo.push({ ...toAnchor(p, q), bpm: Math.round(clampBpm(bpm) * 10) / 10, ramp }) - 1;
  });
  return index;
}

export function moveTempoChange(index: number, q: number, bpm: number, key: string) {
  store().commit((p) => {
    const t = p.tempo?.[index];
    if (!t) return;
    Object.assign(t, toAnchor(p, q), { bpm: Math.round(clampBpm(bpm) * 10) / 10 });
  }, key);
}

export function setTempoRamp(index: number, ramp: boolean) {
  store().commit((p) => {
    const t = p.tempo?.[index];
    if (!t) return;
    if (ramp) t.ramp = true;
    else delete t.ramp;
  });
}

/** Eases of tempo changes (D198); Linear clears it. */
export function setTempoEase(indexes: number[], side: "in" | "out", ease: Ease) {
  store().commit((p) => {
    for (const i of indexes) {
      const t = p.tempo?.[i];
      if (!t) continue;
      if (ease.type === "linear") delete t[side];
      else t[side] = { ...ease };
    }
  }, `tempo-ease-${side}`);
}

export function setTempoOn(indexes: number[], on: boolean) {
  store().commit((p) => {
    for (const i of indexes) {
      const t = p.tempo?.[i];
      if (!t) continue;
      if (on) delete t.on;
      else t.on = false;
    }
  });
}

export function setTempoBpm(indexes: number[], bpm: number, key: string) {
  store().commit((p) => {
    for (const i of indexes) if (p.tempo?.[i]) p.tempo[i].bpm = Math.round(clampBpm(bpm) * 10) / 10;
  }, key);
}

export function moveTempoBy(indexes: number[], dq: number, key: string) {
  store().commit((p) => {
    for (const i of indexes) {
      const t = p.tempo?.[i];
      const q = t ? toSong(p, t) : null;
      if (t && q !== null) Object.assign(t, toAnchor(p, Math.max(0, q + dq)));
    }
  }, key);
}

/** A tempo change at q at the tempo there, a ramp if the tempo is ramping there (D202). */
export function insertTempoOnCurve(q: number): number {
  const { project } = store();
  const bpm = tempoAt(project, q);
  const ramping = tempoMap(project).some((s) => s.q < q && s.end > q && s.bpm !== s.to);
  return addTempoChange(q, Math.round(bpm * 10) / 10, ramping);
}

/** Delete several tempo changes in one step. */
export function deleteTempoChanges(indexes: number[]) {
  store().commit((p) => {
    p.tempo = p.tempo?.filter((_, i) => !indexes.includes(i));
    if (p.tempo && !p.tempo.length) delete p.tempo;
  });
}

export function deleteTempoChange(index: number) {
  store().commit((p) => {
    p.tempo?.splice(index, 1);
    if (p.tempo && !p.tempo.length) delete p.tempo;
  });
}

// ---------- automation (D186) ----------

/** The lane for a target (made if needed, with a point at q at `value`); returns its id. */
export function automate(target: string, q: number, value: number): string {
  const existing = store().project.automation?.find((l) => l.target === target);
  if (existing) return existing.id;
  const lane: AutomationLane = { id: uid("auto"), target, on: true, points: [] };
  const steps = laneSteps(store().project, target);
  if (steps) value = snapStep(value, steps);
  store().commit((p) => {
    p.automation ??= [];
    p.automation.push({ ...lane, points: [{ ...toAnchor(p, q), value }] });
  });
  return lane.id;
}

const laneOf = (p: Project, id: string) => p.automation?.find((l) => l.id === id);

/** A lane's number of values (D229), from the project outside a recipe (0: smooth). */
function stepsOf(laneId: string): number {
  const { project } = store();
  const l = laneOf(project, laneId);
  return l ? laneSteps(project, l.target) : 0;
}

/** A value for a lane: on its band when the lane is stepped. */
const valueFor = (steps: number, v: number) => (steps ? snapStep(v, steps) : clamp01(v));

/** A stepped lane's point has no eases (D230): they're dropped when it's edited. */
function plain(pt: AutomationPoint, steps: number) {
  if (!steps) return;
  delete pt.in;
  delete pt.out;
}

export function addPoint(laneId: string, q: number, value: number): number {
  let index = -1;
  const steps = stepsOf(laneId);
  store().commit((p) => {
    const l = laneOf(p, laneId);
    if (l) index = l.points.push({ ...toAnchor(p, q), value: valueFor(steps, value) }) - 1;
  });
  return index;
}

export function movePoint(laneId: string, index: number, q: number, value: number, key: string) {
  const steps = stepsOf(laneId);
  store().commit((p) => {
    const pt = laneOf(p, laneId)?.points[index];
    if (!pt) return;
    Object.assign(pt, toAnchor(p, q), { value: valueFor(steps, value) });
    plain(pt, steps);
  }, key);
}

/** Eases on one side of points (D196); Linear clears it (the default). */
export function setPointEase(laneId: string, indexes: number[], side: "in" | "out", ease: Ease) {
  // a stepped lane has no eases (D230)
  if (stepsOf(laneId)) return;
  store().commit((p) => {
    const l = laneOf(p, laneId);
    if (!l) return;
    for (const i of indexes) {
      const pt = l.points[i];
      if (!pt) continue;
      if (ease.type === "linear") delete pt[side];
      else pt[side] = { ...ease };
    }
  }, `ease-${laneId}-${side}`);
}

/** Points on or off (D196): off, the curve skips them. */
export function setPointsOn(laneId: string, indexes: number[], on: boolean) {
  store().commit((p) => {
    const l = laneOf(p, laneId);
    if (!l) return;
    for (const i of indexes) {
      const pt = l.points[i];
      if (!pt) continue;
      if (on) delete pt.on;
      else pt.on = false;
    }
  });
}

/** The same value on several points (the table's multi-select). */
export function setPointsValue(laneId: string, indexes: number[], value: number, key: string) {
  const steps = stepsOf(laneId);
  store().commit((p) => {
    const l = laneOf(p, laneId);
    if (!l) return;
    for (const i of indexes)
      if (l.points[i]) {
        l.points[i].value = valueFor(steps, value);
        plain(l.points[i], steps);
      }
  }, key);
}

/** Move points by `dq` quarter notes, keeping their spacing (re-anchored where they land). */
export function movePointsBy(laneId: string, indexes: number[], dq: number, key: string) {
  store().commit((p) => {
    const l = laneOf(p, laneId);
    if (!l) return;
    for (const i of indexes) {
      const pt = l.points[i];
      const q = pt ? toSong(p, pt) : null;
      if (pt && q !== null) Object.assign(pt, toAnchor(p, Math.max(0, q + dq)));
    }
  }, key);
}

/** A point at q on the curve (its value there), so the line keeps its shape (D202). */
export function insertOnCurve(laneId: string, q: number): number {
  const { project } = store();
  const l = laneOf(project, laneId);
  if (!l) return -1;
  const value = laneValueAt(project, l, q) ?? 0.5;
  return addPoint(laneId, q, value);
}
export function deletePoints(laneId: string, indexes: number[]) {
  store().commit((p) => {
    const l = laneOf(p, laneId);
    if (l) l.points = l.points.filter((_, i) => !indexes.includes(i));
  });
}

export function setLaneOn(laneId: string, on: boolean) {
  store().commit((p) => {
    const l = laneOf(p, laneId);
    if (l) l.on = on;
  });
}

/** Move a lane to another knob (its points stay; values are knob positions, 0..1). */
export function retargetLane(laneId: string, target: string) {
  const { project } = store();
  const before = laneOf(project, laneId);
  const steps = laneSteps(project, target);
  // onto a stepped knob: the points on its bands, where the old curve crossed them (D230)
  const points = before && steps ? steppedPoints(project, before.points, steps) : null;
  store().commit((p) => {
    if (p.automation?.some((l) => l.target === target && l.id !== laneId)) return;
    const l = laneOf(p, laneId);
    if (!l) return;
    l.target = target;
    if (points) l.points = points;
  });
}

export function clearLane(laneId: string) {
  store().commit((p) => {
    const l = laneOf(p, laneId);
    if (l) l.points = [];
  });
}

export function deleteLane(laneId: string) {
  store().commit((p) => {
    p.automation = p.automation?.filter((l) => l.id !== laneId);
    if (p.automation && !p.automation.length) delete p.automation;
  });
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---------- regions (D188) ----------

/** How long a sample plays on the timeline, in quarter notes: a warped clip at its own tempo,
 * else at the song's tempo where it starts. */
export function sampleQuarters(sampleId: string, q: number, warp = true): number {
  const info = sampleInfo(sampleId);
  const seconds = getBuffer(sampleId)?.duration ?? 4;
  const bpm = warp && info?.bpm ? info.bpm : tempoAt(store().project, q);
  return Math.max(0.25, (seconds * bpm) / 60);
}

/** A new Clip track for timeline audio (its sections' clips off), with the sample at q. */
export function addAudioTrack(sampleId: string, q: number): string {
  let trackId = "";
  const count = store().project.tracks.filter((t) => t.name.startsWith("Audio")).length;
  store().commit((p) => {
    const t = makeTrack("clip", "vocal", `Audio ${count + 1}`, sampleName(sampleId), [], {
      source: "sample",
      sampleId,
    });
    addTrack(p, t);
    for (const pattern of Object.values(p.patterns))
      pattern.lanes[t.id].clip = { active: false, launchMode: "loop" };
    p.regions ??= [];
    p.regions.push({
      id: uid("rgn"),
      trackId: t.id,
      sampleId,
      start: toAnchor(p, q),
      length: sampleQuarters(sampleId, q),
      offset: 0,
    });
    trackId = t.id;
  });
  void loadSample(sampleId);
  store().setUi({ selectedTrackId: trackId });
  return trackId;
}

/** A region of a sample at song position q on a Clip track; returns its id. */
export function addRegion(trackId: string, sampleId: string, q: number, length: number): string {
  const id = uid("rgn");
  store().commit((p) => {
    p.regions ??= [];
    p.regions.push({ id, trackId, sampleId, start: toAnchor(p, q), length, offset: 0 });
  });
  return id;
}

const regionOf = (p: Project, id: string) => p.regions?.find((r) => r.id === id);

export function moveRegion(id: string, q: number, key: string, trackId?: string) {
  store().commit((p) => {
    const r = regionOf(p, id);
    if (!r) return;
    r.start = toAnchor(p, q);
    if (trackId) r.trackId = trackId;
  }, key);
}

/** Trim a region: a new start (the left edge moves into the sample too) and length. */
export function trimRegion(id: string, q: number, length: number, offset: number, key: string) {
  store().commit((p) => {
    const r = regionOf(p, id);
    if (!r) return;
    r.start = toAnchor(p, q);
    r.length = Math.max(0.25, length);
    r.offset = Math.max(0, offset);
  }, key);
}

export function setRegion(
  id: string,
  patch: { gain?: number; fadeIn?: number; fadeOut?: number },
  key?: string,
) {
  store().commit((p) => {
    const r = regionOf(p, id);
    if (r) Object.assign(r, patch);
  }, key);
}

export function copyRegion(id: string, q: number): string {
  const nid = uid("rgn");
  store().commit((p) => {
    const r = regionOf(p, id);
    if (r) p.regions!.push({ ...JSON.parse(JSON.stringify(r)), id: nid, start: toAnchor(p, q) });
  });
  return nid;
}

/** Split a region at song position q (the second part starts there). */
export function splitRegion(id: string, q: number, startQ: number, secondsInto: number) {
  store().commit((p) => {
    const r = regionOf(p, id);
    if (!r || q <= startQ || q >= startQ + r.length) return;
    const first = q - startQ;
    p.regions!.push({
      ...JSON.parse(JSON.stringify(r)),
      id: uid("rgn"),
      start: toAnchor(p, q),
      length: r.length - first,
      offset: r.offset + secondsInto,
      fadeIn: undefined,
    });
    r.length = first;
    delete r.fadeOut;
  });
}

export function deleteRegion(id: string) {
  store().commit((p) => {
    p.regions = p.regions?.filter((r) => r.id !== id);
    if (p.regions && !p.regions.length) delete p.regions;
  });
}
