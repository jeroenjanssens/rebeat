/**
 * Built-in drum kits, synthesized with Tone.js and rendered offline into samples (no sample
 * licensing issues). 808- and 909-style, plus a short vocal-like hook for the demo song.
 */
import * as Tone from "tone";
import type { SoundCategory } from "../model/types";
import { registerSample, type SampleInfo } from "./samples";

export interface KitSound extends SampleInfo {
  kit: string;
  category: SoundCategory;
  length: number;
  render: () => void;
}

const out = () => Tone.getDestination();

/** Start time of the sound being rendered: all sounds render in one offline pass. */
let T = 0;

function noise(type: "white" | "pink", decay: number, time = 0, filter?: Tone.Filter, gain = 1) {
  const n = new Tone.NoiseSynth({
    noise: { type },
    envelope: { attack: 0.001, decay, sustain: 0 },
    volume: Tone.gainToDb(gain),
  });
  if (filter) n.chain(filter, out());
  else n.connect(out());
  n.triggerAttack(T + time);
}

function tone(
  freq: number,
  decay: number,
  type: OscillatorType = "sine",
  gain = 1,
  dest?: Tone.InputNode,
) {
  const s = new Tone.Synth({
    oscillator: { type } as Tone.OmniOscillatorOptions,
    envelope: { attack: 0.001, decay, sustain: 0, release: 0.01 },
    volume: Tone.gainToDb(gain),
  });
  s.connect(dest ?? out());
  s.triggerAttack(freq, T);
}

function membrane(
  note: Tone.Unit.Frequency,
  pitchDecay: number,
  octaves: number,
  decay: number,
  gain = 1,
) {
  const m = new Tone.MembraneSynth({
    pitchDecay,
    octaves,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay, sustain: 0, release: 0.05 },
    volume: Tone.gainToDb(gain),
  }).connect(out());
  m.triggerAttack(note, T);
}

function metal(decay: number, freq: number, highpass: number, gain = 0.5) {
  const hp = new Tone.Filter(highpass, "highpass").connect(out());
  const m = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
    volume: Tone.gainToDb(gain),
  }).connect(hp);
  m.triggerAttack(freq, T, 1);
}

const SOUNDS: KitSound[] = [
  // ---- 909 ----
  {
    id: "kit:909:kick",
    name: "909 Kick",
    kit: "909",
    category: "kick",
    length: 0.6,
    render: () => {
      membrane(52, 0.035, 5, 0.42);
      noise("white", 0.006, 0, new Tone.Filter(2500, "highpass"), 0.35);
    },
  },
  {
    id: "kit:909:snare",
    name: "909 Snare",
    kit: "909",
    category: "snare",
    length: 0.4,
    render: () => {
      membrane(190, 0.012, 1.4, 0.13, 0.7);
      noise("white", 0.24, 0, new Tone.Filter(1800, "highpass"), 0.55);
    },
  },
  {
    id: "kit:909:clap",
    name: "909 Clap",
    kit: "909",
    category: "clap",
    length: 0.45,
    render: () => {
      const bp = () => new Tone.Filter({ frequency: 1150, type: "bandpass", Q: 1.1 });
      [0, 0.011, 0.022].forEach((t) => noise("white", 0.008, t, bp(), 0.9));
      noise("white", 0.2, 0.031, bp(), 0.8);
    },
  },
  {
    id: "kit:909:chh",
    name: "909 Closed Hat",
    kit: "909",
    category: "hat",
    length: 0.18,
    render: () => metal(0.06, 420, 7500, 0.8),
  },
  {
    id: "kit:909:ohh",
    name: "909 Open Hat",
    kit: "909",
    category: "hat",
    length: 0.8,
    render: () => metal(0.5, 420, 7000, 0.7),
  },
  {
    id: "kit:909:rim",
    name: "909 Rim",
    kit: "909",
    category: "perc",
    length: 0.12,
    render: () => {
      const bp = new Tone.Filter({ frequency: 1800, type: "bandpass", Q: 2 }).connect(out());
      tone(1700, 0.035, "triangle", 0.9, bp);
      tone(480, 0.02, "square", 0.4, bp);
    },
  },
  {
    id: "kit:909:tom",
    name: "909 Tom",
    kit: "909",
    category: "tom",
    length: 0.6,
    render: () => membrane(130, 0.06, 1.3, 0.45, 0.9),
  },
  {
    id: "kit:909:crash",
    name: "909 Crash",
    kit: "909",
    category: "hat",
    length: 1.8,
    render: () => metal(1.5, 300, 5000, 0.5),
  },
  // ---- 808 ----
  {
    id: "kit:808:kick",
    name: "808 Kick",
    kit: "808",
    category: "kick",
    length: 1.4,
    render: () => membrane(48, 0.06, 2.6, 1.1),
  },
  {
    id: "kit:808:snare",
    name: "808 Snare",
    kit: "808",
    category: "snare",
    length: 0.35,
    render: () => {
      tone(238, 0.16, "sine", 0.55);
      tone(476, 0.1, "sine", 0.35);
      noise("white", 0.18, 0, new Tone.Filter(1200, "highpass"), 0.5);
    },
  },
  {
    id: "kit:808:clap",
    name: "808 Clap",
    kit: "808",
    category: "clap",
    length: 0.5,
    render: () => {
      const bp = () => new Tone.Filter({ frequency: 950, type: "bandpass", Q: 0.9 });
      [0, 0.009, 0.018, 0.027].forEach((t) => noise("pink", 0.007, t, bp(), 1));
      noise("pink", 0.26, 0.034, bp(), 0.9);
    },
  },
  {
    id: "kit:808:chh",
    name: "808 Closed Hat",
    kit: "808",
    category: "hat",
    length: 0.15,
    render: () => metal(0.045, 320, 8000, 0.8),
  },
  {
    id: "kit:808:ohh",
    name: "808 Open Hat",
    kit: "808",
    category: "hat",
    length: 0.7,
    render: () => metal(0.38, 320, 7500, 0.7),
  },
  {
    id: "kit:808:rim",
    name: "808 Rimshot",
    kit: "808",
    category: "perc",
    length: 0.1,
    render: () => {
      const hp = new Tone.Filter(600, "highpass").connect(out());
      tone(1720, 0.025, "triangle", 1, hp);
      tone(460, 0.015, "sine", 0.6, hp);
    },
  },
  {
    id: "kit:808:tom",
    name: "808 Tom",
    kit: "808",
    category: "tom",
    length: 0.7,
    render: () => membrane(98, 0.1, 0.8, 0.55, 0.9),
  },
  {
    id: "kit:808:cowbell",
    name: "808 Cowbell",
    kit: "808",
    category: "perc",
    length: 0.45,
    render: () => {
      const bp = new Tone.Filter({ frequency: 900, type: "bandpass", Q: 1.5 }).connect(out());
      tone(540, 0.35, "square", 0.5, bp);
      tone(800, 0.35, "square", 0.5, bp);
    },
  },
];

const VOWELS: Record<string, [number, number, number]> = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  e: [400, 1600, 2700],
  u: [350, 600, 2700],
  i: [300, 2300, 3000],
};

/** A wordless vocal-like phrase: a sawtooth through moving vowel formants, 2 bars at 112 BPM. */
function renderVox() {
  const beat = 60 / 112;
  const formants = VOWELS.a.map((f, i) =>
    new Tone.Filter({ frequency: f, type: "bandpass", Q: 8 - i * 2 }).connect(out()),
  );
  const vib = new Tone.LFO(5.5, -12, 12).start(T);
  const synth = new Tone.MonoSynth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.04, decay: 0.2, sustain: 0.8, release: 0.12 },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.1,
      sustain: 1,
      release: 0.2,
      baseFrequency: 8000,
      octaves: 0,
    },
    portamento: 0.04,
    volume: 6,
  });
  formants.forEach((f) => synth.connect(f));
  vib.connect(synth.detune);
  // [beat, length (beats), note, vowel]
  const phrase: [number, number, string, string][] = [
    [0, 0.75, "G4", "o"],
    [1, 0.5, "Bb4", "a"],
    [1.5, 1.25, "C5", "a"],
    [3, 0.5, "Bb4", "e"],
    [3.5, 0.4, "G4", "u"],
    [4, 0.75, "Eb4", "o"],
    [5, 0.5, "F4", "a"],
    [5.5, 1.5, "G4", "a"],
    [7.25, 0.5, "C5", "i"],
  ];
  for (const [b, len, note, vowel] of phrase) {
    const t = T + b * beat;
    synth.triggerAttackRelease(note, len * beat, t, 0.8);
    formants.forEach((f, i) => f.frequency.linearRampTo(VOWELS[vowel][i], 0.05, t));
  }
}

const VOX: SampleInfo & { length: number } = {
  id: "demo:vox-hook",
  name: "Vox hook 112",
  category: "vocal",
  bpm: 112,
  length: (60 / 112) * 8,
};

export const KIT_SOUNDS: SampleInfo[] = [...SOUNDS, VOX];
export const KITS = ["909", "808"];

export function kitSounds(kit: string): KitSound[] {
  return SOUNDS.filter((s) => s.kit === kit);
}

let rendering: Promise<void> | null = null;

/** Render the built-in sounds once (offline, faster than real time, all in one pass). */
export function renderKits(): Promise<void> {
  rendering ??= (async () => {
    const sr = 44100;
    const all: (SampleInfo & { length: number; render: () => void })[] = [
      ...SOUNDS,
      { ...VOX, render: renderVox },
    ];
    const gap = 0.25;
    const starts: number[] = [];
    let total = 0;
    for (const s of all) {
      starts.push(total);
      total += s.length + gap;
    }
    const rendered = await Tone.Offline(
      () => {
        all.forEach((s, i) => {
          T = starts[i];
          s.render();
        });
        T = 0;
      },
      total,
      1,
      sr,
    );
    const data = rendered.getChannelData(0);
    all.forEach((s, i) => {
      const from = Math.round(starts[i] * sr);
      const len = Math.round(s.length * sr);
      const buf = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 });
      buf.copyToChannel(data.slice(from, from + len), 0);
      registerSample(s, normalize(buf, s.id === VOX.id ? 0.8 : 0.95));
    });
  })();
  return rendering;
}

function normalize(buf: AudioBuffer, target = 0.95): AudioBuffer {
  let max = 0;
  for (let c = 0; c < buf.numberOfChannels; c++)
    for (const v of buf.getChannelData(c)) max = Math.max(max, Math.abs(v));
  if (max > 0)
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= target / max;
    }
  return buf;
}
