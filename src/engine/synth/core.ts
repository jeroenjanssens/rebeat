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
  withMacroValues,
  noteLengthQuarters,
  type Env,
  type ModDest,
  type ModSource,
  type SynthPatch,
} from "../../model/synth";

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
    const inc = (t: number) => n / Math.max(1, t * sr);
    switch (this.stage) {
      case Stage.Idle:
        return 0;
      case Stage.Attack:
        this.x += inc(e.attack);
        if (this.x >= 1) {
          this.value = this.peak;
          this.stage = e.hold > 0 ? Stage.Hold : Stage.Decay;
          this.x = 0;
          this.from = this.peak;
        } else this.value = this.from + (this.peak - this.from) * curve(this.x, e.attackCurve);
        break;
      case Stage.Hold:
        this.x += inc(e.hold);
        if (this.x >= 1) {
          this.stage = Stage.Decay;
          this.x = 0;
        }
        break;
      case Stage.Decay: {
        this.x += inc(e.decay);
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
        this.x += inc(e.release);
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
  /** The mod matrix's output per destination (natural units). */
  mod = new Float64Array(Object.keys(MOD_DESTS).length);
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
}

type Event =
  /** `from`: a 303-style slide from that note (held on, gliding, without a new attack). */
  | { at: number; kind: "on"; id: number; note: number; velocity: number; from?: number }
  | { at: number; kind: "off"; id: number }
  | { at: number; kind: "releaseAll" }
  /** A parameter lock on the macros (values), or its end (null: back unless locked again since). */
  | { at: number; kind: "macros"; id: number; values: number[] | null };

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
  private voices: Voice[] = Array.from({ length: 16 }, () => new Voice());
  private globalLfos = [new LfoState(), new LfoState(), new LfoState()];
  private events: Event[] = [];
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
    this.patch = applyMacros(this.lock ? withMacroValues(patch, this.lock.values) : patch);
  }

  /** Lock the macros at `values` from `at` (samples); `values` null ends lock `id`. */
  lockMacros(id: number, values: number[] | null, at: number) {
    this.queue({ at, kind: "macros", id, values });
  }

  setTempo(bpm: number) {
    this.bpm = bpm;
  }

  /** Schedule a note; `at` and `end` are in samples. */
  noteOn(id: number, note: number, velocity: number, at: number) {
    this.queue({ at, kind: "on", id, note, velocity });
  }

  /**
   * A slide (303-style): note `from` keeps sounding (its note-off is dropped) and glides into
   * this one without a new attack.
   */
  slideTo(from: number, id: number, note: number, velocity: number, at: number) {
    this.events = this.events.filter((e) => !(e.kind === "off" && e.id === from));
    this.queue({ at, kind: "on", id, note, velocity, from });
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
    this.held = [];
    for (const v of this.voices) {
      v.active = false;
      for (const e of v.envs) {
        e.stage = Stage.Idle;
        e.value = 0;
      }
    }
    if (this.lock) {
      this.lock = null;
      this.setPatch(this.base);
    }
  }

  private queue(e: Event) {
    // keep the queue sorted (events mostly arrive in order)
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].at > e.at) i--;
    this.events.splice(i, 0, e);
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
    return this.voices.some((v) => v.active) || this.events.length > 0;
  }

  /** Render `n` samples starting at sample `frame` into `left` and `right` (added to). */
  process(left: Float32Array, right: Float32Array, frame: number, n: number = left.length) {
    let pos = 0;
    while (pos < n) {
      // events due now
      while (this.events.length && this.events[0].at <= frame + pos)
        this.handle(this.events.shift()!);
      const nextEvent = this.events.length ? this.events[0].at - frame : n;
      const len = Math.max(1, Math.min(CONTROL, n - pos, Math.ceil(nextEvent - pos)));
      this.block(left, right, pos, len);
      pos += len;
    }
  }

  // ---------- notes ----------

  private handle(e: Event) {
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
        if (!this.held.length && v.id === e.id) this.release(v);
        return;
      }
      for (const v of this.voices) if (v.active && v.id === e.id && v.gate) this.release(v);
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
      if (legato) return;
      this.start(v, e.note, velocity, false);
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
  }

  private release(v: Voice) {
    v.gate = false;
    for (const e of v.envs) e.release();
  }

  // ---------- rendering ----------

  private lfoRate(i: number, mod: number) {
    const l = this.patch.lfos[i];
    const hz = l.sync ? 1 / (noteLengthQuarters(l.sync) * (60 / this.bpm)) : l.rate;
    return hz * Math.pow(2, mod);
  }

  /** Render `len` (≤ CONTROL) samples at offset `pos`. */
  private block(left: Float32Array, right: Float32Array, pos: number, len: number) {
    const p = this.patch;
    const sr = this.sr;
    const blockSec = len / sr;
    // global LFOs
    const glfo = this.globalLfos.map((l, i) =>
      p.lfos[i].mode === "global" ? l.step(p.lfos[i].shape, this.lfoRate(i, 0) * blockSec) : 0,
    );
    const outGain = Math.pow(10, p.output.volume / 20);
    for (let vi = 0; vi < this.voices.length; vi++) {
      const v = this.voices[vi];
      if (!v.active) continue;
      this.control(v, glfo, blockSec);
      this.render(v, left, right, pos, len, outGain);
      v.age += blockSec;
      if (v.envs[0].stage === Stage.Idle) v.active = false;
    }
  }

  /** Envelopes 2–3, LFOs and the mod matrix for one voice; sets its per-block values. */
  private control(v: Voice, glfo: number[], blockSec: number) {
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
          : v.lfos[i].step(
              l.shape,
              this.lfoRate(i, v.mod[DEST_INDEX[`lfo${i + 1}.rate` as ModDest]]) * blockSec,
            );
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
    const base =
      v.pitch + mod("pitch") + this.controls.pitchbend * p.voice.bend + p.voice.tune / 100;

    // oscillators: increments, stereo gains, shapes
    const spreadPan = (u: number, n: number) => (n > 1 ? (u / (n - 1)) * 2 - 1 : 0);
    for (let o = 0; o < 3; o++) {
      const osc = p.osc[o];
      const key = `osc${o + 1}` as "osc1";
      v.shape[o] = Math.min(3, Math.max(0, osc.shape + mod(`${key}.shape` as ModDest)));
      v.pw[o] = Math.min(0.95, Math.max(0.05, osc.pw + mod(`${key}.pw` as ModDest)));
      v.level[o] = osc.on
        ? Math.min(1, Math.max(0, osc.level + mod(`${key}.level` as ModDest)))
        : 0;
      const semis =
        base + osc.octave * 12 + osc.semi + osc.fine / 100 + mod(`${key}.pitch` as ModDest);
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
      const octaves =
        fl.keytrack * ((v.pitch - 60) / 12) +
        fl.env * env2 +
        fl.velocity * (v.velocity - 0.5) +
        mod(`filter${f + 1}.cutoff` as ModDest);
      const cutoff = Math.min(20000, Math.max(20, fl.cutoff * Math.pow(2, octaves)));
      const reso = Math.min(1, Math.max(0, fl.reso + mod(`filter${f + 1}.reso` as ModDest)));
      for (let ch = 0; ch < 2; ch++) {
        const u = v.filters[ch][f];
        if (fl.model === "ladder" && fl.type === "lp") u.ladder.set(cutoff, reso, sr);
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
    const needed = [
      o1.on && (v.level[0] > 0 || v.ring > 0 || syncing || (fmOn && modOsc === 0)),
      o2.on && (v.level[1] > 0 || v.ring > 0 || (fmOn && modOsc === 1)),
      o3.on && (v.level[2] > 0 || (fmOn && modOsc === 2)),
    ];
    // modulators are computed first
    const order =
      fmOn && modOsc > carrier ? [modOsc, ...[0, 1, 2].filter((o) => o !== modOsc)] : [0, 1, 2];
    const fl = p.filters;
    const drive = (d: number) => 1 + d * 8;
    const preGain = [drive(fl[0].drive + v.mod[DEST_INDEX["filter1.drive"]]), drive(fl[1].drive)];
    const outDrive = p.output.drive;
    const mono = new Float64Array(3);
    for (let n = 0; n < len; n++) {
      const env = v.envs[0].step(amp, 1, sr, v.gate);
      let l = 0;
      let r = 0;
      let sync1 = -1;
      for (const o of order) {
        if (!needed[o]) {
          mono[o] = 0;
          continue;
        }
        const osc = p.osc[o];
        const pm =
          fmOn && o === carrier ? (v.fm * (modOsc === 0 ? v.last1 : mono[modOsc])) / TWO_PI : 0;
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
          const s = wave(v.shape[o], v.pw[o], frac(t + pm), dt);
          sum += s;
          if (v.level[o] > 0) {
            l += s * v.gainsL[i] * v.level[o];
            r += s * v.gainsR[i] * v.level[o];
          }
        }
        mono[o] = sum / osc.unison;
      }
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

      l = this.filter(v, 0, l, preGain);
      r = this.filter(v, 1, r, preGain);
      const g = env * v.amp * outGain;
      l *= g;
      r *= g;
      if (outDrive > 0.01) {
        const k = 1 + outDrive * 6;
        l = Math.tanh(l * k) / Math.tanh(k);
        r = Math.tanh(r * k) / Math.tanh(k);
      }
      left[pos + n] += l;
      right[pos + n] += r;
    }
  }

  /** Both filters for one channel of a voice, in series or parallel. */
  private filter(v: Voice, ch: number, x: number, preGain: number[]) {
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

export { applyMacros };
