/**
 * Turning a labeled take into steps (D113, D114): hits on a grid at the take's tempo, with
 * Snap or Keep feel timing, detected or constant velocity, and repetitions folded into one
 * pattern by majority. Pure: the result is applied to the project by `state/beatboxActions.ts`.
 */
import { STEP_SIZE_QUARTERS, type StepSize } from "../../model/types";
import { BEATBOX_CLASSES, type BeatboxClass } from "./classes";

export interface TakeHit {
  id: string;
  start: number;
  label: BeatboxClass;
  peakDb: number;
}

export interface ConvertSettings {
  bpm: number;
  /** Seconds into the take where the first bar starts. */
  firstBeat: number;
  stepSize: StepSize;
  timing: "snap" | "feel";
  /** Keep feel: how much of the offset becomes nudge (0..1). */
  strength: number;
  velocity: "detected" | "constant";
  velMin: number;
  velMax: number;
  constant: number;
  /** Hits more than this many dB below the take's loudest are dropped. */
  quietDb: number;
  repeats: "fold" | "all";
  /** Pattern length in bars, or auto. */
  bars: "auto" | 1 | 2 | 4 | 8;
  /** Classes that become tracks. */
  include: Record<BeatboxClass, boolean>;
}

export const DEFAULT_CONVERT: Omit<ConvertSettings, "bpm" | "firstBeat"> = {
  stepSize: "1/16",
  timing: "snap",
  strength: 1,
  velocity: "detected",
  velMin: 0.35,
  velMax: 1,
  constant: 0.8,
  quietDb: 40,
  repeats: "fold",
  bars: "auto",
  include: {
    kick: true,
    snare: true,
    hihat: true,
    openhat: true,
    tom: true,
    clap: true,
    crash: true,
    other: false,
  },
};

export interface OutStep {
  velocity: number;
  nudge: number;
  /** The hits that made it (one, or one per repetition when folded). */
  hits: string[];
}

export interface ConvertResult {
  stepsPerBar: number;
  /** Steps per page. */
  length: number;
  bars: number;
  /** How many times the pattern was played (folded) or the number of pages. */
  repeats: number;
  pages: Partial<Record<BeatboxClass, (OutStep | null)[]>>[];
  /** Hits whose class disagrees with what the other repetitions have at that step. */
  flagged: string[];
  /** Hits that didn't make it (quiet, before the first beat, excluded class). */
  dropped: string[];
}

export function stepsPerBar(stepSize: StepSize, beatsPerBar = 4, beatUnit = 4) {
  return Math.round((beatsPerBar * (4 / beatUnit)) / STEP_SIZE_QUARTERS[stepSize]);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Placed {
  id: string;
  label: BeatboxClass;
  index: number;
  velocity: number;
  nudge: number;
}

/** Hits on the grid: step index, velocity and nudge. */
export function place(hits: TakeHit[], s: ConvertSettings) {
  const stepDur = (60 / s.bpm) * STEP_SIZE_QUARTERS[s.stepSize];
  const loudest = Math.max(-120, ...hits.map((h) => h.peakDb));
  const kept = hits.filter((h) => h.peakDb >= loudest - s.quietDb && s.include[h.label]);
  const lo = Math.min(...kept.map((h) => h.peakDb));
  const placed: Placed[] = [];
  const dropped = hits.filter((h) => !kept.includes(h)).map((h) => h.id);
  for (const h of kept) {
    const pos = (h.start - s.firstBeat) / stepDur;
    const index = Math.round(pos);
    if (index < 0) {
      dropped.push(h.id);
      continue;
    }
    const offset = pos - index;
    const span = loudest - lo;
    const level = span > 0.5 ? (h.peakDb - lo) / span : 1;
    placed.push({
      id: h.id,
      label: h.label,
      index,
      velocity: s.velocity === "constant" ? s.constant : s.velMin + (s.velMax - s.velMin) * level,
      nudge: s.timing === "feel" ? clamp(offset * s.strength, -0.5, 0.5) : 0,
    });
  }
  return { placed, dropped };
}

/** How well the grid matches itself `shift` steps on (0..1, Jaccard over occupied cells). */
function selfMatch(cells: Set<string>, shift: number, total: number) {
  let both = 0;
  let either = 0;
  for (let i = 0; i + shift < total; i++)
    for (const c of BEATBOX_CLASSES) {
      const a = cells.has(`${c}:${i}`);
      const b = cells.has(`${c}:${i + shift}`);
      if (a && b) both++;
      if (a || b) either++;
    }
  return either ? both / either : 0;
}

/** The pattern length in bars: the shortest of 1, 2, 4, 8 that repeats nearly as well as the best. */
export function detectBars(placed: Placed[], perBar: number): number {
  const total = Math.max(0, ...placed.map((p) => p.index)) + 1;
  const takeBars = Math.max(1, Math.ceil(total / perBar));
  const cells = new Set(placed.map((p) => `${p.label}:${p.index}`));
  const scores = [1, 2, 4, 8]
    .filter((b) => b * 2 <= takeBars)
    .map((b) => ({ b, score: selfMatch(cells, b * perBar, total) }));
  if (!scores.length) return Math.min(8, takeBars);
  const best = Math.max(...scores.map((x) => x.score));
  if (best < 0.35) return Math.min(8, takeBars);
  return scores.find((x) => x.score >= best * 0.85)!.b;
}

export function convert(
  hits: TakeHit[],
  s: ConvertSettings,
  beatsPerBar = 4,
  beatUnit = 4,
): ConvertResult {
  const perBar = stepsPerBar(s.stepSize, beatsPerBar, beatUnit);
  const { placed, dropped } = place(hits, s);
  // two hits of one class on one step: the louder one
  const byCell = new Map<string, Placed>();
  for (const p of placed) {
    const key = `${p.label}:${p.index}`;
    const had = byCell.get(key);
    if (!had || p.velocity > had.velocity) {
      if (had) dropped.push(had.id);
      byCell.set(key, p);
    } else dropped.push(p.id);
  }
  const cells = [...byCell.values()];
  const bars = s.bars === "auto" ? detectBars(cells, perBar) : s.bars;
  const length = Math.min(128, bars * perBar);
  const total = Math.max(0, ...cells.map((p) => p.index)) + 1;
  const reps = Math.max(1, Math.ceil(total / length));
  const empty = () => new Array<OutStep | null>(length).fill(null);
  const flagged: string[] = [];

  if (s.repeats === "all") {
    const pages: ConvertResult["pages"] = Array.from({ length: reps }, () => ({}));
    for (const p of cells) {
      const page = pages[Math.floor(p.index / length)];
      const lane = (page[p.label] ??= empty());
      lane[p.index % length] = { velocity: p.velocity, nudge: p.nudge, hits: [p.id] };
    }
    return { stepsPerBar: perBar, length, bars, repeats: reps, pages, flagged, dropped };
  }

  // fold: a step keeps a class when at least half the repetitions that reach it have it
  const page: ConvertResult["pages"][number] = {};
  for (let i = 0; i < length; i++) {
    const covering = Array.from({ length: reps }, (_, r) => r * length + i).filter(
      (j) => j < total,
    ).length;
    const here = cells.filter((p) => p.index % length === i);
    for (const c of BEATBOX_CLASSES) {
      const mine = here.filter((p) => p.label === c);
      if (!mine.length) continue;
      if (mine.length * 2 >= covering) {
        const lane = (page[c] ??= empty());
        lane[i] = {
          velocity: mine.reduce((a, p) => a + p.velocity, 0) / mine.length,
          nudge: mine.reduce((a, p) => a + p.nudge, 0) / mine.length,
          hits: mine.map((p) => p.id),
        };
      } else {
        // a minority here: flagged when another class has the majority on this step
        const others = here.filter((p) => p.label !== c);
        const majority = BEATBOX_CLASSES.some(
          (o) => o !== c && others.filter((p) => p.label === o).length * 2 >= covering,
        );
        if (majority) flagged.push(...mine.map((p) => p.id));
      }
    }
  }
  return { stepsPerBar: perBar, length, bars, repeats: reps, pages: [page], flagged, dropped };
}

/** A tempo and first beat for a take recorded without a click: the tempo that lines the hits
 * up best between 70 and 180 BPM (or `hint`), and the phase of the first hit. */
export function detectGrid(starts: number[], hint?: number): { bpm: number; firstBeat: number } {
  if (starts.length < 3) return { bpm: hint ?? 120, firstBeat: starts[0] ?? 0 };
  const first = starts[0];
  let best = { bpm: hint ?? 120, score: -Infinity };
  const candidates = hint ? [hint] : Array.from({ length: 221 }, (_, i) => 70 + i * 0.5);
  for (const bpm of candidates) {
    const step = 60 / bpm / 4;
    let score = 0;
    for (const t of starts) {
      const pos = (t - first) / step;
      const off = pos - Math.round(pos);
      score += Math.cos(2 * Math.PI * off);
    }
    // a slight preference for tempos near 100–120, where most beatboxing sits
    score -= Math.abs(Math.log2(bpm / 110)) * starts.length * 0.15;
    if (score > best.score) best = { bpm, score };
  }
  return { bpm: Math.round(best.bpm * 10) / 10, firstBeat: first };
}
