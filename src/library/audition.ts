/** Previewing samples from the library, optionally in time with the song. */
import * as Tone from "tone";
import { audioNow } from "../engine/engine";
import { getBuffer } from "../engine/samples";
import { nextBeatTime } from "../engine/transport";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { createInstrument, patchOf, type InstrumentVoice } from "../engine/instruments";
import { makeTrack } from "../model/project";
import type { CatalogInstrument } from "./instruments";
import { loadSample } from "./library";

let current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let starts = 0;
/** How many previews have started (for tests). */
export const previewCount = () => starts;
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
  starts++;
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

// ---------- instruments (D78) ----------

let preview: { id: string; voice: InstrumentVoice; gain: Tone.Gain } | null = null;

/** A voice for previewing an instrument (kept while you try the same one). */
function previewVoice(c: CatalogInstrument): InstrumentVoice {
  if (preview?.id === c.id) return preview.voice;
  stopPreview();
  const ctx = Tone.getContext().rawContext as AudioContext;
  if (!out) {
    out = ctx.createGain();
    out.connect(ctx.destination);
  }
  out.gain.value = useSettings.getState().previewVolume;
  const gain = new Tone.Gain(1);
  gain.connect(out);
  // samplers play library samples: make sure they're decoded
  for (const z of c.source.zones ?? []) void loadSample(z.sampleId);
  if (c.source.source === "sampler" && c.source.sampleId) void loadSample(c.source.sampleId);
  const track = makeTrack("instrument", c.low ? "bass" : "keys", c.name, c.name);
  track.instrument = c.source;
  Object.assign(track.params, c.params ?? {});
  const voice = createInstrument(track, gain);
  voice.update(track, useStore.getState().project.bpm);
  preview = { id: c.id, voice, gain };
  return voice;
}

export function stopPreview() {
  if (!preview) return;
  const p = preview;
  p.voice.releaseAll(audioNow());
  setTimeout(() => {
    p.voice.dispose();
    p.gain.dispose();
  }, 3000);
  preview = null;
}

/** Wait (up to 30 s) for a streamed instrument's samples. */
async function ready(v: InstrumentVoice) {
  const end = performance.now() + 30_000;
  while (v.state() === "loading" && performance.now() < end)
    await new Promise((r) => setTimeout(r, 150));
  return v.state() === "ready";
}

/** Play a short phrase in the instrument's range: an arpeggio and a chord (or a line for mono). */
export async function previewInstrument(c: CatalogInstrument) {
  stopAudition();
  starts++;
  const v = previewVoice(c);
  if (!(await ready(v)) || preview?.voice !== v) return;
  const root = c.low ? 36 : 60;
  const step = 0.125;
  const t = audioNow() + 0.05;
  const n = (pitch: number, length = 1.6) => ({ pitch, length, velocity: 0.8 });
  const mono = c.source.source === "synth" && patchOf(c.source).voice.mode !== "poly";
  [root, root + 4, root + 7].forEach((p, i) => v.play([n(p)], t + i * 0.2, step));
  if (mono) v.play([n(root + 12, 4)], t + 0.6, step);
  else v.play([n(root, 6), n(root + 4, 6), n(root + 7, 6), n(root + 12, 6)], t + 0.65, step);
}

/** One note of an instrument (playing it from the computer keyboard). */
export function previewNote(c: CatalogInstrument, pitch: number) {
  const v = previewVoice(c);
  if (v.state() !== "ready") return;
  v.play([{ pitch, length: 3, velocity: 0.8 }], audioNow() + 0.01, 0.125);
}
