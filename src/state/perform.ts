/**
 * The play styles at run time (PLAN-playstyles.md, D149–D153): a small scheduler that starts and
 * stops the keys' notes at their audio times (a strum's notes, a slop's delays), and the rhythm
 * engine that plays held chords as an arpeggio or on a pattern, on the tempo's grid (the
 * transport's while it plays). The keys (`state/keys.ts`) say what's held and how a note plays;
 * what each style does is in `model/perform.ts`.
 */
import { audioNow, onPanic } from "../engine/engine";
import { startTicker } from "../engine/ticker";
import { playStartTime } from "../engine/transport";
import { laneNotes, type ChordInfo, type ChordPattern } from "../model/patterns";
import {
  arpNote,
  balanceFactors,
  patternById,
  patternHits,
  sanitizePlayStyle,
  slopFor,
  strumOffsets,
  type PlayStyle,
} from "../model/perform";
import { STEP_SIZE_QUARTERS } from "../model/types";
import { useSettings } from "./settings";
import { useStore } from "./store";

/** How far ahead notes are handed to the voices (they start at their exact audio time). */
const LOOKAHEAD = 0.1;

/** The play style now, with anything missing filled in. */
export const playStyle = (): PlayStyle => sanitizePlayStyle(useSettings.getState().playStyle);

/** Whether held notes play on a grid (the arpeggiator or a pattern) instead of as held. */
export function rhythmOn(s = playStyle()): boolean {
  return s.arp.on || s.pattern.on;
}

// ---------- the scheduler ----------

interface Job {
  time: number;
  run: (time: number) => void;
}

const jobs = new Set<Job>();
let stopTicker: (() => void) | null = null;

/** Run `run` at `time` (audio clock), given that time; returns a cancel. */
export function schedule(time: number, run: (time: number) => void): () => void {
  const job = { time, run };
  jobs.add(job);
  ensureTicking();
  return () => void jobs.delete(job);
}

function ensureTicking() {
  // unit tests (Node) drive it with flushPerform
  if (stopTicker || typeof window === "undefined") return;
  stopTicker = startTicker(() => flushPerform());
}

function idle() {
  if (jobs.size === 0 && !rhythm.running && !ahead && stopTicker) {
    stopTicker();
    stopTicker = null;
  }
}

/**
 * Something that changes what's held at exact times ahead (Auto, D162): it runs before the rhythm,
 * so a change at a step's time is there when that step is played. Returns whether it's still on.
 */
type Ahead = (now: number, horizon: number) => boolean;
let ahead: Ahead | null = null;

export function setAhead(fn: Ahead | null) {
  ahead = fn;
  if (fn) ensureTicking();
}

/** Hand everything due before `now + LOOKAHEAD` to the voices (the ticker calls it). */
export function flushPerform(now = audioNow()) {
  const horizon = now + LOOKAHEAD;
  if (ahead && !ahead(now, horizon)) ahead = null;
  tickRhythm(now, horizon);
  const due = [...jobs].filter((j) => j.time <= horizon).sort((a, b) => a.time - b.time);
  for (const j of due) {
    if (!jobs.delete(j)) continue;
    j.run(Math.max(j.time, now));
  }
  idle();
}

// ---------- the rhythm engine ----------

/** What the keys hold: the chord's notes (in the order played), the bass, how hard. */
export interface Pool {
  chord: number[];
  bass: number[];
  velocity: number;
  /** The chord's root (a MIDI note) and its tones above it, for hits that pick notes (D176). */
  root?: number;
  tones?: number[];
}

/** A note the rhythm plays, with its hit's time and its own delay after it (for recording). */
export interface TimedNote {
  /** On its musical grid (the rhythm's notes): recorded where it is, not snapped (D175). */
  onGrid?: boolean;
  pitch: number;
  velocity: number;
  start: number;
  end: number;
  hitAt: number;
  spread: number;
  bass: boolean;
}

export interface RhythmPlayer {
  pool(): Pool | null;
  /** Play a note from `start` to `end`; returns what cuts it short. */
  play(n: TimedNote): () => void;
  /** Hold a bass note from `at` until cut (the arpeggiator's bass). */
  hold(pitch: number, velocity: number, at: number): () => void;
  /** The next chord's root (pitch class) and when it comes, when it's known (Auto's, D176). */
  next?(): { root: number; at: number } | null;
}

let player: RhythmPlayer | null = null;

/** The keys say what's held and how a note plays. */
export function setRhythmPlayer(p: RhythmPlayer) {
  player = p;
}

const rhythm = {
  running: false,
  /** The grid: step k is at origin + k × dur. */
  origin: 0,
  dur: 0.125,
  k: 0,
  /** Whether the grid is the transport's (it was playing when it was set). */
  onTransport: false,
  /** The arpeggiator's note count (it goes on across chord changes) and its last note. */
  count: 0,
  last: null as number | null,
  /** Alternate strums: down next? */
  down: false,
  /** A walking bass's place in its chord (D176), and that chord's root. */
  walk: 0,
  walkRoot: NaN as number,
  /** Notes still sounding, and the arpeggiator's held bass. */
  sounding: new Set<() => void>(),
  bass: new Map<number, () => void>(),
};

/** A grid step, in seconds: a 16th on a pattern, else the arp's rate. */
function stepDur(s: PlayStyle): number {
  // a pattern's step is a beat over its division (16ths, 8th or 16th triplets, D175)
  const quarters = s.pattern.on
    ? 1 / patternById(s.pattern.id).division
    : STEP_SIZE_QUARTERS[s.arp.rate];
  return (quarters * 60) / useStore.getState().project.bpm;
}

/** Put the grid on the transport's steps (playing) or start it now (stopped). */
function alignGrid(now: number, dur: number, from: number) {
  const playing = useStore.getState().playing;
  rhythm.onTransport = playing;
  rhythm.dur = dur;
  if (playing) {
    rhythm.origin = playStartTime();
    rhythm.k = Math.max(0, Math.ceil((from - rhythm.origin) / dur - 1e-6));
  } else {
    rhythm.origin = from;
    rhythm.k = 0;
  }
  void now;
}

/** What's held, or how it's played, changed: start, follow or stop the rhythm. */
export function pokeRhythm() {
  if (!player) return;
  const s = playStyle();
  const pool = player.pool();
  if (!rhythmOn(s) || !pool || (!pool.chord.length && !pool.bass.length)) return stopRhythm();
  if (!rhythm.running) {
    rhythm.running = true;
    rhythm.count = 0;
    rhythm.last = null;
    rhythm.walk = 0;
    rhythm.walkRoot = NaN;
    const now = audioNow();
    alignGrid(now, stepDur(s), now + 0.003);
    ensureTicking();
    flushPerform(now); // the first note at once (while stopped)
  } else if (!s.pattern.on) {
    holdBass(pool, audioNow());
  }
}

/** Stop the rhythm and what it plays (the keys are up, or the styles changed). */
export function stopRhythm() {
  rhythm.running = false;
  for (const cut of rhythm.sounding) cut();
  rhythm.sounding.clear();
  for (const cut of rhythm.bass.values()) cut();
  rhythm.bass.clear();
  idle();
}

function tickRhythm(now: number, horizon: number) {
  if (!rhythm.running || !player) return;
  const s = playStyle();
  if (!rhythmOn(s)) return stopRhythm();
  const dur = stepDur(s);
  // the transport started or stopped, or the rate changed: the grid goes on from its next step
  if (useStore.getState().playing !== rhythm.onTransport || Math.abs(dur - rhythm.dur) > 1e-9)
    alignGrid(now, dur, Math.max(now, rhythm.origin + rhythm.k * rhythm.dur));
  while (rhythm.running && rhythm.origin + rhythm.k * rhythm.dur < horizon) {
    step(rhythm.k, rhythm.origin + rhythm.k * rhythm.dur, s);
    rhythm.k++;
  }
}

function nextArpNote(pool: Pool, s: PlayStyle): number | null {
  const n = arpNote(pool.chord, s.arp.mode, s.arp.octaves, rhythm.count, rhythm.last, Math.random);
  rhythm.count++;
  rhythm.last = n;
  return n;
}

function step(k: number, t: number, s: PlayStyle) {
  const pool = player!.pool();
  if (!pool || (!pool.chord.length && !pool.bass.length)) return stopRhythm();
  if (s.pattern.on) {
    const pat = patternById(s.pattern.id);
    for (const h of patternHits(pat, k)) {
      const len = h.length * rhythm.dur * 0.92;
      const vel = pool.velocity * h.vel;
      const onBeat = h.at % pat.division === 0;
      if (h.part === "all" || h.part === "chord" || h.part === "bass") {
        const chord =
          h.part === "bass"
            ? []
            : s.arp.on
              ? [nextArpNote(pool, s)].filter((n) => n !== null)
              : pool.chord;
        // a bass hit without a bass plays the chord's lowest note
        const bass =
          h.part === "chord"
            ? []
            : pool.bass.length
              ? pool.bass
              : h.part === "bass"
                ? pool.chord.slice(0, 1)
                : [];
        emit(bass, chord as number[], t, len, vel, s, onBeat);
        continue;
      }
      // a hit that picks its notes (D176): chord tones, broken chords, a walking bass
      const info = chordInfo(pool);
      if (info.root !== rhythm.walkRoot) {
        rhythm.walkRoot = info.root;
        rhythm.walk = 0;
      }
      const approach = h.part === "walk" ? approachTo(pat, k, t) : null;
      const picked = laneNotes(h.part, info, rhythm.walk, approach);
      if (h.part === "walk") rhythm.walk++;
      if (picked.bass) emit(picked.notes, [], t, len, vel, s, onBeat);
      else emit([], picked.notes, t, len, vel, s, onBeat);
    }
    return;
  }
  holdBass(pool, t);
  const n = nextArpNote(pool, s);
  if (n !== null) emit([], [n], t, rhythm.dur * s.arp.gate, pool.velocity, s, k % 2 === 0);
}

/** What a hit picks its notes from: the pool, its root and tones (the lowest note without). */
function chordInfo(pool: Pool): ChordInfo {
  const root = pool.root ?? pool.chord[0] ?? pool.bass[0] ?? 60;
  const tones =
    pool.tones ??
    [...new Set(pool.chord.map((n) => (((n - root) % 12) + 12) % 12))].sort((a, b) => a - b);
  return { notes: pool.chord, bass: pool.bass, root, tones };
}

/**
 * A walking bass's approach (D176): the next chord's root, when it's known and this is the walk's
 * last hit before it comes (no other walk hit between this step and the change).
 */
function approachTo(pat: ChordPattern, k: number, t: number): number | null {
  const next = player?.next?.();
  if (!next || next.at <= t + 1e-6) return null;
  const until = Math.round((next.at - t) / rhythm.dur);
  for (let i = 1; i < until; i++)
    if (patternHits(pat, k + i).some((h) => h.part === "walk")) return null;
  return next.root;
}

/** The arpeggiator's bass: held while the chord is, not arpeggiated. */
function holdBass(pool: Pool, at: number) {
  for (const [pitch, cut] of rhythm.bass)
    if (!pool.bass.includes(pitch)) {
      cut();
      rhythm.bass.delete(pitch);
    }
  for (const pitch of pool.bass)
    if (!rhythm.bass.has(pitch)) rhythm.bass.set(pitch, player!.hold(pitch, pool.velocity, at));
}

/** One hit: its notes through Strum, Balance and Slop, each started and stopped at its time. */
function emit(
  bass: number[],
  chord: number[],
  t: number,
  length: number,
  velocity: number,
  s: PlayStyle,
  onBeat: boolean,
) {
  const notes = [
    ...bass.map((pitch) => ({ pitch, bass: true })),
    ...chord.filter((p) => !bass.includes(p)).map((pitch) => ({ pitch, bass: false })),
  ].sort((a, b) => a.pitch - b.pitch);
  if (!notes.length) return;
  const down = strumDown(s, onBeat);
  const offs = s.strum.on ? strumOffsets(notes.length, s.strum.time, down) : [];
  const bal = balanceFactors(notes.length, s.balance);
  notes.forEach((n, i) => {
    const slop = s.slop.on
      ? slopFor(s.slop.amount, Math.random(), Math.random())
      : { delay: 0, vel: 1 };
    const spread = (offs[i] ?? 0) + slop.delay;
    const start = t + spread;
    const end = Math.max(start + 0.02, t + length);
    const cut = player!.play({
      onGrid: true,
      pitch: n.pitch,
      velocity: Math.max(0.05, Math.min(1, velocity * bal[i] * slop.vel)),
      start,
      end,
      hitAt: t,
      spread,
      bass: n.bass,
    });
    rhythm.sounding.add(cut);
    schedule(end + 0.05, () => rhythm.sounding.delete(cut));
  });
}

/**
 * Which way a hit is strummed: as set, or alternating. On a pattern, alternate is a guitar's:
 * low to high (a down stroke) on the beat, high to low between.
 */
export function strumDown(s: PlayStyle, onBeat?: boolean): boolean {
  if (s.strum.direction === "up") return false;
  if (s.strum.direction === "down") return true;
  if (s.pattern.on && onBeat !== undefined) return !onBeat;
  rhythm.down = !rhythm.down;
  return !rhythm.down;
}

// Stop is a panic (D99): nothing waits or plays on after it
onPanic(() => {
  jobs.clear();
  stopRhythm();
  for (const fn of panicListeners) fn();
});

const panicListeners = new Set<() => void>();

/** Run on Stop (the keys let go of what's latched). */
export function onPerformPanic(fn: () => void) {
  panicListeners.add(fn);
}
