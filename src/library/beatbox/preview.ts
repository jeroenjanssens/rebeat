/**
 * Hearing a conversion before making tracks (D113–D115): the result's steps loop on the preview
 * output (not the master), alone or with the original take under it.
 */
import * as Tone from "tone";
import { audioNow } from "../../engine/engine";
import { STEP_SIZE_QUARTERS, type StepSize } from "../../model/types";
import { useSettings } from "../../state/settings";
import type { BeatboxClass } from "./classes";
import type { ConvertResult } from "./convert";

let timer: number | null = null;
let out: GainNode | null = null;
const sources = new Set<AudioBufferSourceNode>();

export interface PreviewSpec {
  result: ConvertResult;
  buffers: Partial<Record<BeatboxClass, AudioBuffer>>;
  bpm: number;
  stepSize: StepSize;
  /** The take, from its first beat, under the result. */
  original?: { buffer: AudioBuffer; firstBeat: number };
  playResult: boolean;
}

function output() {
  const ctx = Tone.getContext().rawContext as AudioContext;
  if (!out) {
    out = ctx.createGain();
    out.connect(ctx.destination);
  }
  out.gain.value = useSettings.getState().previewVolume;
  return { ctx, out };
}

function play(buffer: AudioBuffer, when: number, gain: number, offset = 0, duration?: number) {
  const { ctx, out } = output();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(out);
  src.start(when, offset, duration);
  sources.add(src);
  src.onended = () => {
    g.disconnect();
    sources.delete(src);
  };
}

export const previewing = () => timer !== null;

/** Start (or restart) the preview; returns the audio time the loop starts at. */
export function startPreview(spec: PreviewSpec): { when: number; period: number } {
  stopPreview();
  const stepDur = (60 / spec.bpm) * STEP_SIZE_QUARTERS[spec.stepSize];
  const pageDur = spec.result.length * stepDur;
  const pages = spec.result.pages.length;
  // folded: the original plays every repetition while the one pattern loops under it
  const reps = spec.result.pages.length === 1 ? spec.result.repeats : pages;
  const period = spec.original ? reps * pageDur : pages * pageDur;
  const start = audioNow() + 0.08;
  let next = 0; // the next step to schedule, counted from the start
  let nextLoop = 0;
  const total = Math.round(period / stepDur);
  const tick = () => {
    const horizon = audioNow() + 0.2;
    const original = spec.original;
    if (original)
      while (start + nextLoop * period < horizon) {
        play(original.buffer, start + nextLoop * period, 1, original.firstBeat, period);
        nextLoop++;
      }
    while (spec.playResult && start + next * stepDur < horizon) {
      const at = start + next * stepDur;
      const inPeriod = next % total;
      const page = spec.result.pages[Math.floor(inPeriod / spec.result.length) % pages];
      const i = inPeriod % spec.result.length;
      for (const [c, lane] of Object.entries(page) as [BeatboxClass, typeof page.kick][]) {
        const s = lane?.[i];
        const b = spec.buffers[c];
        if (s && b) play(b, at + s.nudge * stepDur, s.velocity ** 1.5);
      }
      next++;
    }
  };
  tick();
  timer = window.setInterval(tick, 50);
  return { when: start, period };
}

export function stopPreview() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  const t = audioNow();
  for (const s of sources) {
    try {
      s.stop(t + 0.01);
    } catch {
      // not started yet or already ended
    }
  }
  sources.clear();
}
