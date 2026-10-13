/**
 * Effects are data ({ id, name, params, bypass }). This factory maps them to Tone.js nodes, so
 * the same definitions drive track inserts, buses, the master chain and offline rendering.
 */
import * as Tone from "tone";
import { DELAY_TIMES, EFFECT_PARAMS, PUMP_RATES, lin, toUnit } from "../model/params";
import { FlatEQ } from "./tone";
import { NOT_AUTOMATABLE } from "../model/automation";
import type { Effect } from "../model/types";

/** A point of an automation curve at an audio time (D186): set to `v` there, or ramp to it. */
export interface AutoEvent {
  t: number;
  /** The knob's position, 0..1. */
  v: number;
  ramp: boolean;
}

/** Anything with AudioParam's scheduling methods (a native AudioParam or a Tone Param). */
export interface Schedulable {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

/** Params that automation moved, so stop can hand them back to their knobs. */
export const automatedParams = new Set<Schedulable>();

/** Schedule automation events on a param, through `unit` (knob → real value). */
export function schedule(
  param: Schedulable,
  events: AutoEvent[],
  unit: (v: number) => number,
  exp = false,
  stepped = false,
) {
  automatedParams.add(param);
  for (const e of events) {
    const x = unit(e.v);
    if (!e.ramp || stepped) param.setValueAtTime(x, e.t);
    else if (exp && x > 0) param.exponentialRampToValueAtTime(x, e.t);
    else param.linearRampToValueAtTime(x, e.t);
  }
}

export interface FxNode {
  input: Tone.Gain;
  output: Tone.Gain;
  /** Resolves when the effect can process audio (the reverb builds its impulse response). */
  ready: Promise<void>;
  update(fx: Effect, bpm: number): void;
  /** Effects that follow the beat (Pump): the page step at `time`, from `posQ` for `stepQ`
   * quarter notes of `secPerQ` seconds each. */
  onStep?(time: number, posQ: number, stepQ: number, secPerQ: number): void;
  /** Effects synced to the tempo follow a tempo change at its audio time (D192). */
  tempo?(bpm: number, time: number): void;
  /** Automation of one of its knobs (D186, D206): any knob but the ones that rebuild it. */
  automate(param: string, events: AutoEvent[]): void;
  /** Automation ended: back to the knobs. */
  release(): void;
  dispose(): void;
}

const DELAY_QUARTERS: Record<string, number> = {
  "1/32": 0.125,
  "1/16": 0.25,
  "1/8T": 1 / 3,
  "1/8": 0.5,
  "1/8.": 0.75,
  "1/4": 1,
  "1/4.": 1.5,
  "1/2": 2,
};

type Params = Record<string, number>;

/**
 * Where a knob goes (D206): an AudioParam and the knob's real value for it (from its position,
 * the other knobs and the tempo). Setting a knob and automating it use the same table, so
 * every knob reaches offline renders, and a knob that's automated isn't set from the store.
 */
interface Target {
  param: Schedulable;
  unit: (x: number, p: Params, bpm: number) => number;
  /** Ramps go exponentially (frequencies). */
  exp?: boolean;
  /** Stepped values jump (a delay time, bits). */
  stepped?: boolean;
  /** Knob changes glide over this many seconds (a jump would click). */
  glide?: number;
}

type Inner = {
  /** A chain of nodes, or `io` for an effect with its own input and output. */
  nodes: Tone.ToneAudioNode[];
  io?: { input: Tone.ToneAudioNode; output: Tone.ToneAudioNode };
  /** What isn't an AudioParam (types, impulse responses), set from the knobs. */
  set?: (p: Params, bpm: number) => void;
  /** Every knob that can move at an audio time, and its targets. */
  knobs: Record<string, Target[]>;
  ready?: Promise<void>;
  onStep?: FxNode["onStep"];
  tempo?: FxNode["tempo"];
  /** Knobs read at each step rather than scheduled (Pump's). */
  stepKnob?: (param: string, value: number | null) => void;
  /** Nodes outside the chain (sources, LFOs), disposed with it. */
  extra?: { dispose(): unknown }[];
};

const ms = (lo: number, hi: number, x: number) => toUnit.ms(lo, hi)(x) / 1000;
const rate = (lo: number, hi: number, x: number) => lo * Math.pow(hi / lo, x);
/** A knob's value, or its default. */
const val = (name: string, p: Params, id: string) =>
  p[id] ?? EFFECT_PARAMS[name]?.find((d) => d.id === id)?.default ?? 0.5;
const k = (param: Target["param"], unit: Target["unit"], more: Partial<Target> = {}): Target => ({
  param,
  unit,
  ...more,
});
const hzOf = (x: number) => toUnit.hz(x);

/** A stereo effect from Tone's parts: the input as two channels, a chain per side, merged. */
function stereo(left: AudioNode[], right: AudioNode[]) {
  const input = new Tone.Gain(1);
  // mono sources become stereo, as in Tone's StereoEffect
  input.channelCount = 2;
  input.channelCountMode = "explicit";
  const split = new Tone.Split(2);
  const merge = new Tone.Merge(2);
  input.connect(split);
  const chain = (nodes: AudioNode[], ch: number) => {
    split.connect(nodes[0] as never, ch, 0);
    for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]);
    Tone.connect(nodes[nodes.length - 1], merge, 0, ch);
  };
  chain(left, 0);
  chain(right, 1);
  return { input, split, merge };
}

function build(name: string, p: Params): Inner {
  const raw = Tone.getContext().rawContext as unknown as BaseAudioContext;
  switch (name) {
    case "EQ3": {
      const eq = new FlatEQ();
      const db = toUnit.db(-15, 15);
      const lowHz = (q: Params, x = val(name, q, "lowFreq")) => Math.min(2000, hzOf(x));
      const highHz = (q: Params, lo = lowHz(q), x = val(name, q, "highFreq")) =>
        Math.max(lo * 1.5, hzOf(x));
      return {
        nodes: [eq],
        knobs: {
          low: [k(eq.low.gain, db)],
          mid: [k(eq.mid.gain, db)],
          high: [k(eq.high.gain, db)],
          lowFreq: [
            k(eq.low.frequency, (x) => lowHz(p, x), { exp: true }),
            k(eq.mid.frequency, (x, q) => Math.sqrt(lowHz(q, x) * highHz(q, lowHz(q, x))), {
              exp: true,
            }),
          ],
          highFreq: [
            k(eq.high.frequency, (x, q) => highHz(q, lowHz(q), x), { exp: true }),
            k(eq.mid.frequency, (x, q) => Math.sqrt(lowHz(q) * highHz(q, lowHz(q), x)), {
              exp: true,
            }),
          ],
        },
      };
    }
    case "Filter": {
      // the cutoff is a signal of its own (so automation can move it at an audio time, D189),
      // with the sweep's LFO added on top: from the cutoff up `depth × 4` octaves, as AutoFilter
      const filter = new Tone.Filter({ type: "lowpass", rolloff: -12, Q: 1, frequency: 0 });
      const base = new Tone.Signal({ value: 1000, units: "frequency" });
      const lfo = new Tone.LFO({ frequency: 1, min: 0, max: 1 }).start();
      // the LFO's sweep in Hz: a gain, so the amount can be automated too (D206)
      const amount = new Tone.Gain(0);
      base.connect(filter.frequency);
      lfo.connect(amount);
      amount.connect(filter.frequency);
      const sweep = (hz: number, depth: number) => hz * (Math.pow(2, depth * 4) - 1);
      return {
        nodes: [filter],
        extra: [base, lfo, amount],
        set: (q) => {
          filter.type = (["lowpass", "highpass", "bandpass"] as const)[
            Math.round(val(name, q, "type") * 2)
          ];
        },
        knobs: {
          cutoff: [
            k(base, hzOf, { exp: true }),
            k(amount.gain, (x, q) => sweep(hzOf(x), val(name, q, "depth"))),
          ],
          reso: [k(filter.Q, toUnit.q)],
          rate: [k(lfo.frequency, (x) => rate(0.05, 20, x))],
          depth: [k(amount.gain, (x, q) => sweep(hzOf(val(name, q, "cutoff")), x))],
        },
      };
    }
    case "Compressor": {
      const c = new Tone.Compressor();
      const makeup = new Tone.Gain(1);
      return {
        nodes: [c, makeup],
        knobs: {
          threshold: [k(c.threshold, toUnit.db(-60, 0))],
          ratio: [k(c.ratio, lin(1, 20))],
          attack: [k(c.attack, (x) => ms(0.1, 200, x))],
          release: [k(c.release, (x) => ms(10, 2000, x))],
          makeup: [k(makeup.gain, (x) => Tone.dbToGain(toUnit.db(0, 24)(x)))],
        },
      };
    }
    case "Distortion": {
      // pre-gain into a fixed tanh curve, then 1/√g back (as the channel's Drive): gains, so
      // the drive can be automated (D206)
      const pre = new Tone.Gain(1);
      const shaper = new Tone.WaveShaper((x) => Math.tanh(DRIVE_MAX * x), 16384);
      shaper.oversample = "2x";
      const post = new Tone.Gain(1);
      const tone = new Tone.Filter(8000, "lowpass");
      const out = new Tone.Gain(1);
      const g = (x: number) => 1 + x * 20;
      return {
        nodes: [pre, shaper, post, tone, out],
        knobs: {
          drive: [k(pre.gain, (x) => g(x) / DRIVE_MAX), k(post.gain, (x) => 1 / Math.sqrt(g(x)))],
          tone: [k(tone.frequency, hzOf, { exp: true })],
          output: [k(out.gain, (x) => Tone.dbToGain(toUnit.db(-12, 12)(x)))],
        },
      };
    }
    case "Bitcrusher": {
      const b = new Tone.BitCrusher(8);
      b.wet.value = 1;
      const tone = new Tone.Filter(20000, "lowpass");
      return {
        nodes: [b, tone],
        knobs: {
          bits: [k(b.bits, (x) => Math.round(lin(2, 16)(x)), { stepped: true })],
          tone: [k(tone.frequency, hzOf, { exp: true })],
        },
      };
    }
    case "Delay": {
      const pingPong = val(name, p, "spread") >= 0.5;
      const d = pingPong ? new Tone.PingPongDelay(0.25, 0.35) : new Tone.FeedbackDelay(0.25, 0.35);
      d.wet.value = 1;
      const tone = new Tone.Filter(6000, "lowpass");
      let quarters = 0.5;
      const seconds = (x: number, bpm: number) => {
        quarters = DELAY_QUARTERS[DELAY_TIMES[Math.round(x * (DELAY_TIMES.length - 1))]];
        return quarters * (60 / bpm);
      };
      return {
        nodes: [d, tone],
        knobs: {
          time: [k(d.delayTime, (x, _q, bpm) => seconds(x, bpm), { stepped: true, glide: 0.05 })],
          feedback: [k(d.feedback, (x) => Math.min(0.95, x))],
          tone: [k(tone.frequency, hzOf, { exp: true })],
        },
        // the echo follows the tempo, ramping over the step (a jump would click)
        tempo: (bpm, time) => d.delayTime.linearRampToValueAtTime(quarters * (60 / bpm), time),
      };
    }
    case "Reverb": {
      const decayOf = (q: Params) =>
        Math.max(0.1, ms(100, 10000, val(name, q, "decay")) * (0.5 + val(name, q, "size")));
      let lastDecay = decayOf(p);
      const r = new Tone.Reverb({ decay: lastDecay, preDelay: 0.01 });
      r.wet.value = 1;
      const damp = new Tone.Filter(12000, "lowpass");
      let timer = 0;
      return {
        nodes: [r, damp],
        ready: r.ready,
        set: (q) => {
          const decay = decayOf(q);
          // regenerating the impulse response is costly: only for real changes, debounced
          if (Math.abs(decay - lastDecay) / decay > 0.03) {
            lastDecay = decay;
            clearTimeout(timer);
            timer = window.setTimeout(() => (r.decay = decay), 250);
          }
          r.preDelay = ms(1, 250, val(name, q, "predelay"));
        },
        knobs: {
          damp: [k(damp.frequency, (x) => 20000 * Math.pow(1500 / 20000, x), { exp: true })],
        },
      };
    }
    case "Chorus": {
      // Tone's Chorus, from its parts (D206): each side's delay swings between delay ± delay ×
      // depth, so depth and delay are gains and a delay's base value, and can be automated
      const lfoL = new Tone.LFO({ frequency: 1.5, min: 0, max: 1, phase: 0 });
      const lfoR = new Tone.LFO({ frequency: 1.5, min: 0, max: 1, phase: 180 });
      lfoL.frequency.connect(lfoR.frequency);
      const delayL = raw.createDelay(1);
      const delayR = raw.createDelay(1);
      const swingL = new Tone.Gain(0);
      const swingR = new Tone.Gain(0);
      lfoL.connect(swingL);
      lfoR.connect(swingR);
      Tone.connect(swingL, delayL.delayTime);
      Tone.connect(swingR, delayR.delayTime);
      const s = stereo([delayL], [delayR]);
      const out = new Tone.Gain(1);
      s.merge.connect(out);
      lfoL.start();
      lfoR.start();
      const time = (q: Params, x = val(name, q, "delay")) => toUnit.ms(2, 20)(x) / 1000;
      const depth = (q: Params, x = val(name, q, "depth")) => x;
      // Tone's LFO: min = max(0, d − d·depth), max = d + d·depth
      const low = (d: number, dp: number) => Math.max(d - d * dp, 0);
      const span = (d: number, dp: number) => d + d * dp - low(d, dp);
      const delays = [delayL.delayTime, delayR.delayTime] as never as Target["param"][];
      const swings = [swingL.gain, swingR.gain];
      return {
        nodes: [],
        io: { input: s.input, output: out },
        extra: [s.input, out, s.split, s.merge, lfoL, lfoR, swingL, swingR],
        knobs: {
          rate: [k(lfoL.frequency, (x) => rate(0.1, 8, x))],
          depth: [
            ...delays.map((d) => k(d, (x, q) => low(time(q), x))),
            ...swings.map((g) => k(g, (x, q) => span(time(q), x))),
          ],
          delay: [
            ...delays.map((d) => k(d, (x, q) => low(time(q, x), depth(q)))),
            ...swings.map((g) => k(g, (x, q) => span(time(q, x), depth(q)))),
          ],
        },
      };
    }
    case "Phaser": {
      // Tone's Phaser from its parts (D206): ten allpass stages a side swept from the base up
      // `octaves`; the base is a signal and the sweep a gain, so both can be automated. (Tone's
      // filters keep their own 350 Hz under the sweep, and so do these, to sound the same.)
      const lfoL = new Tone.LFO({ frequency: 0.5, min: 0, max: 1 });
      const lfoR = new Tone.LFO({ frequency: 0.5, min: 0, max: 1, phase: 180 });
      lfoL.frequency.connect(lfoR.frequency);
      const base = new Tone.Signal({ value: 350, units: "frequency" });
      const q = new Tone.Signal({ value: 10, units: "positive" });
      const sweepL = new Tone.Gain(0);
      const sweepR = new Tone.Gain(0);
      lfoL.connect(sweepL);
      lfoR.connect(sweepR);
      const stages = (sweep: Tone.Gain) =>
        Array.from({ length: 10 }, () => {
          const f = raw.createBiquadFilter();
          f.type = "allpass";
          q.connect(f.Q);
          base.connect(f.frequency);
          sweep.connect(f.frequency);
          return f;
        });
      const s = stereo(stages(sweepL), stages(sweepR));
      const out = new Tone.Gain(1);
      s.merge.connect(out);
      lfoL.start();
      lfoR.start();
      const baseHz = (p: Params, x = val(name, p, "base")) => hzOf(x);
      const octaves = (p: Params, x = val(name, p, "octaves")) => lin(0.5, 6)(x);
      const sweep = (hz: number, oct: number) => hz * Math.pow(2, oct) - hz;
      const sweeps = [sweepL.gain, sweepR.gain];
      return {
        nodes: [],
        io: { input: s.input, output: out },
        extra: [s.input, out, s.split, s.merge, lfoL, lfoR, base, q, sweepL, sweepR],
        knobs: {
          rate: [k(lfoL.frequency, (x) => rate(0.05, 8, x))],
          octaves: sweeps.map((g) => k(g, (x, p) => sweep(baseHz(p), octaves(p, x)))),
          base: [
            k(base, hzOf, { exp: true }),
            ...sweeps.map((g) => k(g, (x, p) => sweep(baseHz(p, x), octaves(p)))),
          ],
          q: [k(q, (x) => 0.5 + x * 15)],
        },
      };
    }
    case "Tremolo": {
      // Tone's Tremolo from its parts (D206): each side's gain is ½ − depth/2 · sin(ωt + φ),
      // with φ = 90° ∓ spread/2. A sine and a cosine mixed by cos φ and sin φ make each side's
      // LFO, so the spread is four gains and can be automated.
      const sin = new Tone.LFO({ frequency: 5, min: -1, max: 1, phase: 0 });
      const cos = new Tone.LFO({ frequency: 5, min: -1, max: 1, phase: 90 });
      const freq = new Tone.Signal({ value: 5, units: "frequency" });
      freq.fan(sin.frequency, cos.frequency);
      const side = () => {
        const a = new Tone.Gain(0);
        const b = new Tone.Gain(0);
        const depth = new Tone.Gain(0);
        const amp = raw.createGain();
        amp.gain.value = 0.5;
        sin.connect(a);
        cos.connect(b);
        a.connect(depth);
        b.connect(depth);
        Tone.connect(depth, amp.gain);
        return { a, b, depth, amp };
      };
      const L = side();
      const R = side();
      const s = stereo([L.amp], [R.amp]);
      const out = new Tone.Gain(1);
      s.merge.connect(out);
      sin.start();
      cos.start();
      const rad = (x: number, sign: number) => ((90 + (sign * x * 180) / 2) * Math.PI) / 180;
      return {
        nodes: [],
        io: { input: s.input, output: out },
        extra: [
          s.input,
          out,
          s.split,
          s.merge,
          sin,
          cos,
          freq,
          L.a,
          L.b,
          L.depth,
          R.a,
          R.b,
          R.depth,
        ],
        knobs: {
          rate: [k(freq, (x) => rate(0.5, 20, x))],
          depth: [L, R].map((side) => k(side.depth.gain, (x) => -x / 2)),
          spread: [
            k(L.a.gain, (x) => Math.cos(rad(x, -1))),
            k(L.b.gain, (x) => Math.sin(rad(x, -1))),
            k(R.a.gain, (x) => Math.cos(rad(x, 1))),
            k(R.b.gain, (x) => Math.sin(rad(x, 1))),
          ],
        },
      };
    }
    case "Pump": {
      // the gain dips on every beat of its rate and comes back over `release` of the beat
      const g = new Tone.Gain(1);
      const param = (g.input as GainNode).gain;
      let q = p;
      // automated knobs (D186, D206): read at each step, as the knobs are
      const auto: Params = {};
      const at = (id: string) => auto[id] ?? val(name, q, id);
      return {
        nodes: [g],
        set: (next) => (q = next),
        knobs: {},
        stepKnob: (id, value) => {
          if (value === null) delete auto[id];
          else auto[id] = value;
        },
        onStep(time, posQ, stepQ, secPerQ) {
          const rate = PUMP_RATES[Math.round(at("rate") * (PUMP_RATES.length - 1))];
          const every = { "1/2": 2, "1/4": 1, "1/8": 0.5 }[rate] ?? 1;
          const floor = 1 - at("depth");
          const back = lin(0.1, 1)(at("release")) * every * secPerQ;
          // the beats within this step (several when the step is longer than the rate)
          for (
            let b = Math.ceil(posQ / every - 1e-6) * every;
            b < posQ + stepQ - 1e-6;
            b += every
          ) {
            const t = time + (b - posQ) * secPerQ;
            param.cancelScheduledValues(t);
            param.setTargetAtTime(floor, t, 0.002);
            param.setTargetAtTime(1, t + 0.01, back / 3);
          }
        },
      };
    }
    case "AutoPan": {
      const a = new Tone.AutoPanner({ frequency: 1 }).start();
      a.wet.value = 1;
      return {
        nodes: [a],
        knobs: {
          rate: [k(a.frequency, (x) => rate(0.05, 10, x))],
          depth: [k(a.depth, (x) => x)],
        },
      };
    }
    case "Limiter": {
      const l = new Tone.Limiter(-1);
      return { nodes: [l], knobs: { ceiling: [k(l.threshold, toUnit.db(-24, 0))] } };
    }
    default: {
      // unknown effects pass the sound through untouched
      const g = new Tone.Gain(1);
      return { nodes: [g], knobs: {} };
    }
  }
}

/** The pre-gain's top: the Distortion's curve is tanh(DRIVE_MAX · x), reached at full drive. */
const DRIVE_MAX = 21;

/** Set a knob's target now (not automated). */
function put(t: Target, x: number) {
  const param = t.param as unknown as {
    value: number;
    rampTo?: (v: number, s: number) => unknown;
  };
  if (t.glide && param.rampTo) param.rampTo(x, t.glide);
  else param.value = x;
}

/** The knobs a built effect can move at an audio time (for tests: every knob but the ones
 * `NOT_AUTOMATABLE` names). */
export function knobIdsOf(name: string): string[] {
  const inner = build(name, {});
  const ids = [
    ...Object.keys(inner.knobs),
    ...(inner.stepKnob ? ["rate", "depth", "release"] : []),
  ];
  for (const n of [...inner.nodes, ...(inner.extra ?? [])]) n.dispose();
  return ids;
}

/** Effect knobs that should move at an audio time and don't (a test: none, D206). */
export function missingAutomation(): string[] {
  const out: string[] = [];
  for (const [name, defs] of Object.entries(EFFECT_PARAMS)) {
    const ids = new Set(knobIdsOf(name));
    for (const d of defs)
      if (d.id !== "mix" && !NOT_AUTOMATABLE[name]?.[d.id] && !ids.has(d.id))
        out.push(`${name}.${d.id}`);
  }
  return out;
}

/** One effect, with dry/wet mix and on/off around it. */
export function createFx(fx: Effect, bpm: number): FxNode {
  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);
  const dry = new Tone.Gain(0);
  const wet = new Tone.Gain(1);
  // on and off are gains too, so On can be automated (D207): off, the input goes straight out
  const mixed = new Tone.Gain(1);
  const on = new Tone.Gain(1);
  const off = new Tone.Gain(0);
  const inner = build(fx.name, fx.params);
  input.connect(dry);
  dry.connect(mixed);
  if (inner.io) {
    input.connect(inner.io.input);
    inner.io.output.chain(wet, mixed);
  } else input.chain(...inner.nodes, wet, mixed);
  mixed.connect(on);
  on.connect(output);
  input.connect(off);
  off.connect(output);
  const automated = new Set<string>();
  let last = fx;
  let lastBpm = bpm;
  // the params some automated knob moves: setting another knob mustn't touch them
  const busy = () => {
    const out = new Set<unknown>();
    for (const id of automated) for (const t of inner.knobs[id] ?? []) out.add(t.param);
    return out;
  };
  const node: FxNode = {
    input,
    output,
    ready: inner.ready ?? Promise.resolve(),
    update(e, bpm) {
      last = e;
      lastBpm = bpm;
      inner.set?.(e.params, bpm);
      const skip = busy();
      for (const [id, targets] of Object.entries(inner.knobs)) {
        const x = val(e.name, e.params, id);
        for (const t of targets) if (!skip.has(t.param)) put(t, t.unit(x, e.params, bpm));
      }
      if (!automated.has("mix")) {
        const mix = e.params.mix ?? 1;
        wet.gain.rampTo(mix, 0.02);
        dry.gain.rampTo(1 - mix, 0.02);
      }
      if (!automated.has("on")) {
        on.gain.rampTo(e.bypass ? 0 : 1, 0.02);
        off.gain.rampTo(e.bypass ? 1 : 0, 0.02);
      }
    },
    onStep: inner.onStep,
    tempo: inner.tempo,
    automate(param, events) {
      if (!events.length) return;
      automated.add(param);
      if (param === "mix") {
        // every effect's mix is its wet and dry gains
        schedule(wet.gain, events, (x) => x);
        schedule(dry.gain, events, (x) => 1 - x);
      } else if (param === "on") {
        schedule(on.gain, events, (x) => (x >= 0.5 ? 1 : 0), false, true);
        schedule(off.gain, events, (x) => (x >= 0.5 ? 0 : 1), false, true);
      } else if (inner.stepKnob) inner.stepKnob(param, events[events.length - 1].v);
      else
        for (const t of inner.knobs[param] ?? [])
          schedule(t.param, events, (x) => t.unit(x, last.params, lastBpm), t.exp, t.stepped);
    },
    release() {
      if (inner.stepKnob) for (const id of automated) inner.stepKnob(id, null);
      automated.clear();
      node.update(last, lastBpm);
    },
    dispose() {
      for (const n of [input, output, dry, wet, mixed, on, off, ...inner.nodes]) n.dispose();
      for (const n of inner.extra ?? []) n.dispose();
    },
  };
  node.update(fx, bpm);
  return node;
}

/** The structure that needs a rebuild when it changes (types and order, not parameters). */
function shape(fx: Effect) {
  return `${fx.id ?? ""}:${fx.name}${fx.name === "Delay" ? (fx.params.spread ?? 0) >= 0.5 : ""}`;
}

/** A chain of effects between two nodes, reconciled against data. */
/** Effects whose output goes on after their input stops. */
const HOLDS_SOUND = new Set(["Reverb", "Delay", "Chorus", "Phaser"]);

export class FxChain {
  private nodes: FxNode[] = [];
  private key = "";
  private last: Effect[] = [];
  private lastBpm = 0;

  constructor(
    private from: Tone.ToneAudioNode,
    private to: Tone.InputNode,
  ) {
    from.connect(to);
  }

  sync(effects: Effect[], bpm: number) {
    const key = effects.map(shape).join("|");
    if (key !== this.key) {
      this.key = key;
      this.from.disconnect();
      for (const n of this.nodes) n.dispose();
      this.nodes = effects.map((fx) => createFx(fx, bpm));
      let prev: Tone.ToneAudioNode = this.from;
      for (const n of this.nodes) {
        prev.connect(n.input);
        prev = n.output;
      }
      prev.connect(this.to);
    } else {
      // immer keeps unchanged effects identical: only touch the ones that changed
      effects.forEach((fx, i) => {
        if (fx !== this.last[i] || bpm !== this.lastBpm) this.nodes[i].update(fx, bpm);
      });
    }
    this.last = effects;
    this.lastBpm = bpm;
  }

  /**
   * Drop the sound the effects still hold (D99): the ones with memory (reverb, delay, chorus,
   * phaser) are built again, the rest keep their nodes. A new reverb makes a new impulse.
   */
  flush(all = false) {
    if (!all && !this.last.some((fx) => !fx.bypass && HOLDS_SOUND.has(fx.name))) return;
    this.key = "";
    this.sync(this.last, this.lastBpm);
  }

  /** A page step for the effects that follow the beat (Pump, D104). */
  step(time: number, posQ: number, stepQ: number, secPerQ: number) {
    for (const n of this.nodes) n.onStep?.(time, posQ, stepQ, secPerQ);
  }

  /** Automation of an effect's knob in this chain (D186). */
  automate(fxId: string, param: string, events: AutoEvent[]) {
    const i = this.last.findIndex((fx) => fx.id === fxId);
    if (i >= 0) this.nodes[i]?.automate(param, events);
  }

  /** Back to the knobs (automation ended): every effect set from its data again. */
  refresh() {
    for (const n of this.nodes) n.release();
  }

  /** A tempo change at an audio time, for the effects synced to it (D192). */
  tempo(bpm: number, time: number) {
    this.lastBpm = bpm;
    for (const n of this.nodes) n.tempo?.(bpm, time);
  }

  /** Resolves when every effect can process audio (reverb impulse responses are built). */
  ready() {
    return Promise.all(this.nodes.map((n) => n.ready));
  }

  dispose() {
    for (const n of this.nodes) n.dispose();
    this.nodes = [];
  }
}
