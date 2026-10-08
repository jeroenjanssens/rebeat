/**
 * .rbsynth files (§0.6e G): one synth to share, with its macros (where they are), name and effects.
 * Importing one adds it to Your instruments; the editor's Import also puts it on the track.
 */
import { uid } from "../model/id";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import { prefixed } from "../model/project";
import type { Track } from "../model/types";
import { db, type InstrumentRecord } from "../storage/db";
import { macroKey } from "./synthTrack";
import { SYNTH_EXT, parseSynthFile, synthFile } from "./synthFile";

export { SYNTH_EXT };
import { loadUserInstruments, userEntry } from "./userInstruments";
import type { CatalogInstrument } from "./instruments";

const fileName = (name: string) =>
  `${name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Synth"}${SYNTH_EXT}`;

export async function exportSynth(track: Track, name: string) {
  const blob = new Blob([JSON.stringify(synthFile(track, name), null, 2)], {
    type: "application/json",
  });
  // (loaded here: the rest of this module also runs in tests, without a window)
  const { platform } = await import("../platform");
  await platform.files.save(fileName(name), blob);
}

/** Add a synth file to Your instruments. */
export async function importSynth(file: File): Promise<CatalogInstrument> {
  const s = parseSynthFile(await file.text());
  const rec: InstrumentRecord = {
    id: uid("ins"),
    name: s.name,
    createdAt: Date.now(),
    sound: {
      instrument: { source: "synth", preset: "init", patch: s.patch, name: s.name },
      params: {
        ...prefixed("sound", defaultParams(SOUND_PARAMS.instrument)),
        ...Object.fromEntries(s.macros.map((v, i) => [macroKey(i), v])),
      },
      effects: s.effects,
    },
  };
  await db.instruments.put(rec);
  await loadUserInstruments();
  return userEntry(rec);
}
