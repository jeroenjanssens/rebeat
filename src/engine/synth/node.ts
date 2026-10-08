/**
 * The main-thread side of the synth (D83): loads the worklet into a context (live or offline),
 * and turns notes, held notes and patches into messages for it.
 */
import type * as Tone from "tone";
import type { SynthPatch } from "../../model/synth";
import type { Note } from "../../model/types";
import type { Controls } from "./core";
import type { SynthMessage } from "./worklet";
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
  ready(): boolean;
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
  const send = (m: SynthMessage) => (node ? node.port.postMessage(m) : pending.push(m));
  void loadSynthWorklet(ctx).then(() => {
    if (disposed) return;
    node = new AudioWorkletNode(ctx, "rebeat-synth", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.connect(out);
    for (const m of pending) node.port.postMessage(m);
    pending = [];
  });
  return {
    play(notes, time, stepDur) {
      for (const n of notes) {
        const id = next++;
        send({ type: "on", id, note: n.pitch, velocity: n.velocity, at: time });
        send({ type: "off", id, at: time + n.length * stepDur * 0.95 });
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
    control: (name, value) => send({ type: "control", name, value }),
    ready: () => !!node,
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
  // wait for the node, then schedule
  while (!s.ready()) await new Promise((r) => setTimeout(r, 1));
  for (const [note, start, end, velocity = 0.8] of notes) s.hold(note, velocity, start)(end);
  return ctx.startRendering();
}
