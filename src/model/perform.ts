/**
 * Play styles for the keys (PLAN-playstyles.md, D149–D154): how a chord (or the keys held) is
 * played rather than which notes it has. Strum spreads a hit's notes, Slop humanizes them,
 * Balance shapes their velocities, the arpeggiator and the patterns give them a rhythm, Smooth
 * voicing picks each chord's inversion. They stack. Pure: the timing runs in `state/perform.ts`.
 */
import type { EaseType } from "./ease";
import { arpOrder, inKey, type Key } from "./notes";
import { voiceChord, VOICING_RANGE } from "./padChords";
import {
  BEND_SHAPES,
  type Arpeggiator,
  type BendShape,
  type NoteBend,
  type StepSize,
} from "./types";

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
  /** Bends per note (D222): a shape with its own values, which notes, how many, how hard. */
  bend: BendStyle;
}

/** One bend shape's values on the Bend card: semitones (Next: notes of the key), times in
 * seconds or quarter notes, its ease, a Shake's rate. */
export interface BendValues {
  amount: number;
  time: number;
  delay: number;
  unit: "s" | "q";
  ease: EaseType;
  rate: number;
}

export type BendNotes = "all" | "top" | "bass" | "newest";

export interface BendStyle {
  on: boolean;
  shape: BendShape;
  /** Each shape keeps its own values: trying another doesn't lose the one you set up. */
  shapes: Record<BendShape, BendValues>;
  notes: BendNotes;
  /** How many notes bend, 0..1. */
  chance: number;
  /** −1..1: harder notes bend more (positive) or less (negative). */
  velocity: number;
  /** What the MiniLab's pitch strip bends: the whole synth, or the newest held note (D225). */
  strip: "synth" | "newest";
}

const bv = (amount: number, time: number, extra: Partial<BendValues> = {}): BendValues => ({
  amount,
  time,
  delay: 0,
  unit: "s",
  ease: "smooth",
  rate: 5.5,
  ...extra,
});

/** Each shape's values before you change them (the plan's table, D220). */
export const DEFAULT_BEND_SHAPES: Record<BendShape, BendValues> = {
  scoop: bv(-2, 0.12),
  fall: bv(-5, 0.3, { ease: "exponential" }),
  doit: bv(3, 0.08, { ease: "exponential" }),
  dip: bv(-1, 0.2),
  rise: bv(12, 4, { unit: "q", ease: "exponential" }),
  next: bv(1, 0.15),
  shake: bv(0.3, 0.6, { ease: "linear" }),
};

export const BEND_EASES: readonly EaseType[] = ["linear", "smooth", "exponential", "bounce"];

export const DEFAULT_PLAY_STYLE: PlayStyle = {
  strum: { on: false, time: 0.04, direction: "up" },
  slop: { on: false, amount: 0.3 },
  arp: { on: false, mode: "up", rate: "1/16", octaves: 1, gate: 0.8 },
  pattern: { on: false, id: "eighths" },
  latch: false,
  balance: 0,
  bend: {
    on: false,
    shape: "scoop",
    shapes: DEFAULT_BEND_SHAPES,
    notes: "all",
    chance: 1,
    velocity: 0,
    strip: "synth",
  },
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
    bend: sanitizeBendStyle((o as { bend?: unknown }).bend),
  };
}

function sanitizeBendStyle(v: unknown): BendStyle {
  const o = (v ?? {}) as Partial<Record<keyof BendStyle, unknown>>;
  const d = DEFAULT_PLAY_STYLE.bend;
  const num = (x: unknown, def: number, lo: number, hi: number) =>
    typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def;
  const one = <T extends string>(x: unknown, all: readonly T[], def: T) =>
    all.includes(x as T) ? (x as T) : def;
  const saved = (o.shapes ?? {}) as Partial<Record<BendShape, Partial<BendValues>>>;
  const shapes = {} as Record<BendShape, BendValues>;
  for (const s of BEND_SHAPES) {
    const x = saved[s] ?? {};
    const def = DEFAULT_BEND_SHAPES[s];
    shapes[s] = {
      amount: num(x.amount, def.amount, -24, 24),
      time: num(x.time, def.time, 0.005, 16),
      delay: num(x.delay, def.delay, 0, 16),
      unit: x.unit === "q" || x.unit === "s" ? x.unit : def.unit,
      ease: one(x.ease, BEND_EASES, def.ease),
      rate: num(x.rate, def.rate, 0.5, 16),
    };
  }
  return {
    on: typeof o.on === "boolean" ? o.on : d.on,
    shape: one(o.shape, BEND_SHAPES, d.shape),
    shapes,
    notes: one(o.notes, ["all", "top", "bass", "newest"] as const, d.notes),
    chance: num(o.chance, d.chance, 0, 1),
    velocity: num(o.velocity, d.velocity, -1, 1),
    strip: one(o.strip, ["synth", "newest"] as const, d.strip),
  };
}

// ---------- bends (D222) ----------

/** Where a note is in what's played: the top of its chord, its bass, the last of its hit. */
export interface NoteRole {
  top: boolean;
  bass: boolean;
  last: boolean;
}

/** The note `steps` notes of the key away from `pitch` (up or down); without a key, semitones. */
export function keySteps(pitch: number, steps: number, key: Key | null): number {
  if (!key || steps === 0) return pitch + steps;
  const dir = Math.sign(steps);
  let p = pitch;
  for (let k = 0; k < Math.abs(steps); k++) {
    p += dir;
    for (let guard = 0; guard < 12 && !inKey(p, key); guard++) p += dir;
  }
  return p;
}

/**
 * A note's bend from the Bend card (D222), or none: its shape's values, if the card is on, the
 * note is one that bends (all, the top, the bass, the newest) and the chance says so (`random`,
 * 0..1); harder notes bend more or less by `velocity`. A Next is worked out in semitones here,
 * in the key, so a recorded note keeps it.
 */
export function bendFor(
  style: PlayStyle,
  role: NoteRole,
  velocity: number,
  pitch: number,
  key: Key | null,
  random: number,
): NoteBend | undefined {
  const b = style.bend;
  if (!b.on) return undefined;
  if (b.notes === "top" && !role.top) return undefined;
  if (b.notes === "bass" && !role.bass) return undefined;
  if (b.notes === "newest" && !role.last) return undefined;
  if (random >= b.chance) return undefined;
  const v = b.shapes[b.shape];
  const scale = Math.max(0, 1 + b.velocity * (velocity - 0.5) * 2);
  const amount =
    b.shape === "next"
      ? keySteps(pitch, Math.round(v.amount * scale) || Math.sign(v.amount), key) - pitch
      : Math.round(v.amount * scale * 100) / 100;
  if (amount === 0) return undefined;
  return {
    shape: b.shape,
    amount,
    time: v.time,
    delay: v.delay,
    unit: v.unit,
    ...(v.ease === "linear" ? {} : { ease: { type: v.ease } }),
    ...(b.shape === "shake" ? { rate: v.rate } : {}),
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

/** A note's bend of one shape with the card's values for it (the piano roll's Bend menu): no
 * chance, no velocity; a Next in the key. */
export function bendOfShape(
  style: PlayStyle,
  shape: BendShape,
  pitch: number,
  key: Key | null,
): NoteBend | undefined {
  const s = {
    ...style,
    bend: { ...style.bend, on: true, shape, notes: "all" as const, chance: 1, velocity: 0 },
  };
  return bendFor(s, { top: true, bass: true, last: true }, 0.5, pitch, key, 0);
}
