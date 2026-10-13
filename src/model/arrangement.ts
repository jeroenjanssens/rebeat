/**
 * The arrangement (D181): the song's sections laid out in song time, in quarter notes. One place
 * answers "where is what" for the timeline, the transport, the render and the MIDI export.
 * Quarter notes, not seconds, so tempo changes and swing never move anything (seconds come from
 * the tempo map, model/tempo.ts).
 */
import { isDraft } from "immer";
import type { Project } from "./project";
import {
  STEP_SIZE_QUARTERS,
  type AutomationLane,
  type AutomationPoint,
  type Pattern,
  type Section,
  type SongAnchor,
} from "./types";

export interface Block {
  section: Section;
  pattern: Pattern;
  index: number;
  /** Where the section starts, in quarter notes from the song's start. */
  start: number;
  /** Steps played per repeat (the section's `steps`, else the pattern's). */
  steps: number;
  /** One step, in quarter notes. */
  stepQ: number;
  /** One repeat, in quarter notes. */
  length: number;
  repeats: number;
  /** All repeats: `length × repeats`. */
  span: number;
}

/** The steps a section plays per repeat. */
export function sectionSteps(section: Section, pattern: Pattern): number {
  const n = section.steps ?? pattern.stepCount;
  return Math.max(1, Math.min(pattern.stepCount, Math.round(n)));
}

const layouts = new WeakMap<Section[], { patterns: Project["patterns"]; blocks: Block[] }>();

/** Every section as a block in song time (cached: immer keeps unchanged data identical). */
export function layout(project: Project): Block[] {
  // a draft (inside a recipe) changes in place: never cache it
  const draft = isDraft(project.slots) || isDraft(project.patterns);
  const cached = draft ? undefined : layouts.get(project.slots);
  if (cached && cached.patterns === project.patterns) return cached.blocks;
  const blocks: Block[] = [];
  let start = 0;
  project.slots.forEach((section, index) => {
    const pattern = project.patterns[section.patternId];
    if (!pattern) return;
    const steps = sectionSteps(section, pattern);
    const stepQ = STEP_SIZE_QUARTERS[pattern.stepSize];
    const length = steps * stepQ;
    const repeats = Math.max(1, section.repeats);
    blocks.push({
      section,
      pattern,
      index,
      start,
      steps,
      stepQ,
      length,
      repeats,
      span: length * repeats,
    });
    start += length * repeats;
  });
  if (!draft) layouts.set(project.slots, { patterns: project.patterns, blocks });
  return blocks;
}

export function songLength(project: Project): number {
  const blocks = layout(project);
  const last = blocks[blocks.length - 1];
  return last ? last.start + last.span : 0;
}

export function blockOf(project: Project, slotId: string): Block | undefined {
  return layout(project).find((b) => b.section.id === slotId);
}

/** The block playing at song position q (past the end: the last one). */
export function blockAt(project: Project, q: number): Block {
  const blocks = layout(project);
  for (const b of blocks) if (q < b.start + b.span) return b;
  return blocks[blocks.length - 1];
}

/** Where an anchor is in the song; null when its section is gone or it's past its span (hidden,
 * D187: it comes back when the span grows). */
export function toSong(project: Project, a: SongAnchor): number | null {
  const b = blockOf(project, a.slotId);
  if (!b || a.at < 0 || a.at >= b.span - 1e-9) return null;
  return b.start + a.at;
}

/** An anchor for song position q: the block under it. */
export function toAnchor(project: Project, q: number): SongAnchor {
  const b = blockAt(project, Math.max(0, q));
  return { slotId: b.section.id, at: Math.max(0, Math.min(b.span - 1e-6, q - b.start)) };
}

export interface SongPosition {
  block: Block;
  repeat: number;
  step: number;
  /** Quarter notes into the step. */
  into: number;
}

/** The section, repeat and step at song position q. */
export function positionOf(project: Project, q: number): SongPosition {
  const block = blockAt(project, q);
  const inBlock = Math.max(0, Math.min(block.span - 1e-9, q - block.start));
  const repeat = Math.min(block.repeats - 1, Math.floor(inBlock / block.length + 1e-9));
  const inRepeat = inBlock - repeat * block.length;
  const step = Math.min(block.steps - 1, Math.floor(inRepeat / block.stepQ + 1e-9));
  return { block, repeat, step, into: inRepeat - step * block.stepQ };
}

/** Song position of a step in a section's repeat. */
export function stepPosition(block: Block, repeat: number, step: number): number {
  return block.start + repeat * block.length + step * block.stepQ;
}

// ---------- bars (D185: every section starts a bar) ----------

export interface BarLine {
  q: number;
  /** 1-based bar number. */
  bar: number;
  /** A short bar: the section (or its repeat) ends before a full bar. */
  short: boolean;
}

/** One bar in quarter notes, in the project's meter (6/8 = 3 quarters). */
export const barQuarters = (project: Project) =>
  (project.timeSignature[0] * 4) / project.timeSignature[1];

/** Bar lines: bars count from each repeat of each section, so a short section is a short bar
 * and the bars after it stay on their downbeats. */
export function bars(project: Project): BarLine[] {
  const barQ = barQuarters(project);
  const out: BarLine[] = [];
  let bar = 1;
  for (const b of layout(project))
    for (let r = 0; r < b.repeats; r++) {
      const from = b.start + r * b.length;
      for (let q = 0; q < b.length - 1e-9; q += barQ)
        out.push({ q: from + q, bar: bar++, short: b.length - q < barQ - 1e-9 });
    }
  return out;
}

// ---------- automation values ----------

export interface ResolvedPoint {
  q: number;
  value: number;
  hold: boolean;
}

const resolved = new WeakMap<AutomationPoint[], { slots: Section[]; points: ResolvedPoint[] }>();

/** A lane's points in song order, without hidden ones. */
export function lanePoints(project: Project, points: AutomationPoint[]): ResolvedPoint[] {
  const draft = isDraft(points) || isDraft(project.slots) || isDraft(project.patterns);
  const cached = draft ? undefined : resolved.get(points);
  if (cached && cached.slots === project.slots) return cached.points;
  const out: ResolvedPoint[] = [];
  for (const p of points) {
    const q = toSong(project, p);
    if (q !== null) out.push({ q, value: p.value, hold: !!p.hold });
  }
  out.sort((a, b) => a.q - b.q);
  if (!draft) resolved.set(points, { slots: project.slots, points: out });
  return out;
}

/** The value of a curve at q: linear between points (a hold is a step), the first value before
 * the first point and the last after the last. */
export function curveAt(points: ResolvedPoint[], q: number): number | null {
  if (!points.length) return null;
  if (q <= points[0].q) return points[0].value;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (q < b.q) {
      const a = points[i - 1];
      if (a.hold) return a.value;
      return a.value + ((b.value - a.value) * (q - a.q)) / (b.q - a.q);
    }
  }
  return points[points.length - 1].value;
}

export function valueAt(project: Project, lane: AutomationLane, q: number): number | null {
  return curveAt(lanePoints(project, lane.points), q);
}

// ---------- keeping anchors (D187) ----------

/** Every anchored thing in a project: automation points, tempo changes, region starts. */
export function anchors(project: Project): SongAnchor[] {
  return [
    ...(project.automation ?? []).flatMap((l) => l.points),
    ...(project.tempo ?? []),
    ...(project.regions ?? []).map((r) => r.start),
  ];
}

/** How many things are anchored to a section (for the delete toast). */
export function anchoredTo(project: Project, slotId: string) {
  return {
    points: (project.automation ?? []).reduce(
      (n, l) => n + l.points.filter((p) => p.slotId === slotId).length,
      0,
    ),
    tempo: (project.tempo ?? []).filter((t) => t.slotId === slotId).length,
    regions: (project.regions ?? []).filter((r) => r.start.slotId === slotId).length,
  };
}

/** Remove what's anchored to a section (it's being deleted). Inside a recipe. */
export function dropAnchored(project: Project, slotId: string) {
  for (const l of project.automation ?? []) l.points = l.points.filter((p) => p.slotId !== slotId);
  if (project.tempo) project.tempo = project.tempo.filter((t) => t.slotId !== slotId);
  if (project.regions) project.regions = project.regions.filter((r) => r.start.slotId !== slotId);
}

/** Copy what's anchored to one section onto another (a copy or clone of it). Inside a recipe. */
export function copyAnchored(
  project: Project,
  fromSlotId: string,
  toSlotId: string,
  newId: () => string,
) {
  for (const l of project.automation ?? [])
    l.points.push(
      ...l.points.filter((p) => p.slotId === fromSlotId).map((p) => ({ ...p, slotId: toSlotId })),
    );
  if (project.tempo)
    project.tempo.push(
      ...project.tempo
        .filter((t) => t.slotId === fromSlotId)
        .map((t) => ({ ...t, slotId: toSlotId })),
    );
  if (project.regions)
    project.regions.push(
      ...project.regions
        .filter((r) => r.start.slotId === fromSlotId)
        .map((r) => ({ ...r, id: newId(), start: { ...r.start, slotId: toSlotId } })),
    );
}

/**
 * A section's repeats became separate sections (unroll, split): repeat k of `slotId` is now
 * `parts[k]`, each `length` quarter notes long. Inside a recipe.
 */
export function splitAnchored(project: Project, slotId: string, parts: string[], length: number) {
  for (const a of anchors(project)) {
    if (a.slotId !== slotId) continue;
    const k = Math.min(parts.length - 1, Math.floor(a.at / length + 1e-9));
    a.slotId = parts[k];
    a.at -= k * length;
  }
}
