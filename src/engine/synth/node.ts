/**
 * The main-thread side of the synth (D83): loads the worklet into a context (live or offline),
 * and turns notes, held notes and patches into messages for it.
 */
import type * as Tone from "tone";
import type { SynthPatch } from "../../model/synth";
import type { Note } from "../../model/types";
import type { Controls } from "./core";
import type { SynthMessage, SynthReport } from "./worklet";
import workletUrl from "./worklet.ts?worker&url";

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/** Load the synth worklet into a context, once. */
export function loadSynthWorklet(ctx: BaseAudioContext): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(workletUrl);
    loaded.set(ctx, p);
  }
  return p;
}

export interface WorkletSynth {
  play(notes: Note[], time: number, stepDur: number): void;
  hold(pitch: number, velocity: number, time: number): (end: number) => void;
  releaseAll(time: number): void;
  setPatch(patch: SynthPatch, bpm: number): void;
  control(name: keyof Controls, value: number): void;
  /** A step's macro lock: the macros at `values` from `time` until `end`. */
  lockMacros(values: number[], time: number, end: number): void;
  /** Ask for (or stop) modulation reports, and read the latest. */
  monitor(on: boolean): void;
  modulation(): number[] | null;
  /** The controls last sent (mod wheel, aftertouch, pitch bend). */
  controls: Controls;
  ready(): boolean;
  /**
   * Before an offline render: makes the worklet node, handing it every message so far (notes
   * sent as port messages could arrive after the rendering went past them).
   */
  settled(): Promise<void>;
  dispose(): void;
}

/** A synth in `dest`'s context, playing into it. Messages wait until the worklet is loaded. */
export function workletSynth(dest: Tone.Gain | { input: AudioNode }): WorkletSynth {
  const out = dest.input as unknown as AudioNode;
  const ctx = out.context;
  let node: AudioWorkletNode | null = null;
  let disposed = false;
  let pending: SynthMessage[] = [];
  let next = 1;
  let mod: number[] | null = null;
  let last: { id: number; end: number } | null = null;
  const controls: Controls = { modwheel: 0, aftertouch: 0, pitchbend: 0 };
  const send = (m: SynthMessage) => (node ? node.port.postMessage(m) : pending.push(m));
  // offline (exports, previews): the node is made just before rendering, with every message so
  // far as its options, since port messages can arrive after rendering went past them
  const offline = "startRendering" in ctx;
  let loaded = false;
  const create = () => {
    if (node || disposed || !loaded) return;
    node = new AudioWorkletNode(ctx, "rebeat-synth", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      // offline: a seed too, so renders come out the same every time (live synths stay random)
      processorOptions: offline ? { messages: pending, seed: 1 } : { messages: pending },
    });
    pending = [];
    node.connect(out);
    node.port.onmessage = (e: MessageEvent<SynthReport>) => {
      if (e.data.type === "mod") mod = e.data.values;
    };
  };
  void loadSynthWorklet(ctx).then(() => {
    loaded = true;
    if (!offline) create();
  });
  return {
    play(notes, time, stepDur) {
      for (const n of notes) {
        const id = next++;
        // a slide carries on from the note before (a monophonic line: the latest one)
        const from = n.slide && last && last.end > time - stepDur ? last.id : undefined;
        send({ type: "on", id, note: n.pitch, velocity: n.velocity, at: time, from });
        const end = time + n.length * stepDur * 0.95;
        send({ type: "off", id, at: end });
        last = { id, end };
      }
    },
    hold(pitch, velocity, time) {
      const id = next++;
      send({ type: "on", id, note: pitch, velocity, at: time });
      return (end) => send({ type: "off", id, at: end });
    },
    releaseAll: (at) => send({ type: "releaseAll", at }),
    setPatch(patch, bpm) {
      send({ type: "patch", patch });
      send({ type: "tempo", bpm });
    },
    control(name, value) {
      controls[name] = value;
      send({ type: "control", name, value });
    },
    lockMacros(values, time, end) {
      const id = next++;
      send({ type: "macros", id, values, at: time });
      send({ type: "macros", id, values: null, at: end });
    },
    monitor(on) {
      if (!on) mod = null;
      send({ type: "monitor", on });
    },
    modulation: () => mod,
    async settled() {
      await loadSynthWorklet(ctx);
      create();
    },
    controls,
    ready: () => (offline ? loaded : !!node),
    dispose() {
      disposed = true;
      if (!node) return;
      const n = node;
      n.port.postMessage({ type: "releaseAll", at: 0 } satisfies SynthMessage);
      setTimeout(() => n.disconnect(), 300);
    },
  };
}

/** Render a patch playing `notes` offline (tests and previews): [note, start s, end s][]. */
export async function renderPatch(
  patch: SynthPatch,
  notes: [number, number, number, number?][],
  seconds: number,
  sampleRate = 44100,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.round(seconds * sampleRate), sampleRate);
  await loadSynthWorklet(ctx);
  const g = ctx.createGain();
  g.connect(ctx.destination);
  const s = workletSynth({ input: g });
  s.setPatch(patch, 120);
  for (const [note, start, end, velocity = 0.8] of notes) s.hold(note, velocity, start)(end);
  await s.settled();
  return ctx.startRendering();
}
