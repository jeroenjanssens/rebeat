/**
 * Make a detached Notes track for a library sound (a catalog instrument or a sample), so the
 * Keys target can play it through a live voice without being part of the project (D126).
 *
 * Extracted from libraryEdit.ts: trackOf so both library-edit and keys can share the logic.
 */
import { makeTrack, prefixed } from "../model/project";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import type { Sound, Track } from "../model/types";
import type { CatalogInstrument } from "./instruments";
import { convertSynthKnobs } from "./synthTrack";
import { useLibrary } from "./library";

/**
 * A detached Notes track playing a catalog instrument. Its params start at the instrument's
 * saved values (the same knobs it has in the library).
 */
export function trackForInstrument(c: CatalogInstrument): Track {
  const sound: Sound = JSON.parse(JSON.stringify(c.source));
  const t = makeTrack("notes", c.low ? "bass" : "keys", c.name, c.name, [], sound);
  // clear defaults so the instrument's own params win
  for (const k of Object.keys(t.params)) if (k.startsWith("sound.")) delete t.params[k];
  Object.assign(t.params, prefixed("sound", defaultParams(SOUND_PARAMS.voice)), c.params ?? {});
  t.effects = JSON.parse(JSON.stringify(c.effects ?? []));
  convertSynthKnobs(t);
  return t;
}

/**
 * A detached Notes track playing a sample. Root note: the sample's detected key (C octave 4)
 * or C4 (60). The sound plays chromatically from there.
 */
export function trackForSample(sampleId: string, name: string): Track {
  // detect key from library metadata if available
  const rec = useLibrary.getState().samples.find((s) => s.id === sampleId);
  const rootNote = sampleKeyToMidi(rec?.key) ?? 60;
  const sound: Sound = { source: "sample", sampleId, rootNote };
  const t = makeTrack("notes", "keys", name, name, [], sound);
  for (const k of Object.keys(t.params)) if (k.startsWith("sound.")) delete t.params[k];
  Object.assign(t.params, prefixed("sound", defaultParams(SOUND_PARAMS.voice)));
  return t;
}

/** Convert a key string like "C", "D#", "Bb" to a MIDI note at octave 4. */
function sampleKeyToMidi(key: string | undefined): number | undefined {
  if (!key) return undefined;
  const PC: Record<string, number> = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };
  const pc = PC[key.replace(/m$/, "")];
  return pc !== undefined ? 60 + pc : undefined;
}
