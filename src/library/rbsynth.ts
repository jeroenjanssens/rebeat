/**
 * .rbsynth files (§0.6e G): one synth to share, with its macros (where they are), name and effects.
 * Importing one adds it to Your sounds; the editor's Import also puts it on the track.
 */
import { uid } from "../model/id";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import { prefixed } from "../model/project";
import type { Track } from "../model/types";
import { db, type InstrumentRecord } from "../storage/db";
import { macroKey, trackPatch } from "./synthTrack";
import { tablesOf } from "../engine/synth/tables";
import { putWavetable, wavetableData } from "./wavetables";

import { SYNTH_EXT, parseSynthFile, synthFile } from "./synthFile";

export { SYNTH_EXT };
import { loadUserInstruments, userEntry } from "./userInstruments";
import type { CatalogInstrument } from "./instruments";

/** Bytes as base64 and back (wavetables in files). */
const toBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const fileName = (name: string) =>
  `${name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Synth"}${SYNTH_EXT}`;

export async function exportSynth(track: Track, name: string) {
  const file = synthFile(track, name);
  // your own tables go along (D246)
  const tables = [];
  for (const id of tablesOf(trackPatch(track)).filter((x) => x.startsWith("user:"))) {
    const d = await wavetableData(id);
    if (d) tables.push({ id, name: d.record.name, data: toBase64(d.bytes) });
  }
  if (tables.length) file.tables = tables;
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  // (loaded here: the rest of this module also runs in tests, without a window)
  const { platform } = await import("../platform");
  await platform.files.save(fileName(name), blob);
}

/** Add a synth file to Your sounds. */
export async function importSynth(file: File): Promise<CatalogInstrument> {
  const s = parseSynthFile(await file.text());
  for (const t of s.tables ?? []) await putWavetable(t.id, t.name, fromBase64(t.data));
  const rec: InstrumentRecord = {
    id: uid("ins"),
    name: s.name,
    version: 2,
    createdAt: Date.now(),
    sound: {
      instrument: { source: "synth", preset: "init", patch: s.patch, name: s.name },
      params: {
        ...prefixed("sound", defaultParams(SOUND_PARAMS.voice)),
        ...Object.fromEntries(s.macros.map((v, i) => [macroKey(i), v])),
      },
      effects: s.effects,
    },
  };
  await db.instruments.put(rec);
  await loadUserInstruments();
  return userEntry(rec);
}
