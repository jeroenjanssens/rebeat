/**
 * The synth's DSP (D83): plays version 2 patches, sample by sample. Pure TypeScript with no Web
 * Audio, so the same code runs in the AudioWorklet (worklet.ts) and in unit tests.
 *
 * Audio rate: oscillators (band-limited saw and pulse via polyBLEP, shape morph, unison, sync,
 * ring and phase modulation), noise, the filters (a zero-delay-feedback ladder with tanh
 * saturation, a ZDF state-variable filter) and the amp envelope. Control rate (every
 * CONTROL samples): the other envelopes, the LFOs and the mod matrix.
 */
import {
  MOD_DESTS,
  MOD_SOURCES,
  applyMacros,
  envCurve,
  macroAt,
  withMacroValues,
  noteLengthQuarters,
  type Env,
  type ModDest,
  type ModSource,
  type SynthPatch,
} from "../../model/synth";
import { atRelease, bendAt, releaseTail } from "../../model/bend";
import type { NoteBend } from "../../model/types";
import type { MippedTable } from "../../model/wavetables";
import { TABLES, formantGain, levelFor, readTable, warpPhase } from "./wavetable";
import { PhysVoice, type PhysMods } from "./physical";

export const CONTROL = 16;
const MAX_UNISON = 8;
const TWO_PI = Math.PI * 2;

// ---------- small helpers ----------

let seed = 0x9e3779b9;
/** xorshift32: -1..1 */
function rand() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x80000000 - 1;
}
/** Seed the module-level xorshift for deterministic tests. */
export const seedCore = (s: number) => void (seed = s >>> 0 || 1);

/** polyBLEP correction for a discontinuity at phase 0 (t = phase, dt = increment). */
function blep(t: number, dt: number) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

const frac = (x: number) => x - Math.floor(x);

/** One basic waveform: 0 sine, 1 triangle, 2 saw, 3 pulse (band-limited where it matters). */
function basic(k: number, pw: number, t: number, dt: number) {
  if (k <= 0) return Math.sin(TWO_PI * t);
  if (k === 1) return 1 - 4 * Math.abs(t - 0.5);
  if (k === 2) return 2 * t - 1 - blep(t, dt);
  // pulse, with its DC removed
  return (t < pw ? 1 : -1) + blep(t, dt) - blep(frac(t - pw + 1), dt) - (2 * pw - 1);
}

/** One sample at shape 0..3 (sine → triangle → saw → pulse), morphing between neighbors. */
function wave(shape: number, pw: number, t: number, dt: number) {
  const a = Math.floor(shape);
  const f = shape - a;
  if (f < 1e-4 || a >= 3) return basic(Math.min(a, 3), pw, t, dt);
  return basic(a, pw, t, dt) * (1 - f) + basic(a + 1, pw, t, dt) * f;
}

/** A curved 0..1 ramp: c < 0 starts fast, c > 0 starts slow, 0 is linear. */
const curve = envCurve;

// ---------- envelopes ----------

const enum Stage {
  Idle,
  Attack,
  Hold,
  Decay,
  Sustain,
  Release,
}

class EnvState {
  stage = Stage.Idle;
  value = 0;
  /** Position in the stage (0..1) and where it started. */
  x = 0;
  from = 0;
  peak = 1;

  start(peak: number) {
    this.stage = Stage.Attack;
    this.from = this.value;
    this.x = 0;
    this.peak = peak;
  }
  release() {
    if (this.stage === Stage.Idle || this.stage === Stage.Release) return;
    this.stage = Stage.Release;
    this.from = this.value;
    this.x = 0;
  }
  /** Advance by `n` samples. */
  step(e: Env, n: number, sr: number, gate: boolean) {
    // n / max(1, t*sr): fraction of stage consumed; inlined to avoid a closure per call.
    switch (this.stage) {
      case Stage.Idle:
        return 0;
      case Stage.Attack:
        this.x += n / Math.max(1, e.attack * sr);
        if (this.x >= 1) {
          this.value = this.peak;
          this.stage = e.hold > 0 ? Stage.Hold : Stage.Decay;
          this.x = 0;
          this.from = this.peak;
        } else this.value = this.from + (this.peak - this.from) * curve(this.x, e.attackCurve);
        break;
      case Stage.Hold:
        this.x += n / Math.max(1, e.hold * sr);
        if (this.x >= 1) {
          this.stage = Stage.Decay;
          this.x = 0;
        }
        break;
      case Stage.Decay: {
        this.x += n / Math.max(1, e.decay * sr);
        const target = this.peak * e.sustain;
        if (this.x >= 1) {
          this.value = target;
          if (e.loop && gate) this.start(this.peak);
          else this.stage = Stage.Sustain;
        } else this.value = this.from + (target - this.from) * curve(this.x, -e.curve);
        break;
      }
      case Stage.Sustain:
        this.value = this.peak * e.sustain;
        break;
      case Stage.Release:
        this.x += n / Math.max(1, e.release * sr);
        if (this.x >= 1) {
          this.value = 0;
          this.stage = Stage.Idle;
        } else this.value = this.from * (1 - curve(this.x, -e.curve));
        break;
    }
    return this.value;
  }
}

// ---------- LFOs ----------

class LfoState {
  phase = 0;
  held = 0;
  prev = 0;
  next = 0;
  reset(phase: number) {
    this.phase = phase;
    this.held = rand();
    this.prev = rand();
    this.next = rand();
  }
  /** Advance by `dt` cycles; returns -1..1. */
  step(shape: SynthPatch["lfos"][number]["shape"], dt: number) {
    this.phase += dt;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.held = rand();
      this.prev = this.next;
      this.next = rand();
    }
    const t = this.phase;
    switch (shape) {
      case "sine":
        return Math.sin(TWO_PI * t);
      case "triangle":
        return 1 - 4 * Math.abs(t - 0.5);
      case "rampUp":
        return 2 * t - 1;
      case "rampDown":
        return 1 - 2 * t;
      case "square":
        return t < 0.5 ? 1 : -1;
      case "sh":
        return this.held;
      case "smooth":
        return this.prev + (this.next - this.prev) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    }
  }
}

// ---------- filters ----------

class Ladder {
  s = new Float64Array(4);
  g = 0;
  G = 0;
  k = 0;
  set(cutoff: number, reso: number, sr: number) {
    this.g = Math.tan((Math.PI * Math.min(cutoff, sr * 0.45)) / sr);
    this.G = this.g / (1 + this.g);
    // self-oscillates from about 4
    this.k = reso * 4.3;
  }
  process(x: number) {
    const { s, G, k } = this;
    const b = 1 - G;
    const S = G * G * G * b * s[0] + G * G * b * s[1] + G * b * s[2] + b * s[3];
    const G4 = G * G * G * G;
    // tanh in the loop: warmth, and a stable self-oscillation
    let u = Math.tanh((x * (1 + k * 0.25) - k * S) / (1 + k * G4));
    for (let i = 0; i < 4; i++) {
      const v = (u - s[i]) * G;
      const y = v + s[i];
      s[i] = y + v;
      u = y;
    }
    return u;
  }
}

class Svf {
  ic1 = 0;
  ic2 = 0;
  a1 = 0;
  a2 = 0;
  a3 = 0;
  k = 2;
  set(cutoff: number, reso: number, sr: number) {
    const g = Math.tan((Math.PI * Math.min(cutoff, sr * 0.45)) / sr);
    this.k = 2 - 1.96 * reso;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  process(v0: number, type: "lp" | "hp" | "bp" | "notch") {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (type === "lp") return v2;
    if (type === "bp") return v1;
    const hp = v0 - this.k * v1 - v2;
    return type === "hp" ? hp : hp + v2;
  }
}

/** One filter slot for one channel: either model, so switching keeps no stale state around. */
class FilterUnit {
  ladder = new Ladder();
  svf = new Svf();
}

// ---------- voices ----------

const DEST_INDEX = Object.fromEntries(Object.keys(MOD_DESTS).map((k, i) => [k, i])) as Record<
  ModDest,
  number
>;
const SOURCE_INDEX = Object.fromEntries(MOD_SOURCES.map((k, i) => [k, i])) as Record<
  ModSource,
  number
>;

/** Default render order when FM is off (or the modulator comes before the carrier). */
const ORDER_012: readonly [0, 1, 2] = [0, 1, 2];

/**
 * Precomputed destination indexes for the three oscillators and two filters (P3.4): avoids
 * building template strings like `osc1.shape` on every control block (~3 000 times per second).
 */
const OSC_DEST = [0, 1, 2].map((o) => ({
  shape: DEST_INDEX[`osc${o + 1}.shape` as ModDest],
  pw: DEST_INDEX[`osc${o + 1}.pw` as ModDest],
  level: DEST_INDEX[`osc${o + 1}.level` as ModDest],
  pitch: DEST_INDEX[`osc${o + 1}.pitch` as ModDest],
  position: DEST_INDEX[`osc${o + 1}.position` as ModDest],
  warp: DEST_INDEX[`osc${o + 1}.warp` as ModDest],
}));
const FILTER_DEST = [0, 1].map((f) => ({
  cutoff: DEST_INDEX[`filter${f + 1}.cutoff` as ModDest],
  reso: DEST_INDEX[`filter${f + 1}.reso` as ModDest],
}));
const LFO_RATE_DEST = [0, 1, 2].map((i) => DEST_INDEX[`lfo${i + 1}.rate` as ModDest]);

/** Filter pre-drive gain: maps the drive knob 0..1 to the input pre-scale. */
function driveGain(d: number) {
  return 1 + d * 8;
}

/** Whether oscillator `o` of a patch uses FM-warp from its neighbour (reads `lastMono`). */
function isWarpFm(osc: SynthPatch["osc"][number]) {
  return osc.type === "wavetable" && osc.warp === "fm";
}

class Voice {
  active = false;
  gate = false;
  note = 60;
  velocity = 0.8;
  order = 0;
  /** Event id of the note it plays (for note-off). */
  id = -1;
  /** Glide: current and target pitch in semitones; a slide's own glide time (0: the patch's). */
  pitch = 60;
  target = 60;
  slide = 0;
  random = 0;
  /** Seconds since the note started (LFO fade-in). */
  age = 0;
  /** The note's own bend (D223): from `bendFrom` (its age then); `bendRelease`: when it was let
   * go; `holdUntil`: a Fall or Doit keeps it sounding until then (D221). */
  bend: NoteBend | null = null;
  bendFrom = 0;
  bendRelease: number | null = null;
  holdUntil = -1;
  /** The pitch strip on this note alone (D225), −1..1 of the bend range. */
  wheel = 0;
  phases = new Float64Array(3 * MAX_UNISON);
  drift = new Float64Array(3 * MAX_UNISON);
  driftTarget = new Float64Array(3 * MAX_UNISON);
  incs = new Float64Array(3 * MAX_UNISON);
  gainsL = new Float64Array(3 * MAX_UNISON);
  gainsR = new Float64Array(3 * MAX_UNISON);
  subPhase = 0;
  pink = new Float64Array(7);
  last1 = 0;
  envs = [new EnvState(), new EnvState(), new EnvState()];
  lfos = [new LfoState(), new LfoState(), new LfoState()];
  filters = [
    [new FilterUnit(), new FilterUnit()],
    [new FilterUnit(), new FilterUnit()],
  ];
  /** Which filter each slot ran last (a switch, D231, starts the other from silence). */
  filterKind: ("ladder" | "svf" | "")[] = ["", ""];
  /** The mod matrix's output per destination (natural units). */
  mod = new Float64Array(Object.keys(MOD_DESTS).length);
  /** Wavetables (D244): the table each oscillator reads (null: analog), the mip levels for its
   * pitch, and position and warp ramped across the block (from the last block's to this one's). */
  wt: (MippedTable | null)[] = [null, null, null];
  wtLevel = [
    { a: 0, w: 0 },
    { a: 0, w: 0 },
    { a: 0, w: 0 },
  ];
  posFrom = new Float64Array(3);
  posTo = new Float64Array(3);
  warpFrom = new Float64Array(3);
  warpTo = new Float64Array(3);
  /** Whether the ramps start fresh (a new note: no ramp from the last one's values). */
  fresh = true;
  /** Each oscillator's last sample (the FM warp reads its neighbour's). */
  lastMono = new Float64Array(3);
  /** The physical model (D249), made the first time this voice plays one. */
  phys: PhysVoice | null = null;
  physL = 0.7;
  physR = 0.7;
  /** Per control block: oscillator shapes, widths, levels, ring, FM, amp, pan. */
  shape = new Float64Array(3);
  pw = new Float64Array(3);
  level = new Float64Array(3);
  subLevel = 0;
  noiseLevel = 0;
  ring = 0;
  fm = 0;
  amp = 1;
  pan = 0;
  /**
   * Scratch arrays preallocated once per voice so render() and block() make no allocations on
   * the audio thread.  GC pauses in an AudioWorklet are glitches (AGENTS.md §8 / P3.2).
   */
  monoScratch = new Float64Array(3); // oscillator sum per sample, before writing lastMono
  neededScratch = new Uint8Array(3); // which oscillators to compute this block
  orderScratch = new Uint8Array(3); // render order (FM: modulator first)
  preGainScratch = new Float64Array(2); // filter pre-drive gain
}

type Event =
  /** `from`: a 303-style slide from that note (held on, gliding, without a new attack). */
  | {
      at: number;
      kind: "on";
      id: number;
      note: number;
      velocity: number;
      from?: number;
      bend?: NoteBend;
    }
  | { at: number; kind: "off"; id: number }
  | { at: number; kind: "releaseAll" }
  /** A parameter lock on the macros (values), or its end (null: back unless locked again since). */
  | { at: number; kind: "macros"; id: number; values: number[] | null }
  /** The tempo from here (D192: tempo changes), for synced LFOs. */
  | { at: number; kind: "tempo"; bpm: number }
  /** Automation ends here (D228): every path goes back to the patch. */
  | { at: number; kind: "automateEnd" };

/** An automated value: a number (ramps between numbers), or a switch's option. */
export type AutoValue = number | string | boolean | null;
/** One point of a path's automation (D228), in samples; `ramp`: a straight line from the one before. */
export interface AutoPoint {
  at: number;
  v: AutoValue;
  ramp: boolean;
}
/** A path's automation: the point in force and the ones still to come. */
interface AutoPath {
  keys: string[];
  macro: number;
  cur: AutoPoint | null;
  pending: AutoPoint[];
}

const clonePatch = (p: SynthPatch): SynthPatch => JSON.parse(JSON.stringify(p)) as SynthPatch;

/** Values that MIDI and the UI send: mod wheel, aftertouch, pitch bend, macros. */
export interface Controls {
  modwheel: number;
  aftertouch: number;
  /** -1..1 */
  pitchbend: number;
}

/** A polyphonic synth playing one patch. */
export class SynthCore {
  readonly sr: number;
  private patch!: SynthPatch;
  /** The patch as sent, before macros; and a step's macro lock on top. */
  private base!: SynthPatch;
  private lock: { id: number; values: number[] } | null = null;
  /** The patch with its macros applied, before automation. */
  private rest!: SynthPatch;
  /**
   * Automation (D228): each automated path ("filters.0.cutoff", "macros.2.value"), and the
   * working copy of the patch its values are written into, in place, once per control block.
   */
  private auto = new Map<string, AutoPath>();
  private work: SynthPatch | null = null;
  private macroValues: number[] = [];
  private voices: Voice[] = Array.from({ length: 16 }, () => new Voice());
  private globalLfos = [new LfoState(), new LfoState(), new LfoState()];
  /** Preallocated: global LFO outputs written by block() and read by control(). No allocation per block. */
  private glfoScratch = new Float64Array(3);
  private events: Event[] = [];
  /** Read position in events[]; compacted (spliced to 0) at the start of each process(). */
  private eventHead = 0;
  private order = 0;
  private bpm = 120;
  /** Mono/legato: the notes held, latest last. */
  private held: { id: number; note: number; velocity: number }[] = [];
  private lastPitch = 60;
  controls: Controls = { modwheel: 0, aftertouch: 0, pitchbend: 0 };
  private sources = new Float64Array(MOD_SOURCES.length);

  constructor(sampleRate: number, patch: SynthPatch) {
    this.sr = sampleRate;
    this.setPatch(patch);
    this.globalLfos.forEach((l, i) => l.reset(patch.lfos[i].phase));
  }

  /** A new patch (or macro values). Macros move their targets before anything else. */
  setPatch(patch: SynthPatch) {
    this.base = patch;
    this.rest = applyMacros(this.lock ? withMacroValues(patch, this.lock.values) : patch);
    this.patch = this.rest;
    // automation is written into a fresh copy at the next block
    this.work = null;
  }

  /** Lock the macros at `values` from `at` (samples); `values` null ends lock `id`. */
  lockMacros(id: number, values: number[] | null, at: number) {
    this.queue({ at, kind: "macros", id, values });
  }

  /** The tempo, now or from `at` (samples). */
  setTempo(bpm: number, at?: number) {
    if (at === undefined) this.bpm = bpm;
    else this.queue({ at, kind: "tempo", bpm });
  }

  /**
   * Automation of one patch path (D228): its points in samples, in order. Numbers ramp where
   * `ramp` says so; switches (strings, booleans) change at their point. A macro is
   * "macros.<i>.value" (0..1); a step's lock still wins over it.
   */
  automate(path: string, points: AutoPoint[]) {
    if (!points.length) return;
    let a = this.auto.get(path);
    if (!a) {
      const keys = path.split(".");
      const macro = keys[0] === "macros" && keys[2] === "value" ? Number(keys[1]) : -1;
      a = { keys, macro, cur: null, pending: [] };
      this.auto.set(path, a);
    }
    for (const pt of points) {
      // points arrive in order; a point before the last one replaces what came after it
      let i = a.pending.length;
      while (i > 0 && a.pending[i - 1].at > pt.at) i--;
      a.pending.splice(i, a.pending.length - i, pt);
    }
  }

  /** The pitch strip on one note (D225): `value` −1..1 of the bend range, now. */
  noteBend(id: number, value: number) {
    for (const v of this.voices) if (v.active && v.id === id) v.wheel = value;
  }

  /** Automation ends at `at` (samples): every path goes back to the patch. */
  automateEnd(at: number) {
    this.queue({ at, kind: "automateEnd" });
  }

  /** Whether any path is automated (tests). */
  get automated() {
    return this.auto.size > 0;
  }

  /** Schedule a note; `at` and `end` are in samples; `bend`: its own bend (D223). */
  noteOn(id: number, note: number, velocity: number, at: number, bend?: NoteBend) {
    this.queue({ at, kind: "on", id, note, velocity, bend });
  }

  /**
   * A slide (303-style): note `from` keeps sounding (its note-off is dropped) and glides into
   * this one without a new attack.
   */
  slideTo(from: number, id: number, note: number, velocity: number, at: number, bend?: NoteBend) {
    // Compact first so eventHead stays consistent after the filter.
    if (this.eventHead > 0) {
      this.events.splice(0, this.eventHead);
      this.eventHead = 0;
    }
    this.events = this.events.filter((e) => !(e.kind === "off" && e.id === from));
    this.queue({ at, kind: "on", id, note, velocity, from, bend });
  }
  noteOff(id: number, at: number) {
    this.queue({ at, kind: "off", id });
  }
  releaseAll(at: number) {
    this.queue({ at, kind: "releaseAll" });
  }

  /**
   * Silence now (D99): every voice stops without its release, notes still to come are dropped,
   * and a macro lock ends. For stop: the next note starts from silence.
   */
  panic() {
    this.events = [];
    this.eventHead = 0;
    this.held = [];
    for (const v of this.voices) {
      v.active = false;
      v.phys?.clear();
      for (const e of v.envs) {
        e.stage = Stage.Idle;
        e.value = 0;
      }
    }
    if (this.lock || this.auto.size) {
      this.lock = null;
      this.auto.clear();
      this.setPatch(this.base);
    }
  }

  private queue(e: Event) {
    // Binary search for the insertion point among unread events (stable: equal `at` appended).
    const ev = this.events;
    let lo = this.eventHead;
    let hi = ev.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (ev[mid].at <= e.at) lo = mid + 1;
      else hi = mid;
    }
    ev.splice(lo, 0, e);
  }

  /** The mod matrix's output of the newest sounding voice (for the editor's knob rings). */
  modulation(): Float64Array | null {
    let newest: Voice | null = null;
    for (const v of this.voices) if (v.active && (!newest || v.order > newest.order)) newest = v;
    return newest ? newest.mod : null;
  }

  /** How many voices are sounding. */
  get active() {
    return this.voices.filter((v) => v.active).length;
  }

  /** Whether anything still sounds. */
  get busy() {
    return this.voices.some((v) => v.active) || this.events.length > this.eventHead;
  }

  /** Render `n` samples starting at sample `frame` into `left` and `right` (added to). */
  process(left: Float32Array, right: Float32Array, frame: number, n: number = left.length) {
    // Compact consumed events once per process() call to avoid unbounded growth.
    if (this.eventHead > 0) {
      this.events.splice(0, this.eventHead);
      this.eventHead = 0;
    }
    let pos = 0;
    while (pos < n) {
      // events due now
      while (this.eventHead < this.events.length && this.events[this.eventHead].at <= frame + pos)
        this.handle(this.events[this.eventHead++]);
      const remaining = this.events.length - this.eventHead;
      const nextEvent = remaining > 0 ? this.events[this.eventHead].at - frame : n;
      const len = Math.max(1, Math.min(CONTROL, n - pos, Math.ceil(nextEvent - pos)));
      this.resolve(frame + pos);
      this.block(left, right, pos, len);
      pos += len;
    }
  }

  // ---------- notes ----------

  private handle(e: Event) {
    if (e.kind === "tempo") {
      this.bpm = e.bpm;
      return;
    }
    if (e.kind === "automateEnd") {
      this.auto.clear();
      return this.setPatch(this.base);
    }
    if (e.kind === "macros") {
      if (e.values) this.lock = { id: e.id, values: e.values };
      else if (this.lock?.id === e.id) this.lock = null;
      else return;
      return this.setPatch(this.base);
    }
    const mode = this.patch.voice.mode;
    if (e.kind === "releaseAll") {
      this.held = [];
      for (const v of this.voices) this.release(v);
      return;
    }
    if (e.kind === "off") {
      if (mode !== "poly") {
        const top = this.held.at(-1);
        this.held = this.held.filter((h) => h.id !== e.id);
        const v = this.voices[0];
        if (top?.id === e.id && this.held.length) {
          // back to the note still held, without a new attack
          const prev = this.held.at(-1)!;
          this.glideTo(v, prev.note, true);
          v.id = prev.id;
          v.note = prev.note;
          return;
        }
        if (!this.held.length && v.id === e.id) this.letGo(v);
        return;
      }
      for (const v of this.voices)
        if (v.active && v.id === e.id && v.gate && v.holdUntil < 0) this.letGo(v);
      return;
    }
    const velocity = this.curveVelocity(e.velocity);
    if (e.from !== undefined) {
      const v = this.voices.find((x) => x.active && x.id === e.from);
      if (v) {
        // the patch's glide, or a short 303-like one
        v.slide = Math.max(this.patch.voice.glide, 0.06);
        v.target = e.note;
        v.id = e.id;
        v.note = e.note;
        v.velocity = velocity;
        this.lastPitch = e.note;
        this.held = this.held.map((h) =>
          h.id === e.from ? { id: e.id, note: e.note, velocity } : h,
        );
        // already let go (the note-off came first): hold it again, from where it is
        if (!v.gate) this.start(v, e.note, velocity, false);
        this.setBend(v, e.bend);
        return;
      }
    }
    if (mode !== "poly") {
      const v = this.voices[0];
      const overlapping = this.held.length > 0 && v.active && v.gate;
      this.held.push({ id: e.id, note: e.note, velocity });
      const legato = overlapping && mode === "legato";
      this.glideTo(v, e.note, overlapping);
      v.id = e.id;
      v.note = e.note;
      if (!legato) this.start(v, e.note, velocity, false);
      // legato: the new note's bend from now, without a new attack
      this.setBend(v, e.bend);
      return;
    }
    const v = this.allocate();
    const glide = this.patch.voice.glide > 0 && this.patch.voice.glideMode === "always";
    v.pitch = glide ? this.lastPitch : e.note;
    v.target = e.note;
    this.lastPitch = e.note;
    v.id = e.id;
    v.note = e.note;
    this.start(v, e.note, velocity, true);
    this.setBend(v, e.bend);
  }

  /** A voice's bend (D223) from now: its own, or none. */
  private setBend(v: Voice, bend: NoteBend | undefined) {
    v.wheel = 0;
    v.bend = bend ?? null;
    v.bendFrom = v.age;
    v.bendRelease = null;
    v.holdUntil = -1;
  }

  /** A note-off: released, or a Fall or Doit first (it keeps the note sounding, D221). */
  private letGo(v: Voice) {
    if (v.bend && atRelease(v.bend)) {
      v.bendRelease = v.age;
      v.holdUntil = v.age + releaseTail(v.bend, 60 / this.bpm);
      return;
    }
    this.release(v);
  }

  private glideTo(v: Voice, note: number, overlapping: boolean) {
    const p = this.patch.voice;
    const glide = p.glide > 0 && (p.glideMode === "always" || overlapping);
    v.target = note;
    if (!glide || !v.active) v.pitch = note;
    this.lastPitch = note;
  }

  private curveVelocity(v: number) {
    const c = this.patch.voice.velocityCurve;
    return Math.pow(Math.min(1, Math.max(0, v)), Math.pow(2, c * 1.5));
  }

  /** A free voice, or one to steal (it continues from its current level: no click). */
  private allocate(): Voice {
    const n = this.patch.voice.voices;
    const pool = this.voices.slice(0, n);
    const free = pool.find((v) => !v.active);
    if (free) return free;
    if (this.patch.voice.steal === "quietest")
      return pool.reduce((a, b) => (b.envs[0].value < a.envs[0].value ? b : a));
    // oldest, preferring notes that were released already
    const released = pool.filter((v) => !v.gate);
    return (released.length ? released : pool).reduce((a, b) => (b.order < a.order ? b : a));
  }

  private start(v: Voice, note: number, velocity: number, fresh: boolean) {
    const p = this.patch;
    const wasActive = v.active;
    v.active = true;
    v.gate = true;
    v.velocity = velocity;
    v.order = this.order++;
    v.random = rand();
    v.age = 0;
    for (let o = 0; o < 3; o++)
      for (let u = 0; u < MAX_UNISON; u++) {
        const i = o * MAX_UNISON + u;
        const osc = p.osc[o];
        // retriggered oscillators start where told; free-running ones keep going
        if (osc.retrigger || !wasActive) v.phases[i] = osc.retrigger ? osc.phase : Math.random();
      }
    if (!wasActive || fresh) {
      v.subPhase = 0;
      v.last1 = 0;
    }
    p.envs.forEach((e, i) => v.envs[i].start(1 - e.velocity + e.velocity * velocity));
    p.lfos.forEach((l, i) => l.mode === "voice" && v.lfos[i].reset(l.phase));
    if (!wasActive) v.pitch = v.target = note;
    v.fresh = true;
    if (p.source === "physical") {
      // a stolen or retriggered voice keeps ringing, like a string plucked again (D254)
      if (!v.phys) v.phys = new PhysVoice();
      if (!wasActive) v.phys.clear();
      v.phys.start(p.physical, 440 * Math.pow(2, (note - 69) / 12), velocity, this.sr);
    }
  }

  private release(v: Voice) {
    v.gate = false;
    v.holdUntil = -1;
    for (const e of v.envs) e.release();
  }

  // ---------- rendering ----------

  private lfoRate(i: number, mod: number) {
    const l = this.patch.lfos[i];
    const hz = l.sync ? 1 / (noteLengthQuarters(l.sync) * (60 / this.bpm)) : l.rate;
    return hz * Math.pow(2, mod);
  }

  /**
   * The automated values at `frame`, written into the working copy of the patch (D228): macros
   * first (their targets follow them), then the knobs and switches, so a lane wins over a macro
   * on the same knob (D227). Nothing is cloned once the copy exists.
   */
  private resolve(frame: number) {
    if (!this.auto.size) return;
    let w = this.work;
    let macrosMoved = false;
    if (!w) {
      w = this.work = clonePatch(this.rest);
      this.macroValues = w.macros.map((m) => m.value);
      macrosMoved = true;
    }
    for (const a of this.auto.values()) {
      while (a.pending.length && a.pending[0].at <= frame) a.cur = a.pending.shift()!;
      if (!a.cur || a.macro < 0 || this.lock) continue;
      const v = valueAt(a, frame);
      if (typeof v === "number" && this.macroValues[a.macro] !== v) {
        this.macroValues[a.macro] = v;
        macrosMoved = true;
      }
    }
    if (macrosMoved) {
      w.macros.forEach((m, i) => (m.value = this.macroValues[i] ?? m.value));
      for (const m of w.macros) for (const t of m.targets) setAt(w, t.path, macroAt(t, m.value));
    }
    for (const a of this.auto.values()) {
      if (!a.cur || a.macro >= 0) continue;
      setKeys(w, a.keys, valueAt(a, frame));
    }
    this.patch = w;
  }

  /** Render `len` (≤ CONTROL) samples at offset `pos`. */
  private block(left: Float32Array, right: Float32Array, pos: number, len: number) {
    const p = this.patch;
    const sr = this.sr;
    const blockSec = len / sr;
    // global LFOs (preallocated scratch — no Array allocation per block)
    const glfo = this.glfoScratch;
    for (let i = 0; i < 3; i++)
      glfo[i] =
        p.lfos[i].mode === "global"
          ? this.globalLfos[i].step(p.lfos[i].shape, this.lfoRate(i, 0) * blockSec)
          : 0;
    const outGain = Math.pow(10, p.output.volume / 20);
    for (let vi = 0; vi < this.voices.length; vi++) {
      const v = this.voices[vi];
      if (!v.active) continue;
      // a Fall or Doit is done: now the note is let go
      if (v.holdUntil >= 0 && v.age >= v.holdUntil) this.release(v);
      this.control(v, glfo, blockSec);
      this.render(v, left, right, pos, len, outGain);
      v.age += blockSec;
      if (v.envs[0].stage === Stage.Idle) v.active = false;
      // a physical model that has died away frees its voice (D254)
      if (p.source === "physical" && v.phys && v.age > 0.02) {
        const ex = p.physical.exciter.type;
        if (v.phys.settle(blockSec, ex === "pluck" || ex === "strike", v.gate)) v.active = false;
      }
    }
  }

  /** Envelopes 2–3, LFOs and the mod matrix for one voice; sets its per-block values. */
  private control(v: Voice, glfo: Float64Array, blockSec: number) {
    const p = this.patch;
    const sr = this.sr;
    const n = Math.round(blockSec * sr);
    const env2 = v.envs[1].step(p.envs[1], n, sr, v.gate);
    const env3 = v.envs[2].step(p.envs[2], n, sr, v.gate);
    const s = this.sources;
    for (let i = 0; i < 3; i++) {
      const l = p.lfos[i];
      let val =
        l.mode === "global"
          ? glfo[i]
          : v.lfos[i].step(l.shape, this.lfoRate(i, v.mod[LFO_RATE_DEST[i]]) * blockSec);
      if (l.unipolar) val = (val + 1) / 2;
      // fade in after the delay
      if (l.delay > 0) val *= Math.min(1, v.age / l.delay);
      s[i] = val;
    }
    s[3] = v.envs[0].value;
    s[4] = env2;
    s[5] = env3;
    s[6] = v.velocity;
    s[7] = (v.note - 60) / 60;
    s[8] = this.controls.modwheel;
    s[9] = this.controls.aftertouch;
    s[10] = this.controls.pitchbend;
    s[11] = v.random;
    for (let m = 0; m < 8; m++) s[12 + m] = p.macros[m]?.value ?? 0;

    v.mod.fill(0);
    for (const slot of p.matrix) {
      if (!slot.source || !slot.dest || slot.amount === 0) continue;
      let amt = slot.amount * s[SOURCE_INDEX[slot.source]];
      if (slot.via) amt *= s[SOURCE_INDEX[slot.via]];
      v.mod[DEST_INDEX[slot.dest]] += amt * MOD_DESTS[slot.dest].range;
    }
    const mod = (d: ModDest) => v.mod[DEST_INDEX[d]];

    // glide toward the target note
    if (v.pitch !== v.target) {
      const g = Math.max(0.001, v.slide || p.voice.glide);
      const k = 1 - Math.exp(-blockSec / (g / 4));
      v.pitch += (v.target - v.pitch) * k;
      if (Math.abs(v.target - v.pitch) < 0.001) {
        v.pitch = v.target;
        v.slide = 0;
      }
    }
    // the note's own bend (D223)
    const own = v.bend
      ? bendAt(
          v.bend,
          v.age - v.bendFrom,
          v.bendRelease === null ? null : v.bendRelease - v.bendFrom,
          60 / this.bpm,
        )
      : 0;
    const base =
      v.pitch +
      own +
      mod("pitch") +
      (this.controls.pitchbend + v.wheel) * p.voice.bend +
      p.voice.tune / 100;

    // oscillators: increments, stereo gains, shapes
    const spreadPan = (u: number, n: number) => (n > 1 ? (u / (n - 1)) * 2 - 1 : 0);
    for (let o = 0; o < 3; o++) {
      const osc = p.osc[o];
      const od = OSC_DEST[o]; // precomputed destination indexes for this oscillator (P3.4)
      v.shape[o] = Math.min(3, Math.max(0, osc.shape + v.mod[od.shape]));
      v.pw[o] = Math.min(0.95, Math.max(0.05, osc.pw + v.mod[od.pw]));
      v.level[o] = osc.on ? Math.min(1, Math.max(0, osc.level + v.mod[od.level])) : 0;
      const semis = base + osc.octave * 12 + osc.semi + osc.fine / 100 + v.mod[od.pitch];
      const n = osc.unison;
      for (let u = 0; u < n; u++) {
        const i = o * MAX_UNISON + u;
        // analog drift: a slow random walk of a few cents
        if (osc.drift > 0) {
          if (Math.random() < blockSec * 4) v.driftTarget[i] = rand() * osc.drift * 12;
          v.drift[i] += (v.driftTarget[i] - v.drift[i]) * Math.min(1, blockSec * 3);
        }
        const detune = n > 1 ? spreadPan(u, n) * osc.detune * 0.5 : 0;
        const hz = 440 * Math.pow(2, (semis - 69 + (detune + v.drift[i]) / 100) / 12);
        v.incs[i] = Math.min(0.49, hz / sr);
        // constant-power pan: the oscillator's, its unison spread, and the voice spread
        const voicePan = ((v.order % 2) * 2 - 1) * p.output.spread * 0.4;
        const pan = Math.max(
          -1,
          Math.min(1, osc.pan + spreadPan(u, n) * osc.width + voicePan + p.output.pan + mod("pan")),
        );
        const angle = ((pan + 1) * Math.PI) / 4;
        const g = 1 / Math.sqrt(n);
        v.gainsL[i] = Math.cos(angle) * g;
        v.gainsR[i] = Math.sin(angle) * g;
      }
    }
    // wavetables (D244): the table in the slot that plays, its mip levels, position and warp
    for (let o = 0; o < 3; o++) {
      const osc = p.osc[o];
      const od = OSC_DEST[o];
      const id = osc.slot > 0 ? (osc.tables[osc.slot - 1] ?? osc.table) : osc.table;
      // a table that hasn't arrived yet plays as the analog morph at the same place (D243)
      const m = osc.type === "wavetable" ? (TABLES.get(id) ?? null) : null;
      v.wt[o] = m;
      if (osc.type !== "wavetable") continue;
      const position = Math.min(1, Math.max(0, osc.position + v.mod[od.position]));
      const warp = Math.min(1, Math.max(0, osc.warpAmount + v.mod[od.warp]));
      v.posFrom[o] = v.fresh ? position : v.posTo[o];
      v.warpFrom[o] = v.fresh ? warp : v.warpTo[o];
      v.posTo[o] = position;
      v.warpTo[o] = warp;
      if (m) v.wtLevel[o] = levelFor(v.incs[o * MAX_UNISON], m.sizes.length);
      else v.shape[o] = position * 3;
    }
    v.fresh = false;
    if (p.source === "physical" && v.phys) {
      const pm: PhysMods = {
        hardness: mod("phys.hardness"),
        position: mod("phys.position"),
        pressure: mod("phys.pressure"),
        decay: mod("phys.decay"),
        damping: mod("phys.damping"),
        structure: mod("phys.structure"),
        pickup: mod("phys.pickup"),
      };
      v.phys.block(p.physical, 440 * Math.pow(2, (base - 69) / 12), sr, v.gate, pm);
      // its stereo place: the patch's pan, the voice spread, modulation
      const voicePan = ((v.order % 2) * 2 - 1) * p.output.spread * 0.4;
      const pan = Math.max(-1, Math.min(1, p.output.pan + voicePan + mod("pan")));
      const angle = ((pan + 1) * Math.PI) / 4;
      v.physL = Math.cos(angle);
      v.physR = Math.sin(angle);
    }
    v.subLevel = Math.min(1, Math.max(0, p.sub.level + mod("sub.level")));
    v.noiseLevel = Math.min(1, Math.max(0, p.noise.level + mod("noise.level")));
    v.ring = Math.min(1, Math.max(0, p.ring + mod("ring")));
    v.fm = Math.max(0, p.fm.amount + mod("fm"));
    v.amp = Math.max(0, 1 + mod("amp"));
    v.pan = mod("pan");

    // filters: cutoff from the knob, key, envelope, velocity, drift and modulation
    for (let f = 0; f < 2; f++) {
      const fl = p.filters[f];
      if (!fl.on) continue;
      const fd = FILTER_DEST[f]; // precomputed destination indexes for this filter (P3.4)
      const octaves =
        fl.keytrack * ((v.pitch - 60) / 12) +
        fl.env * env2 +
        fl.velocity * (v.velocity - 0.5) +
        v.mod[fd.cutoff];
      const cutoff = Math.min(20000, Math.max(20, fl.cutoff * Math.pow(2, octaves)));
      const reso = Math.min(1, Math.max(0, fl.reso + v.mod[fd.reso]));
      const kind = fl.model === "ladder" && fl.type === "lp" ? "ladder" : "svf";
      const switched = v.filterKind[f] !== kind;
      v.filterKind[f] = kind;
      for (let ch = 0; ch < 2; ch++) {
        const u = v.filters[ch][f];
        if (switched) {
          // what the other filter held long ago would ring out: start from silence
          u.ladder.s.fill(0);
          u.svf.ic1 = u.svf.ic2 = 0;
        }
        if (kind === "ladder") u.ladder.set(cutoff, reso, sr);
        else u.svf.set(cutoff, reso, sr);
      }
    }
  }

  private render(
    v: Voice,
    left: Float32Array,
    right: Float32Array,
    pos: number,
    len: number,
    outGain: number,
  ) {
    const p = this.patch;
    const sr = this.sr;
    const amp = p.envs[0];
    const [o1, o2, o3] = p.osc;
    const route = p.fm.route;
    const fmOn = v.fm > 0;
    const modOsc = route === "2>1" ? 1 : route === "1>1" ? 0 : 2;
    const carrier = route === "3>2" ? 1 : 0;
    const syncing = (o2.on && o2.sync) || (o3.on && o3.sync);
    const phys = p.source === "physical" ? v.phys : null;
    // a physical model only hears the oscillators when they're its exciter
    const oscillators = !phys || p.physical.exciter.type === "oscillators";
    // which oscillators need computing this block (scratch: no allocation per block)
    const needed = v.neededScratch;
    needed[0] = +(
      oscillators &&
      o1.on &&
      (v.level[0] > 0 || v.ring > 0 || syncing || (fmOn && modOsc === 0) || isWarpFm(o1))
    );
    needed[1] = +(
      oscillators &&
      o2.on &&
      (v.level[1] > 0 || v.ring > 0 || (fmOn && modOsc === 1) || isWarpFm(o2))
    );
    needed[2] = +(
      oscillators &&
      o3.on &&
      (v.level[2] > 0 || (fmOn && modOsc === 2) || isWarpFm(o3))
    );
    // modulators are computed first; ORDER_012 avoids allocating the common case (scratch for FM)
    let order: ArrayLike<number>;
    if (fmOn && modOsc > carrier) {
      const s = v.orderScratch;
      s[0] = modOsc;
      let j = 1;
      for (let o = 0; o < 3; o++) if (o !== modOsc) s[j++] = o;
      order = s;
    } else {
      order = ORDER_012;
    }
    const fl = p.filters;
    // filter pre-drive gains (scratch: no allocation per block)
    const preGain = v.preGainScratch;
    preGain[0] = driveGain(fl[0].drive + v.mod[DEST_INDEX["filter1.drive"]]);
    preGain[1] = driveGain(fl[1].drive);
    const outDrive = p.output.drive;
    // hoist 1/tanh(k) out of the sample loop — k is constant per block (P3.2)
    const outK = outDrive > 0.01 ? 1 + outDrive * 6 : 0;
    const invTanhK = outK > 0 ? 1 / Math.tanh(outK) : 0;
    // per-sample oscillator output (scratch: no allocation per block)
    const mono = v.monoScratch;
    for (let n = 0; n < len; n++) {
      const env = v.envs[0].step(amp, 1, sr, v.gate);
      let l = 0;
      let r = 0;
      let sync1 = -1;
      for (let oi = 0; oi < 3; oi++) {
        const o = order[oi];
        if (!needed[o]) {
          mono[o] = 0;
          continue;
        }
        const osc = p.osc[o];
        const pm =
          fmOn && o === carrier ? (v.fm * (modOsc === 0 ? v.last1 : mono[modOsc])) / TWO_PI : 0;
        // a wavetable: position and warp ramped across the block, so sweeps don't step
        const table = v.wt[o];
        const ramp = (n + 1) / len;
        const position = v.posFrom[o] + (v.posTo[o] - v.posFrom[o]) * ramp;
        const warpAmt = v.warpFrom[o] + (v.warpTo[o] - v.warpFrom[o]) * ramp;
        const fmIn = v.lastMono[(o + 1) % 3];
        let sum = 0;
        for (let u = 0; u < osc.unison; u++) {
          const i = o * MAX_UNISON + u;
          const dt = v.incs[i];
          let t = v.phases[i] + dt;
          if (t >= 1) {
            t -= 1;
            // oscillator 1 wrapped: remember when, for synced oscillators
            if (o === 0 && u === 0) sync1 = t / dt;
          }
          // hard sync: restart with oscillator 1, at the same point within the sample
          if (o > 0 && osc.sync && sync1 >= 0) t = sync1 * dt;
          v.phases[i] = t;
          let s: number;
          if (table) {
            const ph = frac(t + pm);
            const w = osc.warp === "none" ? ph : warpPhase(osc.warp, warpAmt, ph, fmIn);
            s = readTable(table, position, osc.smooth, w, v.wtLevel[o]);
            if (osc.warp === "formant") s *= formantGain(ph);
          } else s = wave(v.shape[o], v.pw[o], frac(t + pm), dt);
          sum += s;
          if (v.level[o] > 0) {
            l += s * v.gainsL[i] * v.level[o];
            r += s * v.gainsR[i] * v.level[o];
          }
        }
        mono[o] = sum / osc.unison;
      }
      for (let o = 0; o < 3; o++) v.lastMono[o] = mono[o];
      if (fmOn && modOsc === 0) v.last1 = mono[0];
      // sub, noise, ring: in the middle
      let c = 0;
      if (v.subLevel > 0) {
        v.subPhase = frac(v.subPhase + v.incs[0] / (p.sub.octave === -2 ? 4 : 2));
        c +=
          v.subLevel *
          (p.sub.shape === "sine" ? Math.sin(TWO_PI * v.subPhase) : v.subPhase < 0.5 ? 0.8 : -0.8);
      }
      if (v.noiseLevel > 0) {
        const w = rand();
        if (p.noise.color === "white") c += w * v.noiseLevel * 0.5;
        else {
          const b = v.pink;
          b[0] = 0.99886 * b[0] + w * 0.0555179;
          b[1] = 0.99332 * b[1] + w * 0.0750759;
          b[2] = 0.969 * b[2] + w * 0.153852;
          b[3] = 0.8665 * b[3] + w * 0.3104856;
          b[4] = 0.55 * b[4] + w * 0.5329522;
          b[5] = -0.7616 * b[5] - w * 0.016898;
          c += (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362) * 0.11 * v.noiseLevel;
          b[6] = w * 0.115926;
        }
      }
      if (v.ring > 0) c += mono[0] * mono[1] * v.ring;
      l += c * 0.707;
      r += c * 0.707;
      if (phys) {
        // the oscillators (if they're its exciter) into the physical model (D249)
        phys.tick(p.physical, (l + r) * 0.5);
        l = phys.outLeft * v.physL;
        r = phys.outRight * v.physR;
      }

      l = this.filter(v, 0, l, preGain);
      r = this.filter(v, 1, r, preGain);
      const g = env * v.amp * outGain;
      l *= g;
      r *= g;
      if (outK > 0) {
        l = Math.tanh(l * outK) * invTanhK;
        r = Math.tanh(r * outK) * invTanhK;
      }
      left[pos + n] += l;
      right[pos + n] += r;
    }
  }

  /** Both filters for one channel of a voice, in series or parallel. */
  private filter(v: Voice, ch: number, x: number, preGain: Float64Array) {
    const fl = this.patch.filters;
    const units = v.filters[ch];
    if (this.patch.routing === "parallel" && fl[1].on && fl[0].on)
      return (
        (this.runFilter(units[0], 0, x, preGain[0]) + this.runFilter(units[1], 1, x, preGain[1])) *
        0.6
      );
    return this.runFilter(units[1], 1, this.runFilter(units[0], 0, x, preGain[0]), preGain[1]);
  }

  private runFilter(u: FilterUnit, f: number, x: number, pre: number) {
    const fp = this.patch.filters[f];
    if (!fp.on) return x;
    const d = fp.drive > 0 ? Math.tanh(x * pre) / Math.tanh(pre) : x;
    return fp.model === "ladder" && fp.type === "lp"
      ? u.ladder.process(d)
      : u.svf.process(d, fp.type);
  }
}

/** A path's value at `frame`: its point in force, or on the way to the next (a ramp). */
function valueAt(a: AutoPath, frame: number): AutoValue {
  const cur = a.cur!;
  const next = a.pending[0];
  if (
    next?.ramp &&
    typeof cur.v === "number" &&
    typeof next.v === "number" &&
    next.at > cur.at &&
    frame > cur.at
  )
    return cur.v + (next.v - cur.v) * Math.min(1, (frame - cur.at) / (next.at - cur.at));
  return cur.v;
}

/** Write a value at a path that's already split ("filters", "0", "cutoff"). */
function setKeys(p: SynthPatch, keys: string[], v: AutoValue) {
  let obj = p as unknown as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    obj = obj[keys[i]] as Record<string, unknown>;
    if (!obj) return;
  }
  const last = keys[keys.length - 1];
  if (last in obj) obj[last] = v;
}

/** Paths split once (macro targets are written on every block while a macro moves). */
const split = new Map<string, string[]>();

/** A macro target's value (a number path). */
function setAt(p: SynthPatch, path: string, v: number) {
  let keys = split.get(path);
  if (!keys) split.set(path, (keys = path.split(".")));
  setKeys(p, keys, v);
}

export { applyMacros };
