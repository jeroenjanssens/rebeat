/**
 * Sound sources of instrument tracks: synth patches (engine/synth.ts), a keyboard sampler (any library
 * sample across the keyboard) and sampled instruments from smplr (loaded on demand).
 */
import * as Tone from "tone";
import type { Smplr } from "smplr";
import { FACTORY_SYNTHS, factorySynth } from "../library/synths";
import { sanitizePatch, withKnobs, type SynthPatch } from "../model/synth";
import { patchSynth } from "./synth";
import { markBusy, markDownloaded } from "../library/downloads";
import { CATALOG } from "../library/instruments";
import { toUnit } from "../model/params";
import { noteName } from "../model/notes";
import type { InstrumentSource, Note, Track } from "../model/types";
import { getBuffer } from "./samples";

/** The factory synths, for pickers (D80). */
export const SYNTH_PRESETS = FACTORY_SYNTHS;

/** The patch a synth source plays: its own, or its factory synth's. */
export function patchOf(src: InstrumentSource): SynthPatch {
  return src.patch ?? factorySynth(src.preset)?.patch ?? FACTORY_SYNTHS[0].patch;
}

/** Sampled instruments from the catalog (D78), for pickers. */
export const SAMPLED_INSTRUMENTS = CATALOG.filter((c) => c.source.source === "smplr").map((c) => ({
  id: c.source.preset,
  name: c.name,
  family: c.family,
  group: c.group,
}));

export function defaultInstrument(track: Track): InstrumentSource {
  return { source: "synth", preset: track.category === "bass" ? "acid" : "warm-pad" };
}

export function instrumentName(src: InstrumentSource): string {
  if (src.name) return src.name;
  if (src.source === "synth") return factorySynth(src.preset)?.name ?? "Synth";
  if (src.source === "smplr")
    return SAMPLED_INSTRUMENTS.find((p) => p.id === src.preset)?.name ?? "Instrument";
  return "Sampler";
}

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface InstrumentVoice {
  /** Changes to this key need a new voice (another preset/source/sample). */
  key: string;
  play(notes: Note[], time: number, stepDur: number): void;
  releaseAll(time: number): void;
  update(track: Track, bpm?: number): void;
  dispose(): void;
  /** For sampled instruments: whether the samples are loaded. */
  state: () => "ready" | "loading" | "error";
}

function envelope(track: Track) {
  const p = track.params;
  return {
    attack: toUnit.ms(1, 4000)(p["sound.attack"] ?? 0.05) / 1000,
    decay: toUnit.ms(1, 4000)(p["sound.decay"] ?? 0.4) / 1000,
    sustain: p["sound.sustain"] ?? 0.7,
    release: toUnit.ms(1, 8000)(p["sound.release"] ?? 0.35) / 1000,
  };
}

/** A synth playing its patch, with the track's moved SOUND knobs on top (D79). */
function synthVoice(track: Track, src: InstrumentSource, dest: Tone.Gain): InstrumentVoice {
  const effective = (t: Track) => sanitizePatch(withKnobs(patchOf(t.instrument ?? src), t.params));
  const synth = patchSynth(dest, effective(track));
  return {
    // one voice for every patch: switching sounds doesn't rebuild the graph
    key: "synth",
    state: () => "ready",
    play: (notes, time, step) => synth.play(notes, time, step),
    releaseAll: (time) => synth.releaseAll(time),
    update: (t, bpm = 120) => synth.setPatch(effective(t), bpm),
    dispose: () => synth.dispose(),
  };
}

function samplerVoice(src: InstrumentSource, dest: Tone.InputNode): InstrumentVoice {
  let sampler: Tone.Sampler | null = null;
  const make = () => {
    const buf = getBuffer(src.sampleId);
    if (!buf || sampler) return;
    sampler = new Tone.Sampler({
      urls: { [noteName(src.rootNote ?? 60).replace("♭", "b")]: buf },
    }).connect(dest);
  };
  make();
  return {
    key: `sampler:${src.sampleId}:${src.rootNote ?? 60}`,
    state: () => (sampler ? "ready" : "loading"),
    play(notes, time, step) {
      make();
      if (!sampler) return;
      for (const n of notes)
        sampler.triggerAttackRelease(midiToHz(n.pitch), n.length * step * 0.95, time, n.velocity);
    },
    releaseAll(time) {
      sampler?.releaseAll(time);
    },
    update(track) {
      make();
      if (!sampler) return;
      const e = envelope(track);
      sampler.attack = e.attack;
      sampler.release = e.release;
    },
    dispose: () => sampler?.dispose(),
  };
}

type SmplrModule = typeof import("smplr");

/** Create a smplr instrument for a preset ("piano", "sf:flute", "mallet:…", "vcsl:…"). */
function makeSmplr(m: SmplrModule, ctx: BaseAudioContext, preset: string, destination: AudioNode) {
  // samples are cached in the browser (Cache API) where available: offline after the first use
  const storage = typeof caches !== "undefined" && isSecureContext ? m.CacheStorage() : undefined;
  const opts = { destination, volume: 90, ...(storage ? { storage } : {}) };
  const [kind, ...rest] = preset.split(":");
  const name = rest.join(":");
  const c = ctx as AudioContext;
  if (preset === "piano") return m.SplendidGrandPiano(c, opts);
  if (kind === "epiano") return m.ElectricPiano(c, { ...opts, instrument: name });
  if (kind === "mallet") return m.Mallet(c, { ...opts, instrument: name });
  if (kind === "smolken") return m.Smolken(c, { ...opts, instrument: name });
  if (kind === "vcsl") return m.Versilian(c, { ...opts, instrument: name });
  return m.Soundfont(c, { ...opts, instrument: preset.replace(/^sf:/, "") });
}

function smplrVoice(src: InstrumentSource, dest: Tone.Gain): InstrumentVoice {
  // smplr wants a native node; the channel input is a Tone.Gain around one
  const destination = dest.input as unknown as AudioNode;
  let inst: Smplr | null = null;
  let disposed = false;
  let state: "ready" | "loading" | "error" = "loading";
  markBusy(src.preset, true);
  // smplr (and its samples) load on first use
  import("smplr")
    .then((m) => {
      if (disposed) return;
      inst = makeSmplr(m, destination.context, src.preset, destination) as Smplr;
      return inst.ready;
    })
    .then(
      () => {
        state = "ready";
        markDownloaded(src.preset);
      },
      () => {
        state = "error";
        markBusy(src.preset, false);
      },
    );
  return {
    key: `smplr:${src.preset}`,
    state: () => state,
    play(notes, time, step) {
      if (state !== "ready" || !inst) return;
      for (const n of notes)
        inst.start({
          note: n.pitch,
          velocity: Math.round(n.velocity * 127),
          time,
          duration: n.length * step * 0.95,
        });
    },
    releaseAll: () => inst?.stop(),
    update: () => {},
    dispose: () => {
      disposed = true;
      inst?.dispose();
    },
  };
}

/** Download a streamed instrument now, so it plays (and renders) offline later. */
export async function prefetchInstrument(preset: string): Promise<void> {
  markBusy(preset, true);
  try {
    const m = await import("smplr");
    const ctx = Tone.getContext().rawContext as AudioContext;
    const sink = ctx.createGain();
    const inst = makeSmplr(m, ctx, preset, sink) as Smplr;
    await inst.ready;
    inst.dispose();
    markDownloaded(preset);
  } catch (e) {
    markBusy(preset, false);
    throw e;
  }
}

export function instrumentKey(track: Track): string {
  const src = track.instrument ?? defaultInstrument(track);
  if (src.source === "sampler") return `sampler:${src.sampleId}:${src.rootNote ?? 60}`;
  if (src.source === "synth") return "synth";
  return `${src.source}:${src.preset}`;
}

export function createInstrument(track: Track, dest: Tone.Gain): InstrumentVoice {
  const src = track.instrument ?? defaultInstrument(track);
  if (src.source === "sampler") return samplerVoice(src, dest);
  if (src.source === "smplr") return smplrVoice(src, dest);
  return synthVoice(track, src, dest);
}
