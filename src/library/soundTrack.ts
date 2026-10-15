/**
 * Make a detached Notes track for a library sound (a catalog instrument or a sample), so the
 * Keys target can play it through a live voice without being part of the project (D126).
 *
 * Extracted from libraryEdit.ts: trackOf so both library-edit and keys can share the logic.
 */
import { makeTrack, prefixed } from "../model/project";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import { clone } from "../model/synth";
import type { Sound, Track } from "../model/types";
import type { CatalogInstrument } from "./instruments";
import { convertSynthKnobs } from "./synthTrack";
import { detectRootNote } from "./pitch";

/**
 * A detached Notes track playing a catalog instrument. Its params start at the instrument's
 * saved values (the same knobs it has in the library).
 */
export function trackForInstrument(c: CatalogInstrument): Track {
  const sound: Sound = clone(c.source);
  const t = makeTrack("notes", c.low ? "bass" : "keys", c.name, c.name, [], sound);
  // clear defaults so the instrument's own params win
  for (const k of Object.keys(t.params)) if (k.startsWith("sound.")) delete t.params[k];
  Object.assign(t.params, prefixed("sound", defaultParams(SOUND_PARAMS.voice)), c.params ?? {});
  t.effects = clone(c.effects ?? []);
  convertSynthKnobs(t);
  return t;
}

/**
 * A detached Notes track playing a sample (D133). Its root (the key that plays it as it is) is
 * the sample's detected pitch, else C4 (60); higher keys play it higher, lower keys lower.
 */
export function trackForSample(sampleId: string, name: string, rootNote = 60): Track {
  const sound: Sound = { source: "sample", sampleId, rootNote };
  const t = makeTrack("notes", "keys", name, name, [], sound);
  for (const k of Object.keys(t.params)) if (k.startsWith("sound.")) delete t.params[k];
  Object.assign(t.params, prefixed("sound", defaultParams(SOUND_PARAMS.voice)));
  return t;
}

/** The key a sample plays as it is on: its detected pitch, or C4. */
export function sampleRoot(buffer: AudioBuffer | null | undefined): number {
  return (buffer && detectRootNote(buffer)) ?? 60;
}
