/**
 * The .rbsynth file format (§0.6e G): one synth to share, with its name, where its macros are,
 * and its effects. (Importing and exporting: rbsynth.ts.)
 */
import { upgradePatch, type SynthPatch } from "../model/synth";
import type { Effect, Track } from "../model/types";
import { macroKey, trackPatch } from "./synthTrack";

export interface SynthFile {
  format: "rebeat-synth";
  version: 1;
  name: string;
  patch: SynthPatch;
  /** Where the macros are (0..1 each). */
  macros: number[];
  effects: Effect[];
}

export const SYNTH_EXT = ".rbsynth";

/** A track's synth as a file. */
export function synthFile(track: Track, name: string): SynthFile {
  const patch = trackPatch(track);
  return {
    format: "rebeat-synth",
    version: 1,
    name,
    patch,
    macros: patch.macros.map((m, i) => track.params[macroKey(i)] ?? m.value),
    effects: JSON.parse(JSON.stringify(track.effects)) as Effect[],
  };
}

/** Read a file's text; throws with a readable message when it isn't one. */
export function parseSynthFile(text: string): SynthFile {
  let data: Partial<SynthFile>;
  try {
    data = JSON.parse(text) as Partial<SynthFile>;
  } catch {
    throw new Error("not a synth file");
  }
  if (data?.format !== "rebeat-synth" || !data.patch) throw new Error("not a synth file");
  if ((data.version ?? 1) > 1) throw new Error("made by a newer version of Rebeat");
  const patch = upgradePatch(data.patch);
  return {
    format: "rebeat-synth",
    version: 1,
    name: String(data.name || "Synth"),
    patch,
    macros: patch.macros.map((m, i) => {
      const v = Number(data.macros?.[i]);
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : m.value;
    }),
    effects: Array.isArray(data.effects) ? data.effects : [],
  };
}
