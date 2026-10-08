/**
 * The synth as an AudioWorkletProcessor (D83): one per synth track, in live and offline
 * contexts. The main thread sends the patch, the tempo, notes and controls as messages.
 */
import { upgradePatch } from "../../model/synth";
import { SynthCore, type Controls } from "./core";

export type SynthMessage =
  | { type: "patch"; patch: unknown }
  | { type: "tempo"; bpm: number }
  | { type: "on"; id: number; note: number; velocity: number; at: number; from?: number }
  | { type: "off"; id: number; at: number }
  | { type: "releaseAll"; at: number }
  | { type: "control"; name: keyof Controls; value: number }
  | { type: "monitor"; on: boolean }
  | { type: "macros"; id: number; values: number[] | null; at: number };

/** What the worklet sends back: the newest voice's modulation, about 30 times a second. */
export type SynthReport = { type: "mod"; values: number[] | null };

class SynthProcessor extends AudioWorkletProcessor {
  private core = new SynthCore(sampleRate, upgradePatch(null));
  private monitor = false;
  private blocks = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<SynthMessage>) => this.message(e.data);
  }

  private message(m: SynthMessage) {
    const frame = (at: number) => Math.round(at * sampleRate);
    switch (m.type) {
      case "patch":
        return this.core.setPatch(upgradePatch(m.patch));
      case "tempo":
        return this.core.setTempo(m.bpm);
      case "on":
        return m.from !== undefined
          ? this.core.slideTo(m.from, m.id, m.note, m.velocity, frame(m.at))
          : this.core.noteOn(m.id, m.note, m.velocity, frame(m.at));
      case "off":
        return this.core.noteOff(m.id, frame(m.at));
      case "releaseAll":
        return this.core.releaseAll(frame(m.at));
      case "control":
        this.core.controls[m.name] = m.value;
        return;
      case "macros":
        return this.core.lockMacros(m.id, m.values, frame(m.at));
      case "monitor":
        this.monitor = m.on;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const [left, right] = outputs[0];
    this.core.process(left, right ?? left, currentFrame, left.length);
    if (this.monitor && ++this.blocks % 12 === 0) {
      const mod = this.core.modulation();
      this.port.postMessage({ type: "mod", values: mod ? [...mod] : null } satisfies SynthReport);
    }
    return true;
  }
}

registerProcessor("rebeat-synth", SynthProcessor);
