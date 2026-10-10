import { current, isDraft, type Draft } from "immer";
import { CATEGORY_COLOR, LINK_COLORS } from "./colors";
import type { Bus, Master } from "./effects";
import { uid } from "./id";
import { MIX_PARAMS, SOUND_PARAMS, defaultParams, toUnit } from "./params";
import {
  MAX_STEPS,
  emptyStep,
  laneLength,
  type Lane,
  type PageSlot,
  type Pattern,
  type Sound,
  type SoundCategory,
  type Step,
  type Track,
  type TrackMode,
} from "./types";
import { canClip, hitNoteOf, player } from "./tracks";

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

/** How a controller sends values (D120): absolute, or a relative encoding (offset 64, two's
 * complement, sign bit). */
export type MidiMode = "absolute" | "rel64" | "rel2c" | "relsign";

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
  /** Absolute unless learned or set otherwise (schema 8). */
  mode?: MidiMode;
  /** A controller map's slot ("knob1", "fader2", "play"): global mappings from a map. */
  slot?: string;
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

export function emptyLane(mode: TrackMode): Lane {
  const lane: Lane = { steps: Array.from({ length: MAX_STEPS }, emptyStep) };
  // a new Clip track waits for a recording or a sample
  if (mode === "clip") lane.clip = { active: false, launchMode: "loop" };
  return lane;
}

export function makeTrack(
  mode: TrackMode,
  category: SoundCategory,
  name: string,
  source: string,
  effects: Track["effects"] = [],
  sound?: Sound,
): Track {
  const track: Track = {
    id: uid("trk"),
    name,
    mode,
    ...(sound ? { sound } : {}),
    category,
    color: CATEGORY_COLOR[category],
    source,
    mute: false,
    solo: false,
    arm: false,
    volume: 0.8,
    params: prefixed("mix", defaultParams(MIX_PARAMS.filter((p) => p.id !== "volume"))),
    effects,
  };
  Object.assign(track.params, prefixed("sound", defaultParams(SOUND_PARAMS[player(track)])));
  return track;
}

export function prefixed(prefix: string, values: Record<string, number>): Record<string, number> {
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
    lanes: Object.fromEntries(project.tracks.map((t) => [t.id, emptyLane(t.mode)])),
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
    if (lane.stepCountOverride) continue;
    for (let i = 0; i < n; i++) lane.steps[n + i] = deepClone(lane.steps[i]);
  }
  pattern.stepCount = n * 2;
}

export function halvePattern(pattern: Pattern) {
  pattern.stepCount = Math.max(1, Math.floor(pattern.stepCount / 2));
}

// ---------- lane operations ----------

export function rotateLane(lane: Lane, length: number, by: number) {
  const window = lane.steps.slice(0, length);
  for (let i = 0; i < length; i++) lane.steps[i] = window[(i - by + length * 8) % length];
}

export function reverseLane(lane: Lane, length: number) {
  const window = lane.steps.slice(0, length).reverse();
  for (let i = 0; i < length; i++) lane.steps[i] = window[i];
}

export function clearLane(lane: Lane) {
  for (let i = 0; i < lane.steps.length; i++) lane.steps[i] = emptyStep();
}

export function randomizeLane(lane: Lane, length: number, density = 0.35, velocityOnly = false) {
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

export function applyPattern(lane: Lane, hits: boolean[]) {
  hits.forEach((on, i) => (lane.steps[i].on = on));
}

export { laneLength };

// ---------- track operations ----------

export function addTrack(project: Project, track: Track, index = project.tracks.length) {
  project.tracks.splice(index, 0, track);
  for (const p of Object.values(project.patterns)) p.lanes[track.id] = emptyLane(track.mode);
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
  return pattern.lanes[trackId]?.steps[index];
}

/**
 * Switch how a step track plays (D93). Nothing is lost: steps keep their hit pitch and their
 * notes, lanes keep their clip settings, and the track keeps every mode's SOUND knobs. The first
 * switch to Notes writes notes for steps that have none (the hit note plus the step's pitch), and
 * a sample's Tune becomes the transpose, so the hits sound as before (as D76 did). Clip mode is
 * for samples only.
 */
export function setMode(project: Project, trackId: string, mode: TrackMode) {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track || track.mode === mode || (mode === "clip" && !canClip(track.sound))) return;
  const from = track.mode;
  const root = hitNoteOf(track);
  track.mode = mode;
  for (const [k, v] of Object.entries(defaultParams(SOUND_PARAMS[player(track)])))
    track.params[`sound.${k}`] ??= v;
  if (mode === "notes" && from === "hits" && track.sound?.source === "sample" && !track.transpose) {
    const tune = Math.round(toUnit.semis(24)(track.params["sound.tune"] ?? 0.5));
    if (tune) track.transpose = tune;
  }
  for (const p of Object.values(project.patterns)) {
    const lane = (p.lanes[trackId] ??= emptyLane(mode));
    if (mode === "notes")
      for (const s of lane.steps)
        if (s.on && !s.notes?.length)
          s.notes = [{ pitch: root + s.pitch, length: 1, velocity: s.velocity }];
    if (mode === "clip") lane.clip ??= { active: true, launchMode: "loop" };
  }
}

/** The key in effect on a page: its own override, or the project key. */
export function pageKey(project: Project, pattern: Pattern) {
  return pattern.keyOverride ?? project.key;
}
