/**
 * Sound sources of instrument tracks: synth patches (engine/synth.ts), a keyboard sampler (any library
 * sample across the keyboard) and sampled instruments from smplr (loaded on demand).
 */
import * as Tone from "tone";
import type { Smplr } from "smplr";
import { FACTORY_SYNTHS, factorySynth } from "../library/synths";
import { defaultInstrument, effectivePatch, patchOf } from "../library/synthTrack";
import { sanitizePatch } from "../model/synth";
import { workletSynth, type WorkletSynth } from "./synth/node";
import { markBusy, markDownloaded } from "../library/downloads";
import { CATALOG } from "../library/instruments";
import { toUnit } from "../model/params";
import { noteName } from "../model/notes";
import type { InstrumentSource, Note, Track } from "../model/types";
import { getBuffer } from "./samples";
import { db } from "../storage/db";

/** The factory synths, for pickers (D80). */
export const SYNTH_PRESETS = FACTORY_SYNTHS;

export { defaultInstrument, patchOf };

/** Sampled instruments from the catalog (D78), for pickers. */
export const SAMPLED_INSTRUMENTS = CATALOG.filter((c) => c.source.source === "smplr").map((c) => ({
  id: c.source.preset,
  name: c.name,
  family: c.family,
  group: c.group,
}));

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
  /** Synths: mod wheel, aftertouch and pitch bend; modulation reports for the editor. */
  synth?: WorkletSynth;
  /** Start a held note; the returned function releases it (keyboards, MIDI). */
  hold?(pitch: number, velocity: number, time: number): (end: number) => void;
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

/** A synth playing its patch (D83), with the macros at the track's SOUND knobs. */
function synthVoice(track: Track, src: InstrumentSource, dest: Tone.Gain): InstrumentVoice {
  const effective = (t: Track) => sanitizePatch(effectivePatch(t, patchOf(t.instrument ?? src)));
  const synth = workletSynth(dest);
  synth.setPatch(effective(track), 120);
  return {
    // one voice for every patch: switching sounds doesn't rebuild the graph
    key: "synth",
    state: () => (synth.ready() ? "ready" : "loading"),
    play: (notes, time, step) => synth.play(notes, time, step),
    hold: (pitch, velocity, time) => synth.hold(pitch, velocity, time),
    releaseAll: (time) => synth.releaseAll(time),
    update: (t, bpm = 120) => synth.setPatch(effective(t), bpm),
    dispose: () => synth.dispose(),
    synth,
  };
}

/** A keyboard sampler: one sample, or several at their notes (multi-sample, D82). */
function samplerVoice(src: InstrumentSource, dest: Tone.InputNode): InstrumentVoice {
  let sampler: Tone.Sampler | null = null;
  const zones = src.zones?.length
    ? src.zones
    : src.sampleId
      ? [{ note: src.rootNote ?? 60, sampleId: src.sampleId }]
      : [];
  const make = () => {
    if (sampler || !zones.length) return;
    const urls: Record<string, AudioBuffer> = {};
    for (const z of zones) {
      const buf = getBuffer(z.sampleId);
      // wait until every sample is loaded
      if (!buf) return;
      urls[noteName(z.note).replace("♭", "b")] = buf;
    }
    sampler = new Tone.Sampler({ urls }).connect(dest);
  };
  // the library loads the samples a project uses (zones included)
  make();
  return {
    key: samplerKey(src),
    state: () => {
      make();
      return sampler ? "ready" : "loading";
    },
    play(notes, time, step) {
      make();
      if (!sampler) return;
      for (const n of notes)
        sampler.triggerAttackRelease(midiToHz(n.pitch), n.length * step * 0.95, time, n.velocity);
    },
    hold(pitch, velocity, time) {
      make();
      const s = sampler;
      if (!s) return () => {};
      s.triggerAttack(midiToHz(pitch), time, velocity);
      return (end) => s.triggerRelease(midiToHz(pitch), end);
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

const samplerKey = (src: InstrumentSource) =>
  src.zones?.length
    ? `sampler:${src.zones.map((z) => `${z.note}=${z.sampleId}`).join(",")}`
    : `sampler:${src.sampleId}:${src.rootNote ?? 60}`;

/** A SoundFont (.sf2) you imported: one of its instruments, played by smplr (D82). */
function sf2Voice(src: InstrumentSource, dest: Tone.Gain): InstrumentVoice {
  const destination = dest.input as unknown as AudioNode;
  let inst: (Smplr & { loadInstrument(n: string): Promise<void> }) | null = null;
  let state: "ready" | "loading" | "error" = "loading";
  let disposed = false;
  let url = "";
  void (async () => {
    const blob = src.sampleId ? (await db.blobs.get(src.sampleId))?.blob : undefined;
    if (!blob) throw new Error("The SoundFont file is missing");
    const [m, { SoundFont2 }] = await Promise.all([import("smplr"), import("soundfont2")]);
    if (disposed) return;
    url = URL.createObjectURL(blob);
    inst = m.Soundfont2(destination.context as AudioContext, {
      url,
      createSoundfont: (data) => new SoundFont2(data),
      destination,
      volume: 90,
    }) as unknown as typeof inst;
    await inst!.ready;
    await inst!.loadInstrument(src.preset);
  })().then(
    () => (state = "ready"),
    () => (state = "error"),
  );
  return {
    key: `sf2:${src.sampleId}:${src.preset}`,
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
    hold(pitch, velocity, time) {
      if (state !== "ready" || !inst) return () => {};
      const stop = inst.start({ note: pitch, velocity: Math.round(velocity * 127), time });
      return (end) => stop(end);
    },
    releaseAll: () => inst?.stop(),
    update: () => {},
    dispose: () => {
      disposed = true;
      inst?.dispose();
      if (url) URL.revokeObjectURL(url);
    },
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
    hold(pitch, velocity, time) {
      if (state !== "ready" || !inst) return () => {};
      const stop = inst.start({ note: pitch, velocity: Math.round(velocity * 127), time });
      return (end) => stop(end);
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
  if (src.source === "sampler") return samplerKey(src);
  if (src.source === "sf2") return `sf2:${src.sampleId}:${src.preset}`;
  if (src.source === "synth") return "synth";
  return `${src.source}:${src.preset}`;
}

export function createInstrument(track: Track, dest: Tone.Gain): InstrumentVoice {
  const src = track.instrument ?? defaultInstrument(track);
  if (src.source === "sampler") return samplerVoice(src, dest);
  if (src.source === "smplr") return smplrVoice(src, dest);
  if (src.source === "sf2") return sf2Voice(src, dest);
  return synthVoice(track, src, dest);
}
