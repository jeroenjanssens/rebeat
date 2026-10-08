/** Previewing samples from the library, optionally in time with the song. */
import * as Tone from "tone";
import { audioNow } from "../engine/engine";
import { getBuffer } from "../engine/samples";
import { nextBeatTime } from "../engine/transport";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { loadSample } from "./library";

let current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let out: GainNode | null = null;

export function stopAudition() {
  if (!current) return;
  const { src, gain } = current;
  gain.gain.setTargetAtTime(0, audioNow(), 0.01);
  src.stop(audioNow() + 0.05);
  current = null;
}

/** Play a sample once. `sync`: loops with a known tempo start on the next beat, at the song tempo. */
export async function audition(id: string, opts: { sync?: boolean; bpm?: number } = {}) {
  stopAudition();
  const buffer = getBuffer(id) ?? (await loadSample(id));
  if (buffer) auditionBuffer(buffer, opts);
}

/** Play a buffer that isn't (necessarily) in the library, e.g. an online kit preview. */
export function auditionBuffer(buffer: AudioBuffer, opts: { sync?: boolean; bpm?: number } = {}) {
  stopAudition();
  const ctx = Tone.getContext().rawContext as AudioContext;
  if (!out) {
    out = ctx.createGain();
    out.connect(ctx.destination);
  }
  out.gain.value = useSettings.getState().previewVolume;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  src.connect(gain).connect(out);
  let when = audioNow() + 0.01;
  const { project, playing } = useStore.getState();
  if (opts.sync && opts.bpm) {
    src.playbackRate.value = project.bpm / opts.bpm;
    if (playing) when = nextBeatTime() ?? when;
  }
  src.start(when);
  src.onended = () => {
    gain.disconnect();
    if (current?.src === src) current = null;
  };
  current = { src, gain };
}

export function setPreviewVolume(v: number) {
  useSettings.getState().set({ previewVolume: v });
  if (out) out.gain.value = v;
}
