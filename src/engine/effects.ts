/**
 * Effects are data ({ id, name, params, bypass }). This factory maps them to Tone.js nodes, so
 * the same definitions drive track inserts, buses, the master chain and offline rendering.
 */
import * as Tone from "tone";
import { DELAY_TIMES, PUMP_RATES, lin, toUnit } from "../model/params";
import { Drive, FlatEQ } from "./tone";
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
) {
  automatedParams.add(param);
  for (const e of events) {
    const x = unit(e.v);
    if (!e.ramp) param.setValueAtTime(x, e.t);
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
  /** Automation of one of its knobs (D186, `AUTOMATABLE_FX`). */
  automate?(param: string, events: AutoEvent[]): void;
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

type Inner = {
  nodes: Tone.ToneAudioNode[];
  set: (p: Record<string, number>, bpm: number) => void;
  ready?: Promise<void>;
  onStep?: FxNode["onStep"];
  tempo?: FxNode["tempo"];
  automate?: FxNode["automate"];
  /** Nodes outside the chain (sources, LFOs), disposed with it. */
  extra?: { dispose(): unknown }[];
};

const v = (p: Record<string, number>, k: string, d = 0.5) => p[k] ?? d;
const ms = (lo: number, hi: number, x: number) => toUnit.ms(lo, hi)(x) / 1000;
const rate = (lo: number, hi: number, x: number) => lo * Math.pow(hi / lo, x);

function build(name: string, p: Record<string, number>): Inner {
  switch (name) {
    case "EQ3": {
      const eq = new FlatEQ();
      return {
        nodes: [eq],
        set: (p) => {
          const db = toUnit.db(-15, 15);
          eq.setGains(db(v(p, "low")), db(v(p, "mid")), db(v(p, "high")));
          const lowHz = Math.min(2000, toUnit.hz(v(p, "lowFreq", 0.33)));
          eq.setFrequencies(lowHz, Math.max(lowHz * 1.5, toUnit.hz(v(p, "highFreq", 0.75))));
        },
        automate: (param, events) => {
          const band = { low: eq.low, mid: eq.mid, high: eq.high }[param];
          if (band) schedule(band.gain, events, toUnit.db(-15, 15));
        },
      };
    }
    case "Filter": {
      // the cutoff is a signal of its own (so automation can move it at an audio time, D189),
      // with the sweep's LFO added on top: from the cutoff up `depth × 4` octaves, as AutoFilter
      const filter = new Tone.Filter({ type: "lowpass", rolloff: -12, Q: 1, frequency: 0 });
      const base = new Tone.Signal({ value: 1000, units: "frequency" });
      const lfo = new Tone.LFO({ frequency: 1, min: 0, max: 0 }).start();
      base.connect(filter.frequency);
      lfo.connect(filter.frequency);
      return {
        nodes: [filter],
        extra: [base, lfo],
        set: (p) => {
          filter.type = (["lowpass", "highpass", "bandpass"] as const)[
            Math.round(v(p, "type", 0) * 2)
          ];
          filter.Q.value = toUnit.q(v(p, "reso", 0.3));
          const hz = toUnit.hz(v(p, "cutoff", 0.6));
          base.value = hz;
          lfo.max = hz * (Math.pow(2, v(p, "depth", 0) * 4) - 1);
          lfo.frequency.value = rate(0.05, 20, v(p, "rate", 0.3));
        },
        automate: (param, events) => {
          if (param === "cutoff") schedule(base, events, toUnit.hz, true);
          else if (param === "reso") schedule(filter.Q, events, toUnit.q);
        },
      };
    }
    case "Compressor": {
      const c = new Tone.Compressor();
      const makeup = new Tone.Gain(1);
      return {
        nodes: [c, makeup],
        set: (p) => {
          c.threshold.value = toUnit.db(-60, 0)(v(p, "threshold", 0.6));
          c.ratio.value = lin(1, 20)(v(p, "ratio", 0.15));
          c.attack.value = ms(0.1, 200, v(p, "attack", 0.4));
          c.release.value = ms(10, 2000, v(p, "release", 0.4));
          makeup.gain.value = Tone.dbToGain(toUnit.db(0, 24)(v(p, "makeup", 0.1)));
        },
      };
    }
    case "Distortion": {
      const d = new Drive();
      const tone = new Tone.Filter(8000, "lowpass");
      const out = new Tone.Gain(1);
      return {
        nodes: [d, tone, out],
        set: (p) => {
          d.setAmount(v(p, "drive", 0.4));
          tone.frequency.value = toUnit.hz(v(p, "tone", 0.8));
          out.gain.value = Tone.dbToGain(toUnit.db(-12, 12)(v(p, "output")));
        },
      };
    }
    case "Bitcrusher": {
      const b = new Tone.BitCrusher(8);
      b.wet.value = 1;
      const tone = new Tone.Filter(20000, "lowpass");
      return {
        nodes: [b, tone],
        set: (p) => {
          b.bits.value = Math.round(lin(2, 16)(v(p, "bits", 0.43)));
          tone.frequency.value = toUnit.hz(v(p, "tone", 1));
        },
      };
    }
    case "Delay": {
      const pingPong = v(p, "spread", 0) >= 0.5;
      const d = pingPong ? new Tone.PingPongDelay(0.25, 0.35) : new Tone.FeedbackDelay(0.25, 0.35);
      d.wet.value = 1;
      const tone = new Tone.Filter(6000, "lowpass");
      let quarters = 0.5;
      return {
        nodes: [d, tone],
        set: (p, bpm) => {
          const note = DELAY_TIMES[Math.round(v(p, "time", 4 / 7) * (DELAY_TIMES.length - 1))];
          quarters = DELAY_QUARTERS[note];
          d.delayTime.rampTo(quarters * (60 / bpm), 0.05);
          d.feedback.value = Math.min(0.95, v(p, "feedback", 0.35));
          tone.frequency.value = toUnit.hz(v(p, "tone", 0.7));
        },
        // the echo follows the tempo, ramping over the step (a jump would click)
        tempo: (bpm, time) => d.delayTime.linearRampToValueAtTime(quarters * (60 / bpm), time),
        automate: (param, events) => {
          if (param === "feedback") schedule(d.feedback, events, (x) => Math.min(0.95, x));
        },
      };
    }
    case "Reverb": {
      const decayOf = (q: Record<string, number>) =>
        Math.max(0.1, ms(100, 10000, v(q, "decay", 0.4)) * (0.5 + v(q, "size", 0.5)));
      let lastDecay = decayOf(p);
      const r = new Tone.Reverb({ decay: lastDecay, preDelay: 0.01 });
      r.wet.value = 1;
      const damp = new Tone.Filter(12000, "lowpass");
      let timer = 0;
      return {
        nodes: [r, damp],
        ready: r.ready,
        set: (p) => {
          const decay = decayOf(p);
          // regenerating the impulse response is costly: only for real changes, debounced
          if (Math.abs(decay - lastDecay) / decay > 0.03) {
            lastDecay = decay;
            clearTimeout(timer);
            timer = window.setTimeout(() => (r.decay = decay), 250);
          }
          r.preDelay = ms(1, 250, v(p, "predelay", 0.1));
          damp.frequency.value = 20000 * Math.pow(1500 / 20000, v(p, "damp", 0.5));
        },
      };
    }
    case "Chorus": {
      const c = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7 }).start();
      c.wet.value = 1;
      return {
        nodes: [c],
        set: (p) => {
          c.frequency.value = rate(0.1, 8, v(p, "rate", 0.35));
          c.depth = v(p, "depth", 0.6);
          c.delayTime = toUnit.ms(2, 20)(v(p, "delay", 0.4));
        },
      };
    }
    case "Phaser": {
      const ph = new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 350 });
      ph.wet.value = 1;
      return {
        nodes: [ph],
        set: (p) => {
          ph.frequency.value = rate(0.05, 8, v(p, "rate", 0.3));
          ph.octaves = lin(0.5, 6)(v(p, "octaves", 0.5));
          ph.baseFrequency = toUnit.hz(v(p, "base", 0.4));
          ph.Q.value = 0.5 + v(p, "q", 0.3) * 15;
        },
      };
    }
    case "Tremolo": {
      const t = new Tone.Tremolo({ frequency: 5, depth: 0.6 }).start();
      t.wet.value = 1;
      return {
        nodes: [t],
        set: (p) => {
          t.frequency.value = rate(0.5, 20, v(p, "rate"));
          t.depth.value = v(p, "depth", 0.6);
          t.spread = v(p, "spread", 0) * 180;
        },
      };
    }
    case "Pump": {
      // the gain dips on every beat of its rate and comes back over `release` of the beat
      const g = new Tone.Gain(1);
      const param = (g.input as GainNode).gain;
      let q = p;
      // automated depth (D186): read at each step, as the knob is
      let depth: number | null = null;
      return {
        nodes: [g],
        set: (next) => (q = next),
        automate: (param, events) => {
          // no events: back to the knob
          if (param === "depth") depth = events.length ? events[events.length - 1].v : null;
        },
        onStep(time, posQ, stepQ, secPerQ) {
          const rate = PUMP_RATES[Math.round(v(q, "rate") * (PUMP_RATES.length - 1))];
          const every = { "1/2": 2, "1/4": 1, "1/8": 0.5 }[rate] ?? 1;
          const floor = 1 - (depth ?? v(q, "depth", 0.6));
          const back = lin(0.1, 1)(v(q, "release")) * every * secPerQ;
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
        set: (p) => {
          a.frequency.value = rate(0.05, 10, v(p, "rate", 0.4));
          a.depth.value = v(p, "depth", 0.8);
        },
      };
    }
    case "Limiter": {
      const l = new Tone.Limiter(-1);
      return {
        nodes: [l],
        set: (p) => (l.threshold.value = toUnit.db(-24, 0)(v(p, "ceiling", 0.95))),
      };
    }
    default: {
      // unknown effects pass the sound through untouched
      const g = new Tone.Gain(1);
      return { nodes: [g], set: () => {} };
    }
  }
}

/** One effect, with dry/wet mix and bypass around it. */
export function createFx(fx: Effect, bpm: number): FxNode {
  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);
  const dry = new Tone.Gain(0);
  const wet = new Tone.Gain(1);
  const inner = build(fx.name, fx.params);
  input.connect(dry);
  dry.connect(output);
  input.chain(...inner.nodes, wet, output);
  const node: FxNode = {
    input,
    output,
    ready: inner.ready ?? Promise.resolve(),
    update(e, bpm) {
      inner.set(e.params, bpm);
      const mix = e.bypass ? 0 : (e.params.mix ?? 1);
      wet.gain.rampTo(mix, 0.02);
      dry.gain.rampTo(1 - mix, 0.02);
    },
    onStep: inner.onStep,
    tempo: inner.tempo,
    automate(param, events) {
      // every effect's mix is its wet and dry gains
      if (param === "mix") {
        schedule(wet.gain, events, (x) => x);
        schedule(dry.gain, events, (x) => 1 - x);
      } else inner.automate?.(param, events);
    },
    dispose() {
      for (const n of [input, output, dry, wet, ...inner.nodes, ...(inner.extra ?? [])])
        n.dispose();
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
    if (i >= 0) this.nodes[i]?.automate?.(param, events);
  }

  /** Back to the knobs (automation ended): every effect set from its data again. */
  refresh() {
    this.nodes.forEach((n, i) => {
      n.automate?.("depth", []);
      n.update(this.last[i], this.lastBpm);
    });
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
