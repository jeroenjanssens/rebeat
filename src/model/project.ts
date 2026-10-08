import { current, isDraft, type Draft } from "immer";
import { CATEGORY_COLOR, LINK_COLORS } from "./colors";
import type { Bus, Master } from "./effects";
import { uid } from "./id";
import { MIX_PARAMS, SOUND_PARAMS, defaultParams, toUnit } from "./params";
import {
  MAX_STEPS,
  emptyStep,
  laneLength,
  type ClipLane,
  type Lane,
  type PageSlot,
  type Pattern,
  type SoundCategory,
  type Step,
  type StepLane,
  type Track,
  type TrackKind,
} from "./types";

export interface Project {
  name: string;
  bpm: number;
  /** Beats per bar and beat unit, e.g. [4, 4], [6, 8]. */
  timeSignature: [number, number];
  /** Global swing (0.5 = straight .. 0.75). */
  swing: number;
  metronome: boolean;
  countIn: boolean;
  tracks: Track[];
  patterns: Record<string, Pattern>;
  slots: PageSlot[];
  /** Send/return buses (A = reverb, B = delay by default). */
  buses: Bus[];
  master: Master;
  /** Project key, for note names, in-scale highlighting and scale lock. */
  key: { root: number; scale: string };
  /** MIDI learn: controllers mapped to parameters. */
  midiMappings: MidiMapping[];
  /** Performance: mute groups (track ids) and crossfader sides. */
  perf: PerfSetup;
  /** Loop the page being edited, or play the pages in song order (D73). */
  playMode: PlayMode;
}

export type PlayMode = "loop" | "song";

export interface MidiMapping {
  id: string;
  /** "cc" for controllers, "note" for buttons/pads. */
  type: "cc" | "note";
  channel: number; // 0..15
  number: number; // CC or note number
  /** Device name it was learned from ("" = any). */
  device: string;
  /** e.g. "track:<id>:sound.cutoff", "track:<id>:volume", "master:volume", "command:transport.toggle" */
  target: string;
  label: string;
}

export interface PerfSetup {
  muteGroups: { name: string; tracks: string[] }[];
  /** Track id → crossfader side. */
  crossfade: Record<string, "A" | "B">;
}

/** structuredClone that also works on immer drafts. */
function deepClone<T>(value: T): T {
  return structuredClone(isDraft(value) ? (current(value as Draft<T>) as T) : value);
}

// ---------- construction ----------

export function emptyLane(kind: TrackKind): Lane {
  if (kind === "audio")
    return { kind: "clip", active: false, launchMode: "loop" } satisfies ClipLane;
  return { kind: "steps", steps: Array.from({ length: MAX_STEPS }, emptyStep) } satisfies StepLane;
}

export function makeTrack(
  kind: TrackKind,
  category: SoundCategory,
  name: string,
  source: string,
  effects: Track["effects"] = [],
): Track {
  return {
    id: uid("trk"),
    name,
    kind,
    category,
    color: CATEGORY_COLOR[category],
    source,
    mute: false,
    solo: false,
    arm: false,
    volume: 0.8,
    params: {
      ...prefixed("sound", defaultParams(SOUND_PARAMS[kind])),
      ...prefixed("mix", defaultParams(MIX_PARAMS.filter((p) => p.id !== "volume"))),
    },
    effects,
  };
}

function prefixed(prefix: string, values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [`${prefix}.${k}`, v]));
}

export function makePattern(project: Project, name: string, stepCount = 16): Pattern {
  const used = new Set(Object.values(project.patterns).map((p) => p.linkColor));
  return {
    id: uid("pat"),
    name,
    linkColor: LINK_COLORS.find((c) => !used.has(c)) ?? LINK_COLORS[0],
    stepCount,
    stepSize: "1/16",
    lanes: Object.fromEntries(project.tracks.map((t) => [t.id, emptyLane(t.kind)])),
  };
}

// ---------- queries ----------

export function slotPattern(project: Project, slotId: string): Pattern {
  const slot = project.slots.find((s) => s.id === slotId) ?? project.slots[0];
  return project.patterns[slot.patternId];
}

export function linkCount(project: Project, patternId: string): number {
  return project.slots.filter((s) => s.patternId === patternId).length;
}

// ---------- page operations (mutating; use inside an immer recipe) ----------

function clonePattern(project: Project, source: Pattern, name: string): Pattern {
  const copy: Pattern = deepClone(source);
  copy.id = uid("pat");
  copy.name = name;
  const used = new Set(Object.values(project.patterns).map((p) => p.linkColor));
  copy.linkColor = LINK_COLORS.find((c) => !used.has(c)) ?? LINK_COLORS[0];
  return copy;
}

function insertSlotAfter(project: Project, afterSlotId: string, slot: PageSlot) {
  const i = project.slots.findIndex((s) => s.id === afterSlotId);
  project.slots.splice(i + 1, 0, slot);
}

/** An independent page with duplicated content, inserted after the source. */
export function copySlot(project: Project, slotId: string): string {
  const source = slotPattern(project, slotId);
  const pattern = clonePattern(project, source, `${source.name} copy`);
  project.patterns[pattern.id] = pattern;
  const slot: PageSlot = { id: uid("slot"), patternId: pattern.id, repeats: 1 };
  insertSlotAfter(project, slotId, slot);
  return slot.id;
}

/** A linked page: a new slot that points to the same pattern. */
export function cloneSlot(project: Project, slotId: string): string {
  const source = project.slots.find((s) => s.id === slotId)!;
  const slot: PageSlot = { id: uid("slot"), patternId: source.patternId, repeats: source.repeats };
  insertSlotAfter(project, slotId, slot);
  return slot.id;
}

/** Turn a clone into an independent copy. */
export function unlinkSlot(project: Project, slotId: string) {
  const slot = project.slots.find((s) => s.id === slotId)!;
  if (linkCount(project, slot.patternId) < 2) return;
  const pattern = clonePattern(
    project,
    project.patterns[slot.patternId],
    project.patterns[slot.patternId].name,
  );
  project.patterns[pattern.id] = pattern;
  slot.patternId = pattern.id;
}

export function newSlot(project: Project, afterSlotId: string): string {
  const current = slotPattern(project, afterSlotId);
  const pattern = makePattern(project, `Page ${project.slots.length + 1}`, current.stepCount);
  pattern.stepSize = current.stepSize;
  project.patterns[pattern.id] = pattern;
  const slot: PageSlot = { id: uid("slot"), patternId: pattern.id, repeats: 1 };
  insertSlotAfter(project, afterSlotId, slot);
  return slot.id;
}

export function deleteSlot(project: Project, slotId: string) {
  if (project.slots.length < 2) return;
  const i = project.slots.findIndex((s) => s.id === slotId);
  const [slot] = project.slots.splice(i, 1);
  if (linkCount(project, slot.patternId) === 0) delete project.patterns[slot.patternId];
}

/** ×2: double the page length and duplicate its contents. */
export function doublePattern(pattern: Pattern) {
  const n = pattern.stepCount;
  if (n * 2 > MAX_STEPS) return;
  for (const lane of Object.values(pattern.lanes)) {
    if (lane.kind !== "steps" || lane.stepCountOverride) continue;
    for (let i = 0; i < n; i++) lane.steps[n + i] = deepClone(lane.steps[i]);
  }
  pattern.stepCount = n * 2;
}

export function halvePattern(pattern: Pattern) {
  pattern.stepCount = Math.max(1, Math.floor(pattern.stepCount / 2));
}

// ---------- lane operations ----------

export function rotateLane(lane: StepLane, length: number, by: number) {
  const window = lane.steps.slice(0, length);
  for (let i = 0; i < length; i++) lane.steps[i] = window[(i - by + length * 8) % length];
}

export function reverseLane(lane: StepLane, length: number) {
  const window = lane.steps.slice(0, length).reverse();
  for (let i = 0; i < length; i++) lane.steps[i] = window[i];
}

export function clearLane(lane: StepLane) {
  for (let i = 0; i < lane.steps.length; i++) lane.steps[i] = emptyStep();
}

export function randomizeLane(
  lane: StepLane,
  length: number,
  density = 0.35,
  velocityOnly = false,
) {
  for (let i = 0; i < length; i++) {
    const s = lane.steps[i];
    if (!velocityOnly) s.on = Math.random() < density;
    s.velocity = 0.45 + Math.random() * 0.55;
  }
}

/** Euclidean rhythm: `pulses` hits spread as evenly as possible over `length` steps. */
export function euclid(pulses: number, length: number, rotation = 0): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < length; i++) {
    const j = (i - rotation + length) % length;
    out.push((j * pulses) % length < pulses);
  }
  return out;
}

export function applyPattern(lane: StepLane, hits: boolean[]) {
  hits.forEach((on, i) => (lane.steps[i].on = on));
}

export { laneLength };

// ---------- track operations ----------

export function addTrack(project: Project, track: Track, index = project.tracks.length) {
  project.tracks.splice(index, 0, track);
  for (const p of Object.values(project.patterns)) p.lanes[track.id] = emptyLane(track.kind);
}

export function duplicateTrack(project: Project, trackId: string): string {
  const i = project.tracks.findIndex((t) => t.id === trackId);
  const copy: Track = { ...deepClone(project.tracks[i]), id: uid("trk") };
  copy.name = `${copy.name} 2`;
  project.tracks.splice(i + 1, 0, copy);
  for (const p of Object.values(project.patterns)) p.lanes[copy.id] = deepClone(p.lanes[trackId]);
  return copy.id;
}

export function deleteTrack(project: Project, trackId: string) {
  project.tracks = project.tracks.filter((t) => t.id !== trackId);
  for (const p of Object.values(project.patterns)) delete p.lanes[trackId];
}

export function stepAt(pattern: Pattern, trackId: string, index: number): Step | undefined {
  const lane = pattern.lanes[trackId];
  return lane?.kind === "steps" ? lane.steps[index] : undefined;
}

/**
 * Change a track's type. Step data carries over between drum and instrument tracks, and so does
 * the sample (D76): a drum or audio track becomes a keyboard sampler of its sample (rooted at C4,
 * with its tune as transpose, so it sounds the same); a sampler gives its sample back.
 * `nameOf` names a sample for the track's source label.
 */
export function convertTrack(
  project: Project,
  trackId: string,
  kind: TrackKind,
  nameOf: (sampleId: string) => string = (id) => id,
) {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track || track.kind === kind) return;
  const from = track.kind;
  const tune = Math.round(toUnit.semis(24)(track.params["sound.tune"] ?? 0.5));
  track.kind = kind;
  for (const key of Object.keys(track.params))
    if (key.startsWith("sound.")) delete track.params[key];
  Object.assign(track.params, prefixed("sound", defaultParams(SOUND_PARAMS[kind])));
  if (kind === "instrument") {
    const sampleId = track.sampleId;
    if (sampleId) {
      track.instrument = { source: "sampler", preset: "sampler", sampleId, rootNote: 60 };
      track.source = `Sampler · ${nameOf(sampleId)}`;
      if (tune) track.transpose = tune;
    } else track.source = "Poly · Init";
  } else if (from === "instrument") {
    const sampler = track.instrument?.source === "sampler" ? track.instrument.sampleId : undefined;
    // a sampler hands its sample over; a synth goes back to the sample the track had before
    if (sampler) track.sampleId = sampler;
    if (track.transpose && kind === "drum")
      track.params["sound.tune"] = Math.min(1, Math.max(0, 0.5 + track.transpose / 48));
    delete track.instrument;
    delete track.transpose;
    delete track.arp;
    track.source = track.sampleId ? nameOf(track.sampleId) : "";
  }
  for (const p of Object.values(project.patterns)) {
    const lane = p.lanes[trackId];
    if (!lane) continue;
    if (lane.kind === "steps" && kind !== "audio") {
      for (const s of lane.steps) {
        if (kind === "instrument" && from === "drum" && s.on) {
          s.notes = [{ pitch: 60 + s.pitch, length: 1, velocity: s.velocity }];
        }
        if (kind === "drum") {
          delete s.notes;
        }
      }
    } else p.lanes[trackId] = emptyLane(kind);
  }
}

/** The key in effect on a page: its own override, or the project key. */
export function pageKey(project: Project, pattern: Pattern) {
  return pattern.keyOverride ?? project.key;
}
