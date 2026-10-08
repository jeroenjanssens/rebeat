/**
 * Factory synths (D80): patches in the style of well-known songs and synths. Ids are stable:
 * projects store them (the first ten were the original presets).
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

const synth = (
  id: string,
  name: string,
  group: SynthGroup,
  spec: PatchSpec,
  note?: string,
): FactorySynth => ({ id, name, group, note, patch: makePatch(spec) });

export const FACTORY_SYNTHS: FactorySynth[] = [
  // ---- the original presets ----
  synth("warm-pad", "Poly · Warm Pad", "Pads", {
    osc1: { wave: "sawtooth", unison: 3, spread: 22 },
    filter: { cutoff: 2600, reso: 0.8, keytrack: 0.4 },
    amp: { attack: 0.3, decay: 0.4, sustain: 0.8, release: 1.2 },
    volume: -18,
  }),
  synth("keys", "Poly · Keys", "Keys", {
    osc1: { wave: "triangle" },
    osc2: { wave: "sine", octave: 1, level: 0.3 },
    filter: { cutoff: 5000 },
    amp: { attack: 0.005, decay: 0.6, sustain: 0.25, release: 0.5 },
    volume: -12,
  }),
  synth("pluck", "Poly · Pluck", "Plucks & stabs", {
    osc1: { wave: "square" },
    filter: { cutoff: 600, reso: 1.5, env: 3.5 },
    filterEnv: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.2 },
    amp: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 },
    volume: -14,
  }),
  synth("init", "Poly · Init", "Keys", { volume: -16 }),
  synth(
    "acid",
    "Mono · Acid Bass",
    "Bass",
    {
      mono: true,
      osc1: { wave: "sawtooth" },
      filter: { cutoff: 140, reso: 9, slope: 24, keytrack: 0.2, env: 3.6 },
      filterEnv: { attack: 0.003, decay: 0.22, sustain: 0.1, release: 0.15 },
      amp: { attack: 0.003, decay: 0.3, sustain: 0.6, release: 0.08 },
      drive: 0.25,
      volume: -12,
    },
    "the Roland TB-303",
  ),
  synth("sub", "Mono · Sub Bass", "Bass", {
    mono: true,
    osc1: { wave: "sine" },
    filter: { cutoff: 900, keytrack: 0 },
    amp: { attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.2 },
    volume: -8,
  }),
  synth("lead", "Mono · Square Lead", "Leads", {
    mono: true,
    glide: 0.02,
    osc1: { wave: "square" },
    filter: { cutoff: 900, reso: 2, env: 2.5 },
    filterEnv: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 },
    amp: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.25 },
    lfo: { target: "pitch", rate: 5.5, depth: 0.12 },
    volume: -18,
  }),
  synth("fm-epiano", "FM · E-Piano", "Keys", {
    osc1: { wave: "sine" },
    fm: { ratio: 1, index: 2.2, decay: 0.6 },
    osc2: { wave: "sine", octave: 2, level: 0.08 },
    filter: { cutoff: 9000 },
    amp: { attack: 0.002, decay: 1.6, sustain: 0.15, release: 0.6 },
    velocity: 0.8,
    volume: -10,
  }),
  synth("fm-bell", "FM · Bell", "Keys", {
    osc1: { wave: "sine" },
    fm: { ratio: 3.5, index: 5, decay: 1.4 },
    filter: { cutoff: 12000, keytrack: 0 },
    amp: { attack: 0.001, decay: 2.5, sustain: 0, release: 2.2 },
    volume: -14,
  }),
  synth("am-organ", "AM · Organ", "Keys", {
    osc1: { wave: "sine", level: 0.8 },
    osc2: { wave: "sine", octave: 1, level: 0.5 },
    sub: 0.5,
    filter: { cutoff: 9000, keytrack: 0 },
    amp: { attack: 0.008, decay: 0.1, sustain: 1, release: 0.12 },
    lfo: { target: "amp", rate: 6.5, depth: 0.15 },
    velocity: 0,
    volume: -16,
  }),
];

export const factorySynth = (id: string) => FACTORY_SYNTHS.find((s) => s.id === id);
