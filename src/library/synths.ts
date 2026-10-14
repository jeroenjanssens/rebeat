/**
 * Factory synths (D80, voiced for version 2 in §0.6e H): patches in the style of well-known songs
 * and synths. Ids are stable: projects store them (the first ten were the original presets).
 */
import { makePatch, type PatchSpec, type SynthPatch } from "../model/synth";

export type SynthGroup =
  "Bass" | "Leads" | "Pads" | "Keys" | "Plucks & stabs" | "Percussion" | "FX";

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

/** A physical model's patch (D249): no filter, an amp envelope that leaves the decay to it. */
function phys(physical: PatchSpec["physical"], spec: PatchSpec = {}, volume = -12): PatchSpec {
  return {
    source: "physical",
    filters: [{ on: false }],
    envs: [{ attack: 0.001, sustain: 1, release: 2, velocity: 0 }],
    physical,
    output: { volume },
    ...spec,
  };
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

  // ---- new bass ----
  synth(
    "lately-bass",
    "Lately Bass",
    "Bass",
    {
      // TX81Z "Lately Bass": sine carrier with a strong FM bark that decays away quickly
      osc: [{ shape: 0 }, undefined, { shape: 0, level: 0, retrigger: true }],
      filters: [{ cutoff: 2000, reso: 0.159, keytrack: 0.4 }],
      envs: [
        { attack: 0.002, decay: 0.8, sustain: 0.6, release: 0.15 },
        {},
        { attack: 0.001, decay: 0.12, sustain: 0.05, release: 0.1, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.5 }],
      fm: { route: "3>1" },
      voice: { mode: "mono", glide: 0.015 },
      output: { volume: -12 },
    },
    "Yamaha TX81Z",
  ),
  synth(
    "synthwave-bass",
    "Synthwave Bass",
    "Bass",
    {
      // pulsing octave saws with a tight filter pluck: classic synthwave bass
      osc: [
        { unison: 2, detune: 14 },
        { level: 0.6, octave: 1 },
      ],
      filters: [{ model: "ladder", cutoff: 600, reso: 0.315, keytrack: 0.3, env: 3.5 }],
      envs: [
        { attack: 0.002, decay: 0.35, sustain: 0.5, release: 0.12 },
        { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
      ],
      voice: { mode: "mono", glide: 0.02 },
      output: { volume: -9 },
    },
    "the pulsing octave saws of '80s synthwave",
  ),
  synth(
    "deep-house-bass",
    "Deep House Bass",
    "Bass",
    {
      // warm round sine + square mix, short and punchy: classic deep house
      osc: [{ shape: 0 }, { shape: 3, level: 0.4 }],
      filters: [{ model: "ladder", cutoff: 420, reso: 0.188, keytrack: 0.2 }],
      envs: [{ attack: 0.003, decay: 0.5, sustain: 0.5, release: 0.08 }],
      sub: { level: 0.3 },
      voice: { mode: "mono" },
      output: { volume: -12 },
    },
    "the round organ-ish bass of deep house",
  ),
  synth(
    "garage-bass",
    "Garage Bass",
    "Bass",
    {
      // UK garage: sine with a short FM growl click and slow portamento
      osc: [{ shape: 0 }, undefined, { shape: 0, level: 0, retrigger: true }],
      filters: [{ cutoff: 2500, reso: 0.127, keytrack: 0.3 }],
      envs: [
        { attack: 0.003, decay: 0.4, sustain: 0.7, release: 0.1 },
        {},
        { attack: 0.001, decay: 0.1, sustain: 0.05, release: 0.08, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.12 }],
      fm: { route: "3>1" },
      voice: { mode: "mono", glide: 0.04 },
      output: { volume: -11 },
    },
    "UK garage sine bass with FM growl and glide",
  ),
  synth(
    "neuro-bass",
    "Neuro Bass",
    "Bass",
    {
      // FM growl with moving filter and heavy drive: neuro / tearout DnB
      osc: [
        { shape: 1, unison: 2, detune: 16 },
        undefined,
        { shape: 1, level: 0, semi: 7, retrigger: true },
      ],
      filters: [{ model: "ladder", cutoff: 600, reso: 0.55, keytrack: 0 }],
      envs: [
        { attack: 0.003, sustain: 1, release: 0.12 },
        {},
        { attack: 0.001, decay: 0.2, sustain: 0.3, release: 0.15, curve: 0.5 },
      ],
      lfos: [{ shape: "triangle", rate: 4 }],
      matrix: [
        { source: "env3", dest: "fm", amount: 0.4 },
        { source: "lfo1", dest: "filter1.cutoff", amount: 0.2, via: "macro7" },
      ],
      macros: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { name: "Movement", value: 0.6, targets: [] },
      ],
      fm: { route: "3>1" },
      voice: { mode: "mono" },
      output: { drive: 0.4, volume: -22 },
    },
    "FM growl with filter movement, neuro / tearout DnB",
  ),
  synth(
    "juno-sub",
    "Juno Sub",
    "Bass",
    {
      // square wave + sub oscillator: deep, simple mono bass (Roland Juno style)
      osc: [{ shape: 3, pw: 0.5 }],
      filters: [{ model: "ladder", cutoff: 700, reso: 0.237, keytrack: 0.2 }],
      envs: [{ attack: 0.002, decay: 0.3, sustain: 1, release: 0.12 }],
      sub: { level: 0.6, shape: "square" },
      voice: { mode: "mono" },
      output: { volume: -18 },
    },
    "Roland Juno",
  ),

  // ---- new leads ----
  synth(
    "gfunk-whistle",
    "G-Funk Whistle",
    "Leads",
    {
      // pure sine with long portamento and slow vibrato (delay before it fades in)
      osc: [{ shape: 0 }],
      filters: [{ cutoff: 7000, reso: 0.159, keytrack: 0.4 }],
      envs: [{ attack: 0.01, sustain: 0.9, release: 0.25 }],
      lfos: [{ shape: "sine", rate: 5.5, delay: 0.2 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.0083 }],
      voice: { mode: "mono", glide: 0.14 },
      output: { volume: -14 },
    },
    "the whistling synth of Dr. Dre and Snoop Dogg",
  ),
  synth(
    "sync-lead",
    "Sync Lead",
    "Leads",
    {
      // hard sync: osc2 locked to osc1, env3 sweeps osc2 pitch for a tearing timbre
      osc: [
        { unison: 2, detune: 8 },
        { level: 0.6, semi: 7, sync: true },
      ],
      filters: [{ cutoff: 2400, reso: 0.376, keytrack: 0.5, env: 2 }],
      envs: [
        { attack: 0.005, sustain: 0.85 },
        { attack: 0.01, decay: 0.3, sustain: 0.5 },
        { attack: 0.001, decay: 0.5, sustain: 0.1, release: 0.3, curve: 0.6 },
      ],
      matrix: [{ source: "env3", dest: "osc2.pitch", amount: 0.5, via: "macro3" }],
      macros: [undefined, undefined, { name: "Sync", value: 0.6, targets: [] }],
      voice: { mode: "mono", glide: 0.01 },
      output: { volume: -13 },
    },
    "The Cars, Devo: osc2 hard-synced and swept by the mod envelope",
  ),
  synth(
    "lucky-man-lead",
    "Lucky Man Lead",
    "Leads",
    {
      // fat mono saw through a ladder filter with glide and subtle vibrato
      osc: [{ drift: 0.2 }, { level: 0.5, fine: 6, drift: 0.2 }],
      filters: [{ model: "ladder", cutoff: 1800, reso: 0.237, keytrack: 0.5, env: 1.5 }],
      envs: [
        { attack: 0.015, sustain: 0.85, release: 0.3 },
        { attack: 0.01, decay: 0.3, sustain: 0.6 },
      ],
      lfos: [{ rate: 5.5, delay: 0.1 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.00417 }],
      voice: { mode: "mono", glide: 0.05 },
      output: { volume: -13 },
    },
    "Keith Emerson / ELP “Lucky Man”: fat Moog lead with glide",
  ),
  synth(
    "edm-saw-lead",
    "EDM Saw Lead",
    "Leads",
    {
      // bright detuned unison saws: the big-room lead
      osc: [{ unison: 7, detune: 28, width: 0.9 }],
      filters: [{ cutoff: 7000, reso: 0.127, keytrack: 0.3 }],
      envs: [{ attack: 0.005, decay: 0.4, sustain: 0.8, release: 0.35 }],
      output: { volume: -18 },
    },
    "the bright detuned leads of big-room EDM",
  ),
  synth(
    "talk-box-lead",
    "Talk Box Lead",
    "Leads",
    {
      // band-pass filter sweeping slowly for a vowel 'wah-wah' talking quality
      osc: [{ shape: 2 }, { level: 0.4, fine: 7 }],
      filters: [{ type: "bp", cutoff: 900, reso: 0.55, keytrack: 0.5 }],
      envs: [{ attack: 0.01, sustain: 0.9, release: 0.2 }],
      lfos: [{ shape: "sine", rate: 2.5 }],
      matrix: [{ source: "lfo1", dest: "filter1.cutoff", amount: 0.25, via: "macro7" }],
      macros: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { name: "Vowel", value: 0.6, targets: [] },
      ],
      voice: { mode: "mono", glide: 0.015 },
      output: { volume: -6 },
    },
    "Roger Troutman, Peter Frampton: formant-filtered talking lead",
  ),
  synth(
    "odyssey-lead",
    "Odyssey Lead",
    "Leads",
    {
      // ARP Odyssey: narrow pulse + saw, resonant filter, cutting mono lead
      osc: [
        { shape: 3, pw: 0.25 },
        { level: 0.5, shape: 2 },
      ],
      filters: [{ cutoff: 1400, reso: 0.55, keytrack: 0.6, env: 2 }],
      envs: [
        { attack: 0.005, sustain: 0.8, release: 0.2 },
        { attack: 0.002, decay: 0.2, sustain: 0.3 },
      ],
      voice: { mode: "mono", glide: 0.01 },
      output: { volume: -14 },
    },
    "ARP Odyssey",
  ),

  // ---- new pads ----
  synth(
    "ob-pad",
    "OB Pad",
    "Pads",
    {
      // Oberheim OB-X: warm detuned saws, slow attack, brassy and wide
      osc: [
        { unison: 2, detune: 20, drift: 0.1 },
        { level: 0.6, fine: 9, drift: 0.1 },
      ],
      filters: [{ model: "ladder", cutoff: 1200, reso: 0.315, keytrack: 0.4, env: 1.5 }],
      envs: [
        { attack: 0.12, decay: 0.6, sustain: 0.85, release: 1.5 },
        { attack: 0.2, decay: 0.8, sustain: 0.6, release: 1.2 },
      ],
      lfos: [{ rate: 5 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.00208 }],
      output: { volume: -16, spread: 0.3 },
    },
    "Oberheim OB-X",
  ),
  synth(
    "cs-80-pad",
    "CS-80 Pad",
    "Pads",
    {
      // Yamaha CS-80: very slow attack, brassy, warm vibrato (Blade Runner)
      osc: [
        { unison: 2, detune: 16, drift: 0.2 },
        { level: 0.5, octave: -1, drift: 0.2 },
      ],
      filters: [{ cutoff: 1400, reso: 0.315, keytrack: 0.5, env: 1.8 }],
      envs: [
        { attack: 0.8, decay: 0.8, sustain: 0.9, release: 2.5 },
        { attack: 0.6, decay: 1, sustain: 0.7, release: 2 },
      ],
      lfos: [{ rate: 5.5, delay: 0.5 }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.00417 }],
      output: { volume: -10, spread: 0.4 },
    },
    "Yamaha CS-80, Blade Runner",
  ),
  synth(
    "choir-pad",
    "Choir Pad",
    "Pads",
    {
      // band-pass filtered pad to suggest an 'aah' choir vowel
      osc: [
        { unison: 3, detune: 18, drift: 0.1 },
        { level: 0.5, fine: 8 },
      ],
      filters: [{ type: "bp", cutoff: 1000, reso: 0.4, keytrack: 0.4 }],
      envs: [{ attack: 0.4, decay: 1, sustain: 0.85, release: 2.2 }],
      lfos: [{ rate: 0.4 }],
      matrix: [{ source: "lfo1", dest: "filter1.cutoff", amount: 0.05 }],
      output: { volume: -5, spread: 0.3 },
    },
    "vowel-filtered choir pad",
  ),
  synth(
    "sweep-pad",
    "Sweep Pad",
    "Pads",
    {
      // a broad pad whose ladder filter slowly sweeps on an LFO
      osc: [
        { unison: 4, detune: 18, drift: 0.15 },
        { level: 0.4, fine: 6 },
      ],
      filters: [{ model: "ladder", cutoff: 800, reso: 0.237, keytrack: 0.4 }],
      envs: [{ attack: 0.3, sustain: 0.9, release: 1.8 }],
      lfos: [{ shape: "sine", rate: 0.2 }],
      matrix: [{ source: "lfo1", dest: "filter1.cutoff", amount: 0.35 }],
      output: { volume: -16, spread: 0.35 },
    },
    "a pad whose filter sweeps on a slow LFO",
  ),
  synth(
    "solina-strings",
    "Solina Strings",
    "Pads",
    {
      // ARP Omni / Solina: ensemble detune with pulse-width modulation for shimmer
      osc: [
        { shape: 2, unison: 3, detune: 20, drift: 0.08 },
        { shape: 3, pw: 0.4, level: 0.5, drift: 0.08 },
      ],
      filters: [{ cutoff: 5000, reso: 0.0912, keytrack: 0.5 }],
      envs: [{ attack: 0.3, decay: 1, sustain: 0.9, release: 1.5 }],
      lfos: [
        { shape: "sine", rate: 0.7 },
        { shape: "triangle", rate: 1.1 },
      ],
      matrix: [
        { source: "lfo1", dest: "pitch", amount: 0.00125 },
        { source: "lfo2", dest: "osc2.pw", amount: 0.6, via: "macro7" },
      ],
      macros: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { name: "Chorus", value: 0.65, targets: [] },
      ],
      output: { volume: -17, spread: 0.4 },
    },
    "ARP Omni / Solina String Ensemble",
  ),
  synth(
    "lofi-pad",
    "Lo-fi Pad",
    "Pads",
    {
      // warm, detuned, dull pad with a hint of noise: lo-fi texture
      osc: [
        { unison: 2, detune: 12, drift: 0.2 },
        { level: 0.4, fine: -8, drift: 0.2 },
      ],
      filters: [{ model: "ladder", cutoff: 900, reso: 0.159, keytrack: 0.3 }],
      envs: [{ attack: 0.25, decay: 0.8, sustain: 0.8, release: 1.8 }],
      noise: { level: 0.04 },
      output: { volume: -14, spread: 0.25 },
    },
    "warm, detuned lo-fi pad with a little noise",
  ),

  // ---- new keys ----
  synth(
    "wurli",
    "Wurli",
    "Keys",
    {
      // Wurlitzer e-piano: triangle carrier with a short FM bark giving the characteristic bite
      osc: [{ shape: 1 }, undefined, { shape: 0, level: 0, retrigger: true }],
      filters: [{ cutoff: 3500, reso: 0.159, keytrack: 0.6 }],
      envs: [
        { attack: 0.002, decay: 1.2, sustain: 0.2, release: 0.5, velocity: 0.7 },
        {},
        { attack: 0.001, decay: 0.08, sustain: 0.05, release: 0.08, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.25 }],
      fm: { route: "3>1" },
      output: { volume: -11 },
    },
    "Wurlitzer electric piano",
  ),
  synth(
    "poly-stab",
    "80s Poly Stab",
    "Keys",
    {
      // Prophet-5 style brassy stab: detuned saws with a fast filter pluck
      osc: [
        { unison: 2, detune: 14, drift: 0.1 },
        { level: 0.7, fine: 7, drift: 0.1 },
      ],
      filters: [{ model: "ladder", cutoff: 600, reso: 0.376, keytrack: 0.4, env: 3.5 }],
      envs: [
        { attack: 0.008, decay: 0.4, sustain: 0.6, release: 0.35 },
        { attack: 0.005, decay: 0.25, sustain: 0.4 },
      ],
      output: { volume: -9, spread: 0.25 },
    },
    "Sequential Prophet-5",
  ),
  synth(
    "music-box",
    "Music Box",
    "Keys",
    {
      // sine with a sine at the octave, FM-modulated for sparkle: fast decay, no sustain
      osc: [
        { shape: 0, retrigger: true },
        { shape: 0, level: 0.25, octave: 1 },
        { shape: 0, level: 0, octave: 1, retrigger: true },
      ],
      filters: [{ cutoff: 12000, reso: 0.0912, keytrack: 0 }],
      envs: [
        { attack: 0.001, decay: 1.5, sustain: 0, release: 1.2 },
        {},
        { attack: 0.001, decay: 0.5, sustain: 0.05, release: 0.5, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.1 }],
      fm: { route: "3>1" },
      output: { volume: -12 },
    },
    "FM music box bells",
  ),
  synth(
    "kalimba",
    "Kalimba",
    "Keys",
    {
      // FM with a slightly inharmonic modulator (minor third): woody, bright, short
      osc: [
        { shape: 0, retrigger: true },
        undefined,
        { shape: 0, level: 0, semi: 3, retrigger: true },
      ],
      filters: [{ cutoff: 10000, reso: 0.0912, keytrack: 0.2 }],
      envs: [
        { attack: 0.001, decay: 0.6, sustain: 0, release: 0.5 },
        {},
        { attack: 0.001, decay: 0.12, sustain: 0.05, release: 0.12, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.08 }],
      fm: { route: "3>1" },
      output: { volume: -11 },
    },
    "FM kalimba, woody and bright",
  ),

  // ---- new plucks & stabs ----
  synth(
    "future-bass-chord",
    "Future Bass Chord",
    "Plucks & stabs",
    {
      // wide detuned supersaw with filter envelope and tempo-synced LFO on the cutoff (pump feel)
      osc: [{ unison: 6, detune: 32, width: 0.9 }],
      filters: [{ model: "ladder", cutoff: 500, reso: 0.237, keytrack: 0.2, env: 4 }],
      envs: [
        { attack: 0.003, decay: 0.5, sustain: 0.5, release: 0.35 },
        { attack: 0.002, decay: 0.3, sustain: 0.2, release: 0.2 },
      ],
      lfos: [{ sync: "1/2" }],
      matrix: [{ source: "lfo1", dest: "filter1.cutoff", amount: 0.3, via: "macro7" }],
      macros: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { name: "Pump", value: 0.6, targets: [] },
      ],
      output: { volume: -6 },
    },
    "the wide stabs and filter pumps of future bass",
  ),
  synth(
    "marimba",
    "Marimba",
    "Plucks & stabs",
    {
      // FM wooden mallet: inharmonic modulator (major third) gives the characteristic hollow thud
      osc: [
        { shape: 0, retrigger: true },
        { shape: 1, level: 0.2, octave: 1, retrigger: true },
        { shape: 0, level: 0, octave: 1, semi: 4, retrigger: true },
      ],
      filters: [{ cutoff: 8000, reso: 0.0912, keytrack: 0.3 }],
      envs: [
        { attack: 0.001, decay: 0.5, sustain: 0, release: 0.4 },
        {},
        { attack: 0.001, decay: 0.1, sustain: 0.05, release: 0.1, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.12 }],
      fm: { route: "3>1" },
      output: { volume: -9 },
    },
    "wooden mallet percussion (FM)",
  ),
  synth(
    "steel-drum",
    "Steel Drum",
    "Plucks & stabs",
    {
      // FM steelpan: modulator at a minor 7th gives the bright metallic ring of the steelpan
      osc: [
        { shape: 0, retrigger: true },
        undefined,
        { shape: 0, level: 0, octave: 1, semi: -2, fine: 20, retrigger: true },
      ],
      filters: [{ cutoff: 14000, reso: 0.127, keytrack: 0.2 }],
      envs: [
        { attack: 0.001, decay: 1.2, sustain: 0, release: 1 },
        {},
        { attack: 0.001, decay: 0.18, sustain: 0.1, release: 0.15, curve: 0.7 },
      ],
      matrix: [{ source: "env3", dest: "fm", amount: 0.15 }],
      fm: { route: "3>1" },
      output: { volume: -11 },
    },
    "FM steel drum / steelpan",
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

  synth(
    "ocean-wind",
    "Ocean Wind",
    "FX",
    {
      // noise only, shaped by a band-pass filter that drifts slowly on an LFO
      osc: [{ on: false, level: 0 }],
      filters: [{ type: "bp", cutoff: 600, reso: 0.376, keytrack: 0, env: 0 }],
      envs: [{ attack: 1.5, sustain: 1, release: 3, velocity: 0 }],
      lfos: [{ shape: "sine", rate: 0.08 }],
      matrix: [{ source: "lfo1", dest: "filter1.cutoff", amount: 0.4 }],
      noise: { level: 0.8 },
      output: { volume: 4 },
    },
    "noise shaped by a slowly drifting band-pass filter",
  ),
  synth(
    "ufo",
    "UFO",
    "FX",
    {
      // ring modulation between a sine and a fifth, warbling LFO on the modulator
      osc: [{ shape: 0 }, { shape: 0, level: 0.7, semi: 7 }],
      filters: [{ cutoff: 6000, reso: 0.127, keytrack: 0 }],
      envs: [{ attack: 0.05, sustain: 1, release: 1.2 }],
      lfos: [{ shape: "sine", rate: 0.3 }],
      matrix: [{ source: "lfo1", dest: "osc2.pitch", amount: 0.15 }],
      ring: 0.8,
      voice: { mode: "mono" },
      output: { volume: -16 },
    },
    "ring modulation with a warbling LFO",
  ),

  // ---- wavetables (D258): the position moves, by envelope, LFO or macro ----
  synth(
    "wt-vowel-pad",
    "Wavetable · Vowel Pad",
    "Pads",
    {
      osc: [
        { type: "wavetable", table: "factory:vowels", position: 0.05, unison: 3, detune: 16 },
        { type: "wavetable", table: "factory:vowels", position: 0.3, octave: -1, level: 0.45 },
      ],
      filters: [{ cutoff: 6000, reso: 0.1, keytrack: 0.3 }],
      envs: [
        { attack: 0.35, decay: 0.5, sustain: 0.9, release: 1.6 },
        {},
        { attack: 2.5, decay: 2, sustain: 0.6, release: 2 },
      ],
      lfos: [{ rate: 0.15 }],
      matrix: [
        { source: "env3", dest: "osc1.position", amount: 0.7 },
        { source: "lfo1", dest: "osc2.position", amount: 0.25 },
      ],
      output: { volume: -14, spread: 0.4 },
    },
    "a choir of vowels opening as each chord holds",
  ),
  synth(
    "wt-growl-bass",
    "Wavetable · Growl Bass",
    "Bass",
    {
      osc: [
        { type: "wavetable", table: "factory:fm", position: 0.35, warp: "sync", warpAmount: 0.2 },
      ],
      sub: { level: 0.5 },
      filters: [{ model: "ladder", cutoff: 900, reso: 0.25, env: 2.5 }],
      envs: [
        { decay: 0.4, sustain: 0.8, release: 0.15 },
        { decay: 0.25, sustain: 0.2 },
      ],
      lfos: [{ sync: "1/8", shape: "triangle" }],
      matrix: [{ source: "lfo1", dest: "osc1.position", amount: 0.35 }],
      voice: { mode: "mono", glide: 0.04 },
      output: { volume: -7 },
    },
    "a dubstep-style growl: FM frames and sync, the position on the beat",
  ),
  synth(
    "wt-glass-keys",
    "Wavetable · Glass Keys",
    "Keys",
    {
      osc: [
        { type: "wavetable", table: "factory:metal", position: 0.15 },
        { type: "wavetable", table: "factory:harmonics", position: 0.25, octave: 1, level: 0.35 },
      ],
      filters: [{ cutoff: 9000, reso: 0.05, keytrack: 0.5 }],
      envs: [
        { decay: 1.4, sustain: 0.15, release: 0.9, velocity: 0.6 },
        {},
        { decay: 0.8, sustain: 0, release: 0.8 },
      ],
      matrix: [{ source: "env3", dest: "osc1.position", amount: 0.5 }],
      output: { volume: -10 },
    },
    "glassy metallic keys whose shimmer fades with each note",
  ),
  synth(
    "wt-digital-pluck",
    "Wavetable · Digital Pluck",
    "Plucks & stabs",
    {
      osc: [{ type: "wavetable", table: "factory:bitcrush", position: 0, smooth: false }],
      filters: [{ cutoff: 7000, reso: 0.1 }],
      envs: [
        { decay: 0.35, sustain: 0, release: 0.25 },
        {},
        { decay: 0.3, sustain: 0, release: 0.3 },
      ],
      matrix: [{ source: "env3", dest: "osc1.position", amount: 0.8 }],
      output: { volume: -3 },
    },
    "a crunchy video-game pluck stepping through its frames",
  ),
  synth(
    "wt-evolving-pad",
    "Wavetable · Evolving Pad",
    "Pads",
    {
      osc: [
        { type: "wavetable", table: "factory:formant", position: 0.2, unison: 4, detune: 20 },
        { type: "wavetable", table: "factory:comb", position: 0.5, level: 0.5, semi: 7 },
      ],
      filters: [{ cutoff: 4500, reso: 0.15 }],
      envs: [{ attack: 1.6, decay: 1, sustain: 0.9, release: 3 }],
      lfos: [{ rate: 0.07 }, { rate: 0.5 }, { rate: 0.11, shape: "triangle" }],
      matrix: [
        { source: "lfo1", dest: "osc1.position", amount: 0.5 },
        { source: "lfo3", dest: "osc2.position", amount: 0.4 },
      ],
      output: { volume: -8, spread: 0.5 },
    },
    "a slow-moving formant pad that never sounds the same twice",
  ),
  synth(
    "wt-choir-lead",
    "Wavetable · Choir Lead",
    "Leads",
    {
      osc: [{ type: "wavetable", table: "factory:choir", position: 0.6, unison: 3, detune: 10 }],
      filters: [{ cutoff: 5000, reso: 0.1 }],
      envs: [{ attack: 0.08, decay: 0.5, sustain: 0.85, release: 0.6 }],
      lfos: [{ rate: 5.2, delay: 0.4 }],
      matrix: [
        { source: "lfo1", dest: "pitch", amount: 0.006 },
        { source: "velocity", dest: "osc1.position", amount: 0.3 },
      ],
      voice: { mode: "legato", glide: 0.08 },
      output: { volume: -6 },
    },
    "a singing lead: “oo” when played softly, “ah” when played hard",
  ),
  synth(
    "wt-hoover",
    "Wavetable · Hoover",
    "Leads",
    {
      osc: [
        { type: "wavetable", table: "factory:pwm", position: 0.3, unison: 7, detune: 45 },
        { type: "wavetable", table: "factory:filtered-saw", position: 0.8, octave: -1, level: 0.6 },
      ],
      filters: [{ cutoff: 6000, reso: 0.1 }],
      envs: [
        { attack: 0.02, decay: 0.5, sustain: 0.9, release: 0.4 },
        {},
        { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
      ],
      lfos: [{ rate: 0.6 }],
      matrix: [
        { source: "env3", dest: "pitch", amount: -0.08 },
        { source: "lfo1", dest: "osc1.position", amount: 0.3 },
      ],
      voice: { mode: "mono", glide: 0.15 },
      output: { volume: -11 },
    },
    "the rave hoover: a wide stack of pulses that swoops into each note",
  ),
  synth(
    "wt-comb-bass",
    "Wavetable · Comb Bass",
    "Bass",
    {
      osc: [{ type: "wavetable", table: "factory:comb", position: 0.15 }],
      sub: { level: 0.4 },
      filters: [{ cutoff: 2500, reso: 0.1 }],
      envs: [{ decay: 0.5, sustain: 0.6, release: 0.15 }, {}, { decay: 0.45, sustain: 0.1 }],
      matrix: [{ source: "env3", dest: "osc1.position", amount: 0.6 }],
      voice: { mode: "mono", glide: 0.03 },
      output: { volume: -9 },
    },
    "a bass whose notches sweep with every note",
  ),
  synth(
    "wt-organ",
    "Wavetable · Organ",
    "Keys",
    {
      osc: [{ type: "wavetable", table: "factory:organ", position: 3 / 7, smooth: false }],
      filters: [{ cutoff: 9000, reso: 0, keytrack: 0.3 }],
      envs: [{ attack: 0.005, decay: 0.1, sustain: 1, release: 0.08 }],
      lfos: [{ rate: 6.5 }],
      matrix: [{ source: "lfo1", dest: "amp", amount: 0.08 }],
      output: { volume: -13 },
    },
    "drawbar registrations; Character steps through them",
  ),
  synth(
    "wt-riser",
    "Wavetable · Riser",
    "FX",
    {
      osc: [{ type: "wavetable", table: "factory:grit", position: 0, unison: 5, detune: 30 }],
      filters: [{ cutoff: 8000, reso: 0.2 }],
      envs: [
        { attack: 0.8, decay: 1, sustain: 1, release: 1.5 },
        {},
        { attack: 6, decay: 1, sustain: 1, release: 1 },
      ],
      matrix: [
        { source: "env3", dest: "osc1.position", amount: 1 },
        { source: "env3", dest: "pitch", amount: 0.5 },
      ],
      output: { volume: -12 },
    },
    "noise frozen into cycles, brightening and rising as you hold it",
  ),

  // ---- physical models (D258): exciter → resonator → body ----
  synth(
    "pm-nylon-guitar",
    "Physical · Nylon Guitar",
    "Plucks & stabs",
    phys(
      {
        exciter: { type: "pluck", hardness: 0.4, position: 0.18, noise: 0.15 },
        resonator: { model: "string", decay: 3, damping: 0.6, pickup: 0.2, release: 0.6 },
        body: { type: "guitar", mix: 0.55 },
      },
      {},
      -5,
    ),
    "a classical guitar: a soft thumb on nylon, a wooden body",
  ),
  synth(
    "pm-steel-harp",
    "Physical · Steel Harp",
    "Plucks & stabs",
    phys(
      {
        exciter: { type: "pluck", hardness: 0.65, position: 0.3, noise: 0.1 },
        resonator: {
          model: "string",
          decay: 6,
          damping: 0.25,
          pickup: 0.45,
          width: 0.5,
          release: 0.2,
        },
      },
      {},
      -16,
    ),
    "bright steel strings that ring on",
  ),
  synth(
    "pm-kalimba",
    "Physical · Kalimba",
    "Plucks & stabs",
    phys(
      {
        exciter: { type: "pluck", hardness: 0.6, position: 0.12, noise: 0.05 },
        resonator: { model: "bar", structure: 1, decay: 1.6, damping: 0.6, modes: 8 },
        body: { type: "box", mix: 0.35, size: 0.7 },
      },
      {},
      1,
    ),
    "a thumb piano: metal tines on a wooden box",
  ),
  synth(
    "pm-marimba",
    "Physical · Marimba",
    "Keys",
    phys(
      {
        exciter: { type: "strike", hardness: 0.4, position: 0.25, noise: 0.05 },
        resonator: { model: "bar", structure: 0, decay: 1.2, damping: 0.55, modes: 8 },
        body: { type: "tube", mix: 0.6 },
      },
      {},
      -12,
    ),
    "rosewood bars, felt mallets, tuned tubes under them",
  ),
  synth(
    "pm-vibraphone",
    "Physical · Vibraphone",
    "Keys",
    phys(
      {
        exciter: { type: "strike", hardness: 0.55, position: 0.25, noise: 0.05 },
        resonator: { model: "bar", structure: 0, decay: 4, damping: 0.15, modes: 8, release: 0.7 },
        body: { type: "tube", mix: 0.4 },
      },
      {
        lfos: [{ rate: 5 }],
        matrix: [{ source: "lfo1", dest: "amp", amount: 0.25 }],
      },
      -18,
    ),
    "metal bars with the motor's tremolo",
  ),
  synth(
    "pm-tubular-bell",
    "Physical · Tubular Bell",
    "Keys",
    phys(
      {
        exciter: { type: "strike", hardness: 0.85, position: 0.1, noise: 0.1 },
        resonator: { model: "bell", structure: 1, decay: 6, damping: 0.3, modes: 16, release: 0.1 },
      },
      {},
      -17,
    ),
    "an orchestra's chimes, struck with a hammer",
  ),
  synth(
    "pm-glass-bowl",
    "Physical · Glass Bowl",
    "Pads",
    phys(
      {
        exciter: { type: "bow", pressure: 0.5, hardness: 0.3, position: 0.3 },
        resonator: { model: "glass", structure: 1, decay: 8, damping: 0.2, modes: 8, width: 0.6 },
      },
      { envs: [{ attack: 0.3, sustain: 1, release: 3, velocity: 0 }] },
      -15,
    ),
    "a singing bowl rubbed with a stick",
  ),
  synth(
    "pm-steel-drum",
    "Physical · Steel Drum",
    "Plucks & stabs",
    phys(
      {
        exciter: { type: "strike", hardness: 0.5, position: 0.3, noise: 0.05 },
        resonator: { model: "plate", structure: 0.25, decay: 1.5, damping: 0.4, modes: 16 },
      },
      {},
      -12,
    ),
    "a Caribbean steel pan",
  ),
  synth(
    "pm-bowed-cello",
    "Physical · Bowed Cello",
    "Pads",
    phys(
      {
        exciter: { type: "bow", pressure: 0.55, hardness: 0.4, position: 0.12, noise: 0.2 },
        resonator: { model: "string", decay: 3, damping: 0.5, pickup: 0.15, release: 0.5 },
        body: { type: "cello", mix: 0.6 },
      },
      {
        envs: [{ attack: 0.12, sustain: 1, release: 0.6, velocity: 0 }],
        lfos: [{ rate: 5, delay: 0.5 }],
        matrix: [{ source: "lfo1", dest: "pitch", amount: 0.004 }],
      },
      -8,
    ),
    "a bow on a string, a wooden body, vibrato as the note settles",
  ),
  synth(
    "pm-breathy-flute",
    "Physical · Breathy Flute",
    "Leads",
    phys(
      {
        exciter: { type: "blow", pressure: 0.5, noise: 0.45, hardness: 0.6 },
        resonator: { model: "tube", end: "open", decay: 2, damping: 0.4 },
      },
      {
        envs: [{ attack: 0.06, sustain: 1, release: 0.25, velocity: 0 }],
        lfos: [{ rate: 5.5, delay: 0.3 }],
        matrix: [{ source: "lfo1", dest: "pitch", amount: 0.004 }],
        voice: { mode: "legato", glide: 0.05 },
      },
      -15,
    ),
    "a jet of breath across an open tube",
  ),
  synth(
    "pm-clarinet",
    "Physical · Clarinet",
    "Leads",
    phys(
      {
        exciter: { type: "blow", pressure: 0.6, noise: 0.1, hardness: 0.5 },
        resonator: { model: "tube", end: "closed", decay: 2, damping: 0.45 },
      },
      {
        envs: [{ attack: 0.04, sustain: 1, release: 0.2, velocity: 0 }],
        voice: { mode: "legato", glide: 0.04 },
      },
      -10,
    ),
    "a reed on a closed tube: hollow, woody, odd harmonics",
  ),
  synth(
    "pm-resonant-saw",
    "Physical · Resonant Saw",
    "Leads",
    phys(
      {
        exciter: { type: "oscillators", level: 0.6 },
        resonator: { model: "string", decay: 4, damping: 0.3, pickup: 0.3, width: 0.5 },
      },
      {
        osc: [{ shape: 2 }],
        envs: [{ attack: 0.01, sustain: 1, release: 0.5 }],
      },
      -28,
    ),
    "a saw played into a string: a synth that rings like an instrument",
  ),

  // ---- physical drums, for Hits (D258) ----
  synth(
    "pm-tom",
    "Physical · Tom",
    "Percussion",
    phys(
      {
        exciter: { type: "strike", hardness: 0.5, position: 0.3, noise: 0.2 },
        resonator: { model: "membrane", structure: 0.3, decay: 0.6, damping: 0.5, modes: 16 },
      },
      {
        envs: [{}, {}, { attack: 0.001, decay: 0.15, sustain: 0, release: 0.15 }],
        matrix: [{ source: "env3", dest: "pitch", amount: 0.08 }],
      },
      -8,
    ),
    "a drum head struck with a stick, its pitch dropping",
  ),
  synth(
    "pm-conga",
    "Physical · Conga",
    "Percussion",
    phys(
      {
        exciter: { type: "strike", hardness: 0.7, position: 0.4, noise: 0.15 },
        resonator: { model: "membrane", structure: 0.6, decay: 0.4, damping: 0.45, modes: 16 },
        body: { type: "box", mix: 0.3, size: 0.8 },
      },
      {},
      -11,
    ),
    "a hand on a skin over a wooden shell",
  ),
  synth(
    "pm-woodblock",
    "Physical · Woodblock",
    "Percussion",
    phys(
      {
        exciter: { type: "strike", hardness: 0.9, position: 0.2 },
        resonator: { model: "bar", structure: 1, decay: 0.3, damping: 0.8, modes: 8 },
      },
      {},
      -7,
    ),
    "a hollow block of wood",
  ),
  synth(
    "pm-cowbell",
    "Physical · Cowbell",
    "Percussion",
    phys(
      {
        exciter: { type: "strike", hardness: 0.8, position: 0.2, noise: 0.1 },
        resonator: { model: "plate", structure: 0.2, decay: 0.4, damping: 0.2, modes: 8 },
      },
      {},
      -10,
    ),
    "a cowbell, struck with a stick",
  ),
  synth(
    "pm-gong",
    "Physical · Gong",
    "Percussion",
    phys(
      {
        exciter: { type: "strike", hardness: 0.3, position: 0.4, noise: 0.2 },
        resonator: {
          model: "plate",
          structure: 0.8,
          decay: 8,
          damping: 0.1,
          modes: 32,
          release: 0,
        },
      },
      {},
      -15,
    ),
    "a large gong, a soft beater",
  ),
];

export const factorySynth = (id: string) => FACTORY_SYNTHS.find((s) => s.id === id);
