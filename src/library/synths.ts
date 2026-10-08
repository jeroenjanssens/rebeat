/**
 * Factory synths (D80, voiced for version 2 in §0.6e H): patches in the style of well-known songs
 * and synths. Ids are stable: projects store them (the first ten were the original presets).
 */
import { makePatch, type PatchSpec, type SynthPatch } from "../model/synth";

export type SynthGroup = "Bass" | "Leads" | "Pads" | "Keys" | "Plucks & stabs" | "FX";

export interface FactorySynth {
  id: string;
  name: string;
  group: SynthGroup;
  /** What it's in the style of. */
  note?: string;
  patch: SynthPatch;
}

/**
 * The house style of the factory synths, unless a spec says otherwise: oscillators without drift
 * (it's added where it suits), global LFOs, glide on every mono note, no stereo spread of notes.
 * Macros the spec doesn't give are the defaults for its sound (autoMacros).
 */
function voiced(spec: PatchSpec): SynthPatch {
  return makePatch({
    ...spec,
    osc: spec.osc?.map((o) => o && { drift: 0, ...o }) as PatchSpec["osc"],
    lfos: [0, 1, 2].map((i) => ({
      mode: "global" as const,
      ...spec.lfos?.[i],
    })) as PatchSpec["lfos"],
    voice: { glideMode: "always", ...spec.voice },
    output: { spread: 0, ...spec.output },
  });
}

const synth = (
  id: string,
  name: string,
  group: SynthGroup,
  spec: PatchSpec,
  note?: string,
): FactorySynth => ({ id, name, group, note, patch: voiced(spec) });

export const FACTORY_SYNTHS: FactorySynth[] = [
  // ---- the original presets ----
  synth("warm-pad", "Poly · Warm Pad", "Pads", {
    osc: [{ unison: 3, detune: 22, drift: 0.1 }],
    filters: [{ cutoff: 2600, reso: 0.127, keytrack: 0.4 }],
    envs: [{ attack: 0.3, decay: 0.4, release: 1.2 }],
    output: { volume: -14, spread: 0.4 },
  }),
  synth("keys", "Poly · Keys", "Keys", {
    osc: [{ shape: 1 }, { shape: 0, level: 0.3, octave: 1 }],
    filters: [{ cutoff: 5000, reso: 0.0912 }],
    envs: [{ decay: 0.6, sustain: 0.25, release: 0.5 }],
    output: { volume: -10 },
  }),
  synth("pluck", "Poly · Pluck", "Plucks & stabs", {
    osc: [{ shape: 3 }],
    filters: [{ cutoff: 600, reso: 0.298, env: 3.5 }],
    envs: [
      { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 },
      { attack: 0.001, decay: 0.18, sustain: 0, release: 0.2 },
    ],
    output: { volume: -8.5 },
  }),
  synth("init", "Poly · Init", "Keys", {
    osc: [{}],
    filters: [{ reso: 0.0912 }],
    output: { volume: -14 },
  }),
  synth(
    "acid",
    "Mono · Acid Bass",
    "Bass",
    {
      osc: [{}],
      filters: [{ model: "ladder", cutoff: 140, reso: 0.784, keytrack: 0.2, env: 3.6 }],
      envs: [
        { attack: 0.003, sustain: 0.6, release: 0.08 },
        { attack: 0.003, decay: 0.22, sustain: 0.1, release: 0.15 },
      ],
      voice: { mode: "mono" },
      output: { drive: 0.25 },
      macros: [
        {
          name: "Cutoff",
          // resting where the patch is (140 Hz), as every macro does
          value: Math.log(140 / 60) / Math.log(1400 / 60),
          targets: [{ path: "filters.0.cutoff", min: 60, max: 1400 }],
        },
        {
          name: "Resonance",
          value: (0.784 - 0.3) / 0.6,
          targets: [{ path: "filters.0.reso", min: 0.3, max: 0.9 }],
        },
        { name: "Env mod", value: 0.6, targets: [{ path: "filters.0.env", min: 0, max: 6 }] },
        {
          name: "Decay",
          value: Math.log(0.22 / 0.05) / Math.log(1.2 / 0.05),
          targets: [{ path: "envs.1.decay", min: 0.05, max: 1.2 }],
        },
      ],
    },
    "the Roland TB-303",
  ),
  synth("sub", "Mono · Sub Bass", "Bass", {
    osc: [{ shape: 0 }],
    filters: [{ cutoff: 900, reso: 0.0912, keytrack: 0 }],
    envs: [{ attack: 0.01, sustain: 0.9, release: 0.2 }],
    voice: { mode: "mono" },
    output: { volume: -13 },
  }),
  synth("lead", "Mono · Square Lead", "Leads", {
    osc: [{ shape: 3 }],
    filters: [{ cutoff: 900, reso: 0.376, env: 2.5 }],
    envs: [
      { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.25 },
      { attack: 0.01, sustain: 0.5 },
    ],
    lfos: [{ rate: 5.5 }],
    matrix: [{ source: "lfo1", dest: "pitch", amount: 0.005 }],
    voice: { mode: "mono", glide: 0.02 },
    output: { volume: -14 },
  }),
  synth(
    "fm-epiano",
    "FM · E-Piano",
    "Keys",
    {
      osc: [
        { shape: 0 },
        { shape: 0, level: 0.08, octave: 2 },
        { shape: 0, level: 0, retrigger: true },
      ],
      filters: [{ cutoff: 9000, reso: 0.0912 }],
      envs: [
        { attack: 0.002, decay: 1.6, sustain: 0.15, release: 0.6, velocity: 0.8 },
        {},
        { attack: 0.001, decay: 0.6, sustain: 0.05, release: 0.6, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.055 }],
      fm: { route: "3>1" },
      output: { volume: -13 },
    },
    "the Yamaha DX7 electric piano of '80s ballads",
  ),
  synth(
    "fm-bell",
    "FM · Bell",
    "Keys",
    {
      osc: [
        { shape: 0 },
        undefined,
        { shape: 0, level: 0, octave: 1, semi: 9, fine: 68.83, retrigger: true },
      ],
      filters: [{ cutoff: 12000, reso: 0.0912, keytrack: 0 }],
      envs: [
        { attack: 0.001, decay: 2.5, sustain: 0, release: 2.2 },
        {},
        { attack: 0.001, decay: 1.4, sustain: 0.05, release: 1.4, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.125 }],
      fm: { route: "3>1" },
      output: { volume: -14 },
    },
    "the DX7's tubular bells",
  ),
  synth("am-organ", "AM · Organ", "Keys", {
    osc: [
      { shape: 0, level: 0.8 },
      { shape: 0, level: 0.5, octave: 1 },
    ],
    filters: [{ cutoff: 9000, reso: 0.0912, keytrack: 0 }],
    envs: [{ attack: 0.008, decay: 0.1, sustain: 1, release: 0.12, velocity: 0 }],
    lfos: [{ rate: 6.5 }],
    matrix: [{ source: "lfo1", dest: "amp", amount: 0.075 }],
    sub: { level: 0.5 },
    output: { volume: -19 },
  }),

  // ---- bass ----
  synth(
    "moroder-bass",
    "Moroder Bass",
    "Bass",
    {
      osc: [{ drift: 0.1 }, { level: 0.7, fine: 7, drift: 0.1 }],
      filters: [{ model: "ladder", cutoff: 260, reso: 0.237, keytrack: 0.4, env: 3 }],
      envs: [
        { attack: 0.002, decay: 0.18, sustain: 0.35, release: 0.05 },
        { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
      ],
      output: { volume: -4 },
    },
    "the sequenced Moog bass of Donna Summer's “I Feel Love”",
  ),
  synth(
    "reese",
    "Reese Bass",
    "Bass",
    {
      osc: [
        { unison: 2, detune: 24 },
        { level: 0.6, octave: -1, fine: -9 },
      ],
      filters: [{ model: "ladder", cutoff: 700, reso: 0.188, keytrack: 0 }],
      envs: [{ decay: 0.2, sustain: 1, release: 0.18 }],
      lfos: [{ shape: "triangle", rate: 0.3 }],
      matrix: [{ source: "lfo1", dest: "filter1.cutoff", amount: 0.03 }],
      sub: { level: 0.4 },
      voice: { mode: "mono" },
      output: { drive: 0.2, volume: -16 },
    },
    "Kevin Saunderson's “Just Want Another Chance”, the drum & bass staple",
  ),
  synth(
    "moog-bass",
    "Fat Moog Bass",
    "Bass",
    {
      // two slightly unsteady oscillators, like the Minimoog's
      osc: [{ drift: 0.3 }, { shape: 3, level: 0.6, octave: -1, drift: 0.3 }],
      filters: [{ model: "ladder", cutoff: 240, reso: 0.315, env: 2.6 }],
      envs: [
        { attack: 0.003, release: 0.12 },
        { attack: 0.002, sustain: 0.25, release: 0.2 },
      ],
      voice: { mode: "mono", glide: 0.03 },
      output: { drive: 0.2, volume: -15 },
    },
    "the Minimoog basses of '70s funk and Parliament",
  ),
  synth(
    "808-boom",
    "808 Boom",
    "Bass",
    {
      osc: [{ shape: 0, retrigger: true }],
      filters: [{ cutoff: 1200, reso: 0.0912, keytrack: 0 }],
      envs: [
        { attack: 0.002, decay: 1.4, sustain: 0, release: 0.4, velocity: 0.4 },
        {},
        // the pitch drop at the start of each note
        { attack: 0.001, decay: 0.07, sustain: 0, release: 0.05, curve: 0.6 },
      ],
      matrix: [{ source: "env3", dest: "pitch", amount: 0.5, via: "macro3" }],
      macros: [undefined, undefined, { name: "Punch", value: 0.6, targets: [] }],
      voice: { mode: "mono", glide: 0.05 },
      output: { drive: 0.45, volume: -21 },
    },
    "the long, distorted 808 bass of trap",
  ),
  synth(
    "wobble",
    "Wobble Bass",
    "Bass",
    {
      osc: [
        { unison: 3, detune: 18 },
        { shape: 3, level: 0.7, octave: -1 },
      ],
      filters: [{ model: "ladder", cutoff: 380, reso: 0.674, keytrack: 0 }],
      envs: [{ decay: 0.2, sustain: 1, release: 0.15 }],
      lfos: [{ sync: "1/2" }],
      // the wobble, as deep as the Wobble macro says
      matrix: [{ source: "lfo1", dest: "filter1.cutoff", amount: 0.25, via: "macro7" }],
      macros: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { name: "Wobble", value: 0.75, targets: [] },
      ],
      voice: { mode: "mono" },
      output: { drive: 0.5, volume: -22 },
    },
    "dubstep wobbles (an LFO synced to the tempo on the filter)",
  ),
  synth(
    "thriller-bass",
    "Funk Synth Bass",
    "Bass",
    {
      osc: [{ shape: 3 }, { level: 0.5, fine: 5 }],
      filters: [{ model: "ladder", cutoff: 520, reso: 0.486, env: 2 }],
      envs: [
        { attack: 0.002, decay: 0.25, sustain: 0.6, release: 0.08 },
        { attack: 0.002, decay: 0.15, sustain: 0.2, release: 0.1 },
      ],
      voice: { mode: "mono" },
      output: { volume: -8 },
    },
    "the synth bass of Michael Jackson's “Thriller”",
  ),
  synth(
    "new-wave-seq",
    "New Wave Sequence",
    "Bass",
    {
      osc: [{}, { shape: 3, pw: 0.3, level: 0.5 }],
      filters: [{ model: "ladder", cutoff: 420, reso: 0.402, keytrack: 0.4, env: 2.2 }],
      envs: [
        { attack: 0.002, sustain: 0.4, release: 0.1 },
        { attack: 0.001, decay: 0.2, sustain: 0.15, release: 0.15 },
      ],
      lfos: [{ rate: 0.4 }],
      matrix: [{ source: "lfo1", dest: "pan", amount: 0.15 }],
      output: { volume: -5.5 },
    },
    "the sequenced bass of Eurythmics' “Sweet Dreams”",
  ),

  // ---- leads ----
  synth(
    "axel-lead",
    "Axel Lead",
    "Leads",
    {
      osc: [{ shape: 3 }, { level: 0.5, fine: 8 }],
      filters: [{ cutoff: 1800, reso: 0.237, env: 1.5 }],
      envs: [
        { decay: 0.2, release: 0.15 },
        { attack: 0.01, sustain: 0.6, release: 0.2 },
      ],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.00333 }],
      voice: { mode: "mono", glide: 0.015 },
      output: { volume: -15 },
    },
    "Harold Faltermeyer's “Axel F”",
  ),
  synth(
    "numan-lead",
    "Numan Lead",
    "Leads",
    {
      osc: [
        { unison: 2, detune: 10, drift: 0.1 },
        // hard-synced to oscillator 1: the mod envelope sweeps its pitch for the tearing sound
        { level: 0.45, semi: 7, sync: true },
      ],
      filters: [{ cutoff: 900, reso: 0.564, keytrack: 0.5, env: 3 }],
      envs: [
        { attack: 0.01 },
        { attack: 0.01, decay: 0.4, sustain: 0.4 },
        { attack: 0.001, decay: 0.6, sustain: 0.15, release: 0.3 },
      ],
      matrix: [{ source: "env3", dest: "osc2.pitch", amount: 0.5, via: "macro3" }],
      macros: [undefined, undefined, { name: "Sync", value: 0.6, targets: [] }],
      voice: { mode: "mono", glide: 0.01 },
      output: { volume: -12.5 },
    },
    "Gary Numan's “Cars” (Polymoog and Minimoog)",
  ),
  synth(
    "oxygene",
    "Oxygène Lead",
    "Leads",
    {
      osc: [{ shape: 1 }, { shape: 0, level: 0.3, octave: 1 }],
      filters: [{ cutoff: 3000, reso: 0.0912 }],
      envs: [{ attack: 0.03, sustain: 0.85, release: 0.6 }],
      lfos: [{ rate: 5.5 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.00625 }],
      voice: { mode: "mono", glide: 0.08 },
      output: {},
    },
    "Jean-Michel Jarre's “Oxygène”",
  ),
  synth(
    "chiptune",
    "Chiptune",
    "Leads",
    {
      osc: [{ shape: 3, pw: 0.125 }],
      filters: [{ cutoff: 16000, reso: 0.0912, keytrack: 0 }],
      envs: [{ attack: 0.001, decay: 0.1, sustain: 0.7, release: 0.04, velocity: 0 }],
      lfos: [{ shape: "triangle", rate: 6 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.00417 }],
      voice: { mode: "mono" },
      output: { volume: -11 },
    },
    "the NES and Game Boy",
  ),
  synth(
    "supersaw",
    "Supersaw",
    "Leads",
    {
      osc: [{ unison: 7, detune: 35, width: 0.9 }],
      filters: [{ cutoff: 6000, reso: 0.0912, keytrack: 0.2 }],
      envs: [{ decay: 0.4, sustain: 0.85, release: 0.45 }],
      output: { volume: -15 },
    },
    "the Roland JP-8000 supersaw of '90s trance",
  ),
  synth(
    "hoover",
    "Hoover",
    "Leads",
    {
      osc: [
        { shape: 3, pw: 0.3, unison: 5, detune: 45 },
        { level: 0.6, octave: -1, unison: 3, detune: 30 },
      ],
      filters: [{ cutoff: 3200, reso: 0.127 }],
      envs: [{ attack: 0.01, sustain: 0.9 }],
      lfos: [{ rate: 4 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.00833 }],
      voice: { mode: "mono", glide: 0.12 },
      output: { drive: 0.3, volume: -25 },
    },
    "the “Mentasm” hoover of early rave (Roland Alpha Juno)",
  ),
  synth(
    "theremin",
    "Theremin",
    "Leads",
    {
      osc: [{ shape: 0 }, { shape: 1, level: 0.1, octave: 1 }],
      filters: [{ cutoff: 5000, reso: 0.0912, keytrack: 0 }],
      envs: [{ attack: 0.12, sustain: 1, release: 0.45, velocity: 0.3 }],
      lfos: [{ rate: 6 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.0104 }],
      voice: { mode: "mono", glide: 0.2 },
      output: { volume: -15 },
    },
    "the eerie sliding lines of '50s sci-fi films",
  ),

  // ---- pads ----
  synth(
    "juno-strings",
    "Juno Strings",
    "Pads",
    {
      osc: [
        { unison: 3, detune: 15, drift: 0.15 },
        // pulse width modulation: LFO 2 sweeps the width, the Juno's moving shimmer
        { shape: 3, pw: 0.4, level: 0.5, drift: 0.15 },
      ],
      filters: [{ cutoff: 3400, reso: 0.0912, keytrack: 0.5 }],
      envs: [{ attack: 0.35, decay: 1, sustain: 0.85, release: 1.5 }],
      lfos: [
        { shape: "triangle", rate: 0.6 },
        { shape: "triangle", rate: 0.9 },
      ],
      matrix: [
        { source: "lfo1", dest: "pitch", amount: 0.00167 },
        { source: "lfo2", dest: "osc2.pw", amount: 0.7, via: "macro7" },
      ],
      macros: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { name: "PWM", value: 0.7, targets: [] },
      ],
      output: { volume: -17, spread: 0.4 },
    },
    "the Roland Juno-60 string pads of '80s pop",
  ),
  synth(
    "vangelis-brass",
    "Vangelis Brass",
    "Pads",
    {
      osc: [
        { unison: 2, detune: 18, drift: 0.2 },
        { level: 0.4, octave: -1, drift: 0.2 },
      ],
      filters: [{ cutoff: 1300, reso: 0.237, keytrack: 0.4, env: 1.6 }],
      envs: [
        { attack: 0.15, decay: 0.5, sustain: 0.9, release: 2 },
        { attack: 0.25, decay: 0.8, sustain: 0.7, release: 1.5 },
      ],
      lfos: [{ rate: 5.5 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.00417 }],
      output: { volume: -16, spread: 0.5 },
    },
    "the Yamaha CS-80 of Vangelis's “Blade Runner”",
  ),
  synth(
    "glass-pad",
    "Glass Pad",
    "Pads",
    {
      osc: [
        { shape: 0 },
        { shape: 1, level: 0.3, octave: 1 },
        { shape: 0, level: 0, octave: 1, retrigger: true },
      ],
      filters: [{ cutoff: 7000, reso: 0.0912, keytrack: 0 }],
      envs: [
        { attack: 0.6, decay: 1, release: 2.5 },
        {},
        { attack: 0.001, decay: 2, sustain: 0.05, release: 2, curve: 0.7 },
      ],
      lfos: [{ rate: 0.3 }],
      matrix: [
        { source: "lfo1", dest: "amp", amount: 0.075 },
        { source: "env3", dest: "fm", amount: 0.02 },
      ],
      fm: { route: "3>1" },
      output: { volume: -16 },
    },
    "the shimmering DX7 pads of the '80s",
  ),
  synth(
    "dark-drone",
    "Dark Drone",
    "Pads",
    {
      osc: [
        { unison: 4, detune: 12, drift: 0.3 },
        { shape: 3, level: 0.5, octave: -1, drift: 0.3 },
      ],
      filters: [{ model: "ladder", cutoff: 500, reso: 0.486, keytrack: 0.2 }],
      envs: [{ attack: 1.2, decay: 1, sustain: 1, release: 3 }],
      lfos: [{ shape: "triangle", rate: 0.12 }],
      matrix: [{ source: "lfo1", dest: "filter1.cutoff", amount: 0.0875 }],
      noise: { level: 0.056 },
      output: { volume: -7 },
    },
    "John Carpenter's film scores",
  ),

  // ---- keys ----
  synth(
    "clav-funk",
    "Funky Clav",
    "Keys",
    {
      osc: [
        { shape: 3, pw: 0.15 },
        { level: 0.2, octave: 1 },
      ],
      filters: [{ cutoff: 1800, reso: 0.486, keytrack: 0.6, env: 2 }],
      envs: [
        { attack: 0.001, decay: 0.4, sustain: 0.2, release: 0.08, velocity: 0.8 },
        { attack: 0.001, decay: 0.15, sustain: 0.2, release: 0.08 },
      ],
      output: { volume: -10 },
    },
    "the clavinet of Stevie Wonder's “Superstition”",
  ),

  // ---- plucks & stabs ----
  synth(
    "levels-pluck",
    "Levels Pluck",
    "Plucks & stabs",
    {
      osc: [{ unison: 5, detune: 25 }],
      filters: [{ cutoff: 1100, reso: 0.188, env: 3.5 }],
      envs: [
        { attack: 0.002, decay: 0.4, sustain: 0.15 },
        { attack: 0.001, decay: 0.25, sustain: 0.1, release: 0.25 },
      ],
      output: { volume: -6 },
    },
    "the big-room EDM plucks of Avicii's “Levels”",
  ),
  synth(
    "house-organ",
    "House Organ",
    "Plucks & stabs",
    {
      osc: [
        { shape: 0 },
        { shape: 0, level: 0.5, octave: 1 },
        { shape: 0, level: 0, octave: 1, retrigger: true },
      ],
      filters: [{ cutoff: 6000, reso: 0.0912, keytrack: 0 }],
      envs: [
        { attack: 0.002, decay: 0.35, sustain: 0.2, release: 0.15 },
        {},
        { attack: 0.001, decay: 0.15, sustain: 0.05, release: 0.15, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.03 }],
      fm: { route: "3>1" },
      output: { volume: -9 },
    },
    "the Korg M1 organ of '90s house (Robin S's “Show Me Love”)",
  ),
  synth(
    "rave-stab",
    "Rave Stab",
    "Plucks & stabs",
    {
      osc: [{ unison: 3 }, { shape: 3, level: 0.4, octave: 1 }],
      filters: [{ cutoff: 2400, reso: 0.298, env: 2 }],
      envs: [
        { attack: 0.001, sustain: 0, release: 0.15 },
        { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
      ],
      output: { drive: 0.3, volume: -18 },
    },
    "the chord stabs of '90s rave",
  ),
  synth(
    "jump-brass",
    "Jump Brass",
    "Plucks & stabs",
    {
      osc: [
        { unison: 2, detune: 12 },
        { level: 0.8, fine: 6 },
      ],
      filters: [{ cutoff: 1100, reso: 0.159, keytrack: 0.4, env: 2.2 }],
      envs: [
        { attack: 0.01, sustain: 1, release: 0.25 },
        { attack: 0.03, decay: 0.5, sustain: 0.6 },
      ],
      output: { volume: -18 },
    },
    "the Oberheim OB-Xa of Van Halen's “Jump”",
  ),
  synth(
    "upside-down-arp",
    "Upside Down Arp",
    "Plucks & stabs",
    {
      osc: [{}, { level: 0.6, octave: -1, fine: -5 }],
      filters: [{ model: "ladder", cutoff: 800, reso: 0.436, keytrack: 0.4, env: 1.8 }],
      envs: [
        { attack: 0.004, decay: 0.4, sustain: 0.5, release: 0.35 },
        { attack: 0.002, decay: 0.35, sustain: 0.35 },
      ],
      output: { volume: -7 },
    },
    "the arpeggiated synths of the “Stranger Things” theme",
  ),

  // ---- FX ----
  synth("laser", "Laser Zap", "FX", {
    osc: [
      { shape: 3, retrigger: true },
      undefined,
      { shape: 0, level: 0, octave: -1, retrigger: true },
    ],
    filters: [{ cutoff: 9000, reso: 0.0912, keytrack: 0 }],
    envs: [
      { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1, velocity: 0 },
      // the zap: two octaves down in a quarter of a second
      { attack: 0.001, decay: 0.22, sustain: 0, release: 0.1, curve: 0.4 },
      { attack: 0.001, decay: 0.12, sustain: 0.05, release: 0.12, curve: 0.7 },
    ],
    matrix: [
      { source: "env3", dest: "fm", amount: 0.75 },
      { source: "env2", dest: "pitch", amount: 1, via: "macro3" },
    ],
    macros: [undefined, undefined, { name: "Zap", value: 1, targets: [] }],
    fm: { route: "3>1" },
    voice: { mode: "mono" },
    output: { volume: -6 },
  }),
  synth(
    "noise-riser",
    "Noise Riser",
    "FX",
    {
      osc: [{ on: false, level: 0 }],
      filters: [{ type: "bp", cutoff: 500, reso: 0.237, keytrack: 0, env: 4 }],
      envs: [
        { attack: 1.5, decay: 1, sustain: 1, release: 2, velocity: 0 },
        { attack: 2, decay: 2, sustain: 0.6, release: 2 },
      ],
      noise: { level: 0.7 },
      output: { volume: 6 },
    },
    "the white-noise sweeps of build-ups",
  ),
  synth(
    "sci-fi",
    "Sci-Fi Warble",
    "FX",
    {
      osc: [{ shape: 0 }, undefined, { shape: 0, level: 0, semi: 5, fine: 94.83, retrigger: true }],
      filters: [{ cutoff: 6000, reso: 0.0912, keytrack: 0 }],
      envs: [
        { attack: 0.05, decay: 1, sustain: 0.7, release: 1.2 },
        {},
        { attack: 0.001, decay: 3, sustain: 0.05, release: 3, curve: 0.7 },
      ],
      lfos: [{ rate: 7 }],
      matrix: [
        { source: "lfo1", dest: "pitch", amount: 0.0417 },
        { source: "env3", dest: "fm", amount: 0.1 },
      ],
      fm: { route: "3>1" },
      output: { volume: -16 },
    },
    "the Radiophonic Workshop",
  ),
];

export const factorySynth = (id: string) => FACTORY_SYNTHS.find((s) => s.id === id);
