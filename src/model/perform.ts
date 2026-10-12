/**
 * Play styles for the keys (PLAN-playstyles.md, D149–D154): how a chord (or the keys held) is
 * played rather than which notes it has. Strum spreads a hit's notes, Slop humanizes them,
 * Balance shapes their velocities, the arpeggiator and the patterns give them a rhythm, Smooth
 * voicing picks each chord's inversion. They stack. Pure: the timing runs in `state/perform.ts`.
 */
import { arpOrder } from "./notes";
import { voiceChord, VOICING_RANGE } from "./padChords";
import type { Arpeggiator, StepSize } from "./types";

export type StrumDirection = "up" | "down" | "alternate";
export type ArpMode = Arpeggiator["mode"];

export interface PlayStyle {
  /** A hit's notes one after another; `time` from the first note to the last, in seconds. */
  strum: { on: boolean; time: number; direction: StrumDirection };
  /** Random timing (later only) and velocity per note, 0..1. */
  slop: { on: boolean; amount: number };
  /** Held notes one at a time on a grid. */
  arp: { on: boolean; mode: ArpMode; rate: StepSize; octaves: number; gate: number };
  /** The chord again and again on a rhythm (`PATTERNS`). */
  pattern: { on: boolean; id: string };
  /** What the keys play goes on after they're let go. */
  latch: boolean;
  /** The inner notes of a hit softer than its bass and top, 0..1. */
  balance: number;
}

export const DEFAULT_PLAY_STYLE: PlayStyle = {
  strum: { on: false, time: 0.04, direction: "up" },
  slop: { on: false, amount: 0.3 },
  arp: { on: false, mode: "up", rate: "1/16", octaves: 1, gate: 0.8 },
  pattern: { on: false, id: "eighths" },
  latch: false,
  balance: 0,
};

/** A stored play style, with anything missing or out of range set to its default. */
export function sanitizePlayStyle(v: unknown): PlayStyle {
  const o = (v ?? {}) as Partial<Record<keyof PlayStyle, Record<string, unknown>>>;
  const d = DEFAULT_PLAY_STYLE;
  const num = (x: unknown, def: number, lo: number, hi: number) =>
    typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def;
  const bool = (x: unknown, def: boolean) => (typeof x === "boolean" ? x : def);
  const one = <T extends string>(x: unknown, all: readonly T[], def: T) =>
    all.includes(x as T) ? (x as T) : def;
  return {
    strum: {
      on: bool(o.strum?.on, d.strum.on),
      time: num(o.strum?.time, d.strum.time, 0.005, STRUM_MAX),
      direction: one(o.strum?.direction, ["up", "down", "alternate"] as const, d.strum.direction),
    },
    slop: { on: bool(o.slop?.on, d.slop.on), amount: num(o.slop?.amount, d.slop.amount, 0, 1) },
    arp: {
      on: bool(o.arp?.on, d.arp.on),
      mode: one(o.arp?.mode, ARP_MODES, d.arp.mode),
      rate: one(o.arp?.rate, ARP_RATES, d.arp.rate),
      octaves: Math.round(num(o.arp?.octaves, d.arp.octaves, 1, 4)),
      gate: num(o.arp?.gate, d.arp.gate, 0.1, 1),
    },
    pattern: {
      on: bool(o.pattern?.on, d.pattern.on),
      id: PATTERNS.some((p) => p.id === o.pattern?.id) ? (o.pattern!.id as string) : d.pattern.id,
    },
    latch: bool((o as { latch?: unknown }).latch, d.latch),
    balance: num((o as { balance?: unknown }).balance, d.balance, 0, 1),
  };
}

// ---------- strum ----------

/** The longest strum, in seconds. */
export const STRUM_MAX = 0.25;
/** The strum times knob 3 steps through (after Off), in seconds. */
export const STRUM_TIMES = [0.01, 0.02, 0.03, 0.04, 0.06, 0.08, 0.12, 0.18, 0.25];

/**
 * When each of a hit's `n` notes starts, in seconds after the first, for notes sorted low to
 * high: up starts at the lowest, down at the highest. The gaps get a little shorter as the strum
 * goes, like a hand's.
 */
export function strumOffsets(n: number, time: number, down: boolean): number[] {
  if (n < 2 || time <= 0) return Array(Math.max(0, n)).fill(0);
  return Array.from({ length: n }, (_, j) => {
    const pos = down ? n - 1 - j : j;
    return time * Math.pow(pos / (n - 1), 0.8);
  });
}

// ---------- slop ----------

/** Slop at its most: up to 40 ms late, velocity ±30%. */
export const SLOP_TIMING = 0.04;
export const SLOP_VELOCITY = 0.3;

/** A note's slop from two random numbers (0..1): how much later it starts, and its velocity's
 * factor. Never earlier: a key can't sound before it's pressed. */
export function slopFor(amount: number, r1: number, r2: number): { delay: number; vel: number } {
  return { delay: r1 * amount * SLOP_TIMING, vel: 1 + (r2 * 2 - 1) * amount * SLOP_VELOCITY };
}

// ---------- balance ----------

/** How much softer the inner notes are at full balance. */
export const BALANCE_DEPTH = 0.35;

/** Each note's velocity factor in a hit of `n` notes, low to high: the lowest (the bass) and the
 * highest (the melody) at full velocity, the ones between softer. */
export function balanceFactors(n: number, balance: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    n < 3 || i === 0 || i === n - 1 ? 1 : 1 - BALANCE_DEPTH * balance,
  );
}

// ---------- arpeggiator ----------

export const ARP_MODES: readonly ArpMode[] = ["up", "down", "updown", "random", "played"];
export const ARP_RATES: readonly StepSize[] = ["1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"];

/**
 * The order an arpeggio goes through `notes` (in the order they were played), over `octaves`.
 * Random plays from the up order (`arpNote` picks).
 */
export function arpSequence(notes: readonly number[], mode: ArpMode, octaves: number): number[] {
  if (mode === "played") {
    const out: number[] = [];
    for (let o = 0; o < Math.max(1, octaves); o++) for (const p of notes) out.push(p + 12 * o);
    return out;
  }
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  return arpOrder(sorted, mode === "random" ? "up" : mode, octaves);
}

/** The arp's note number `count` (it counts on across chord changes); random never repeats the
 * note before it (`last`) when it can help it. */
export function arpNote(
  notes: readonly number[],
  mode: ArpMode,
  octaves: number,
  count: number,
  last: number | null,
  rand: () => number,
): number | null {
  const seq = arpSequence(notes, mode, octaves);
  if (!seq.length) return null;
  if (mode !== "random") return seq[count % seq.length];
  const choices = seq.length > 1 ? seq.filter((n) => n !== last) : seq;
  return choices[Math.floor(rand() * choices.length) % choices.length];
}

// ---------- patterns (model/patterns.ts, D174) ----------

export {
  PATTERNS,
  PATTERN_GROUPS,
  patternById,
  patternHits,
  patternBeats,
  type ChordPattern,
  type PatternStep,
  type Lane,
} from "./patterns";
import { PATTERNS } from "./patterns";

// ---------- smooth voicing (D152) ----------

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** How far notes move from `prev` to `next` (both low to high): note by note when they're as
 * many, else each new note to its nearest old one. */
function movement(prev: readonly number[], next: readonly number[]): number {
  if (prev.length === next.length) return next.reduce((a, n, i) => a + Math.abs(n - prev[i]), 0);
  return next.reduce((a, n) => a + Math.min(...prev.map((p) => Math.abs(n - p))), 0);
}

/**
 * The voicing (−8..8 steps of `voiceChord`) that moves least from the chord before (`prev`, as it
 * sounded), staying near `home` (the Voicing setting): Scaler's and Cubase's voice leading. Without
 * a chord before, home.
 */
export function smoothVoicing(
  prev: readonly number[] | null,
  chord: readonly number[],
  home: number,
): number {
  if (!prev?.length) return home;
  const center = mean(voiceChord(chord, home));
  let best = home;
  let bestCost = Infinity;
  for (let v = -VOICING_RANGE; v <= VOICING_RANGE; v++) {
    const c = voiceChord(chord, v);
    const drift = Math.abs(mean(c) - center);
    if (drift > 7) continue;
    const cost = movement(prev, c) + 0.25 * drift;
    if (
      cost < bestCost - 1e-9 ||
      (Math.abs(cost - bestCost) < 1e-9 && Math.abs(v - home) < Math.abs(best - home))
    ) {
      best = v;
      bestCost = cost;
    }
  }
  return best;
}
