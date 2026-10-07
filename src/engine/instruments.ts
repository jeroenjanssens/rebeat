/**
 * Sound sources of instrument tracks: Tone.js synth presets, a keyboard sampler (any library
 * sample across the keyboard) and sampled instruments from smplr (loaded on demand).
 */
import * as Tone from "tone";
import type { Smplr } from "smplr";
import { toUnit } from "../model/params";
import { noteName } from "../model/notes";
import type { InstrumentSource, Note, Track } from "../model/types";
import { getBuffer } from "./samples";

export interface SynthPreset {
  id: string;
  name: string;
  mono?: boolean;
  make: () => Tone.PolySynth | Tone.MonoSynth;
}

const poly = (opts: Record<string, unknown>, volume = -14) =>
  new Tone.PolySynth({
    maxPolyphony: 16,
    voice: Tone.Synth,
    options: opts as unknown as Tone.SynthOptions,
    volume,
  });

export const SYNTH_PRESETS: SynthPreset[] = [
  {
    id: "warm-pad",
    name: "Poly · Warm Pad",
    make: () =>
      poly(
        {
          oscillator: { type: "fatsawtooth", count: 3, spread: 22 } as Tone.OmniOscillatorOptions,
          envelope: { attack: 0.3, decay: 0.4, sustain: 0.8, release: 1.2 },
        },
        -16,
      ),
  },
  {
    id: "keys",
    name: "Poly · Keys",
    make: () =>
      poly({
        oscillator: { type: "triangle8" } as Tone.OmniOscillatorOptions,
        envelope: { attack: 0.005, decay: 0.6, sustain: 0.25, release: 0.5 },
      }),
  },
  {
    id: "pluck",
    name: "Poly · Pluck",
    make: () =>
      poly(
        {
          oscillator: { type: "square4" } as Tone.OmniOscillatorOptions,
          envelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.2 },
        },
        -12,
      ),
  },
  {
    id: "init",
    name: "Poly · Init",
    make: () => poly({ oscillator: { type: "sawtooth" } as Tone.OmniOscillatorOptions }, -16),
  },
  {
    id: "acid",
    name: "Mono · Acid Bass",
    mono: true,
    make: () =>
      new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 5, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.004, decay: 0.25, sustain: 0.4, release: 0.15 },
        filterEnvelope: {
          attack: 0.004,
          decay: 0.2,
          sustain: 0.2,
          release: 0.2,
          baseFrequency: 120,
          octaves: 3.4,
        },
        volume: -8,
      }),
  },
  {
    id: "sub",
    name: "Mono · Sub Bass",
    mono: true,
    make: () =>
      new Tone.MonoSynth({
        oscillator: { type: "sine" },
        filter: { Q: 0.5, type: "lowpass" },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.85, release: 0.25 },
        filterEnvelope: {
          attack: 0.01,
          decay: 0.1,
          sustain: 1,
          release: 0.2,
          baseFrequency: 400,
          octaves: 1,
        },
        volume: -4,
      }),
  },
  {
    id: "lead",
    name: "Mono · Square Lead",
    mono: true,
    make: () =>
      new Tone.MonoSynth({
        oscillator: { type: "square" },
        filter: { Q: 2, type: "lowpass" },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 },
        filterEnvelope: {
          attack: 0.01,
          decay: 0.3,
          sustain: 0.5,
          release: 0.3,
          baseFrequency: 600,
          octaves: 2.5,
        },
        volume: -14,
      }),
  },
  {
    id: "fm-epiano",
    name: "FM · E-Piano",
    make: () =>
      new Tone.PolySynth({
        maxPolyphony: 16,
        voice: Tone.FMSynth,
        options: {
          harmonicity: 3,
          modulationIndex: 8,
          envelope: { attack: 0.002, decay: 1.4, sustain: 0.1, release: 0.8 },
          modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.4 },
        } as Tone.FMSynthOptions,
        volume: -12,
      }),
  },
  {
    id: "fm-bell",
    name: "FM · Bell",
    make: () =>
      new Tone.PolySynth({
        maxPolyphony: 16,
        voice: Tone.FMSynth,
        options: {
          harmonicity: 5.07,
          modulationIndex: 14,
          envelope: { attack: 0.001, decay: 2.5, sustain: 0, release: 2 },
          modulationEnvelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1 },
        } as Tone.FMSynthOptions,
        volume: -16,
      }),
  },
  {
    id: "am-organ",
    name: "AM · Organ",
    make: () =>
      new Tone.PolySynth({
        maxPolyphony: 16,
        voice: Tone.AMSynth,
        options: {
          harmonicity: 2,
          oscillator: { type: "sine4" },
          envelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.15 },
        } as unknown as Tone.AMSynthOptions,
        volume: -16,
      }),
  },
];

export interface SampledInstrument {
  id: string;
  name: string;
}

/** smplr instruments; samples stream from smplr's CDN the first time they're used. */
export const SAMPLED_INSTRUMENTS: SampledInstrument[] = [
  { id: "piano", name: "Grand piano" },
  { id: "epiano:CP80", name: "Electric piano (CP80)" },
  { id: "epiano:WurlitzerEP200", name: "Wurlitzer" },
  { id: "epiano:TX81Z", name: "FM piano (TX81Z)" },
  { id: "sf:string_ensemble_1", name: "Strings" },
  { id: "sf:choir_aahs", name: "Choir" },
  { id: "sf:acoustic_guitar_nylon", name: "Nylon guitar" },
  { id: "sf:electric_bass_finger", name: "Electric bass" },
  { id: "sf:flute", name: "Flute" },
  { id: "sf:marimba", name: "Marimba" },
  { id: "sf:vibraphone", name: "Vibraphone" },
  { id: "sf:trumpet", name: "Trumpet" },
];

export function defaultInstrument(track: Track): InstrumentSource {
  return { source: "synth", preset: track.category === "bass" ? "acid" : "warm-pad" };
}

export function instrumentName(src: InstrumentSource): string {
  if (src.source === "synth")
    return SYNTH_PRESETS.find((p) => p.id === src.preset)?.name ?? "Synth";
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
  update(track: Track): void;
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

function synthVoice(preset: SynthPreset, dest: Tone.InputNode): InstrumentVoice {
  const synth = preset.make();
  synth.connect(dest);
  let glide = 0;
  return {
    key: `synth:${preset.id}`,
    state: () => "ready",
    play(notes, time, step) {
      if (synth instanceof Tone.MonoSynth) {
        const n = notes[0];
        synth.portamento = n.slide ? Math.max(0.06, glide) : glide;
        synth.triggerAttackRelease(midiToHz(n.pitch), n.length * step * 0.95, time, n.velocity);
      } else
        for (const n of notes)
          synth.triggerAttackRelease(midiToHz(n.pitch), n.length * step * 0.95, time, n.velocity);
    },
    releaseAll(time) {
      if (synth instanceof Tone.PolySynth) synth.releaseAll(time);
      else synth.triggerRelease(time);
    },
    update(track) {
      const p = track.params;
      glide = toUnit.ms(1, 1000)(p["sound.glide"] ?? 0) / 1000;
      if (glide < 0.002) glide = 0;
      const detune = toUnit.semis(1)(p["sound.detune"] ?? 0.5) * 100;
      // presets keep their own envelope until you change the ADSR encoders
      const touched = ["attack", "decay", "sustain", "release"].some(
        (k) => p[`sound.${k}`] !== undefined && p[`sound.${k}`] !== DEFAULT_ADSR[k],
      );
      if (synth instanceof Tone.MonoSynth) {
        synth.set({ detune, ...(touched ? { envelope: envelope(track) } : {}) });
        synth.filterEnvelope.baseFrequency = Math.max(30, toUnit.hz(p["sound.cutoff"] ?? 0.7) / 8);
        synth.filter.Q.value = toUnit.q(p["sound.reso"] ?? 0.2);
      } else synth.set({ detune, ...(touched ? { envelope: envelope(track) } : {}) });
    },
    dispose: () => synth.dispose(),
  };
}

const DEFAULT_ADSR: Record<string, number> = {
  attack: 0.05,
  decay: 0.4,
  sustain: 0.7,
  release: 0.35,
};

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

function smplrVoice(src: InstrumentSource, dest: Tone.Gain): InstrumentVoice {
  const ctx = Tone.getContext().rawContext as AudioContext;
  // smplr wants a native node; the channel input is a Tone.Gain around one
  const destination = dest.input as unknown as AudioNode;
  let inst: Smplr | null = null;
  let disposed = false;
  let state: "ready" | "loading" | "error" = "loading";
  // smplr (and its samples) load on first use
  import("smplr")
    .then(({ ElectricPiano, Soundfont, SplendidGrandPiano }) => {
      if (disposed) return;
      if (src.preset === "piano") inst = SplendidGrandPiano(ctx, { destination, volume: 90 });
      else if (src.preset.startsWith("epiano:"))
        inst = ElectricPiano(ctx, { instrument: src.preset.slice(7), destination, volume: 90 });
      else
        inst = Soundfont(ctx, {
          instrument: src.preset.replace(/^sf:/, ""),
          destination,
          volume: 90,
        });
      return inst.ready;
    })
    .then(
      () => (state = "ready"),
      () => (state = "error"),
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

export function instrumentKey(track: Track): string {
  const src = track.instrument ?? defaultInstrument(track);
  if (src.source === "sampler") return `sampler:${src.sampleId}:${src.rootNote ?? 60}`;
  return `${src.source}:${src.preset}`;
}

export function createInstrument(track: Track, dest: Tone.Gain): InstrumentVoice {
  const src = track.instrument ?? defaultInstrument(track);
  if (src.source === "sampler") return samplerVoice(src, dest);
  if (src.source === "smplr") return smplrVoice(src, dest);
  const preset = SYNTH_PRESETS.find((p) => p.id === src.preset) ?? SYNTH_PRESETS[0];
  return synthVoice(preset, dest);
}
