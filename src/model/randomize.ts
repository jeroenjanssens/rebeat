/**
 * Randomizing a synth patch (§0.6e G): every knob of the sections you didn't lock moves a random
 * distance (up to `amount` of its whole range) from where you hear it now. Macros keep their
 * place (setThroughMacros). Loudness and tuning stay put: the output level, voices, bend and tune.
 */
import { SECTIONS, fromKnob, getPath, toKnob } from "./patchParams";
import {
  LFO_SHAPES,
  applyMacros,
  setThroughMacros,
  withMacroValues,
  type SynthPatch,
} from "./synth";

/** The groups you can lock, in the editor's order (the Advanced sections). */
export const RANDOM_GROUPS = [
  { id: "osc", label: "Oscillators", sections: ["osc0", "osc1", "osc2", "extra"] },
  { id: "filters", label: "Filters", sections: ["filter0", "filter1"] },
  { id: "envs", label: "Envelopes", sections: ["env0", "env1", "env2"] },
  { id: "lfos", label: "LFOs", sections: ["lfo0", "lfo1", "lfo2"] },
  { id: "matrix", label: "Matrix", sections: [] },
] as const;

const KEEP = new Set(["output.volume", "voice.voices", "voice.bend", "voice.tune"]);

/** A randomized copy of `patch`; `values` are where the track's macros are. */
export function randomizePatch(
  patch: SynthPatch,
  amount: number,
  locked: string[],
  values: (number | undefined)[] = [],
  rand: () => number = Math.random,
): SynthPatch {
  const p = JSON.parse(JSON.stringify(patch)) as SynthPatch;
  const heard = applyMacros(withMacroValues(patch, values));
  const open = RANDOM_GROUPS.filter((g) => !locked.includes(g.id));
  const sections = new Set<string>(open.flatMap((g) => g.sections));
  const step = () => (rand() * 2 - 1) * amount;
  for (const s of SECTIONS) {
    if (!sections.has(s.id)) continue;
    for (const d of s.params) {
      if (KEEP.has(d.path)) continue;
      const k = Math.min(1, Math.max(0, toKnob(d, getPath(heard, d.path)) + step()));
      setThroughMacros(p, d.path, fromKnob(d, k), d.min, d.max, values);
    }
  }
  // bigger throws also change the LFO shapes
  if (sections.has("lfo0") && amount >= 0.5)
    for (const l of p.lfos)
      if (rand() < amount * 0.5) l.shape = LFO_SHAPES[Math.floor(rand() * LFO_SHAPES.length)];
  if (open.some((g) => g.id === "matrix"))
    for (const slot of p.matrix)
      if (slot.source && slot.dest)
        slot.amount = Math.min(1, Math.max(-1, slot.amount + step() * 0.5));
  return p;
}
