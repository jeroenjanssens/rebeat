/**
 * Your instruments (D81): synths you shaped and sounds you saved, with their SOUND knobs and
 * effects, so any project can use them. They live in the library database; tracks keep a full
 * copy of the sound, so projects stay self-contained.
 */
import { create } from "zustand";
import { onPatchEdit } from "./synthTrack";
import { factorySynth } from "./synths";
import { useStore } from "../state/store";
import { defaultInstrument } from "../engine/instruments";
import { uid } from "../model/id";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import { prefixed } from "../model/project";
import type { InstrumentSource, Track } from "../model/types";
import { db, type InstrumentRecord } from "../storage/db";
import { COLLECTIONS, CATALOG, type CatalogInstrument } from "./instruments";
import { sha256 } from "./library";
import { zonesFor } from "./sources";

export const useUserInstruments = create<{ list: InstrumentRecord[] }>()(() => ({ list: [] }));

/** "Reese Bass copy", or "Reese Bass copy 2" when that's taken. */
function copyName(base: string) {
  const taken = new Set(useUserInstruments.getState().list.map((r) => r.name));
  const name = `${base} copy`;
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

/** A track's sound as stored in Your instruments. */
function soundOf(track: Track, name: string): InstrumentRecord["sound"] {
  const params = Object.fromEntries(
    Object.entries(track.params).filter(([k]) => k.startsWith("sound.")),
  );
  const { from: _from, ...instrument } = JSON.parse(
    JSON.stringify(track.instrument ?? defaultInstrument(track)),
  ) as InstrumentSource;
  return {
    instrument: { ...instrument, name },
    params,
    effects: JSON.parse(JSON.stringify(track.effects)),
  };
}

const saving = new Map<string, ReturnType<typeof setTimeout>>();

/** Store the track's sound in its copy (after the edit is committed; edits in a row: once). */
function saveCopySoon(id: string, trackId: string, delay: number, copyOf?: string) {
  clearTimeout(saving.get(id));
  saving.set(
    id,
    setTimeout(async () => {
      saving.delete(id);
      const track = useStore.getState().project.tracks.find((t) => t.id === trackId);
      if (!track?.instrument || track.instrument.from !== `user:${id}`) return;
      const old = await db.instruments.get(id);
      const name = track.instrument.name ?? old?.name ?? "Synth";
      await db.instruments.put({
        id,
        name,
        createdAt: old?.createdAt ?? Date.now(),
        sound: soundOf(track, name),
        copyOf: old?.copyOf ?? copyOf,
      });
      await loadUserInstruments();
    }, delay),
  );
}

// factory synths never change (D90): the first edit makes the track's sound a copy of its own
onPatchEdit((t, event) => {
  const src = t.instrument!;
  if (event === "fork") {
    const factory = factorySynth(src.preset);
    const id = uid("ins");
    const name = copyName(factory?.name ?? "Synth");
    src.name = name;
    src.from = `user:${id}`;
    t.source = name;
    useUserInstruments.setState((s) => ({
      list: [
        ...s.list,
        { id, name, createdAt: Date.now(), sound: soundOf(t, name), copyOf: src.preset },
      ],
    }));
    saveCopySoon(id, t.id, 0, src.preset);
    return;
  }
  // later edits keep the copy up to date (only copies made this way, not instruments you saved)
  const id = src.from?.startsWith("user:") ? src.from.slice(5) : null;
  const rec = id && useUserInstruments.getState().list.find((r) => r.id === id);
  if (rec && rec.copyOf) saveCopySoon(rec.id, t.id, 600);
});

export async function loadUserInstruments() {
  const list = await db.instruments.orderBy("createdAt").toArray();
  useUserInstruments.setState({ list });
}

/** A saved instrument as a catalog entry. */
export function userEntry(r: InstrumentRecord): CatalogInstrument {
  const src = r.sound.instrument;
  return {
    id: `user:${r.id}`,
    name: r.name,
    family: "Your instruments",
    group:
      src.source === "synth"
        ? "Synths"
        : src.source === "sf2"
          ? "SoundFonts"
          : src.source === "sampler"
            ? "Samplers"
            : "Instruments",
    source: { ...src, name: r.name, from: `user:${r.id}` },
    streamed: src.source === "smplr",
    collection: COLLECTIONS.user,
    params: r.sound.params,
    effects: r.sound.effects,
  };
}

/** Every instrument: built-in, streamed and yours. */
export function allInstruments(): CatalogInstrument[] {
  return [...CATALOG, ...useUserInstruments.getState().list.map(userEntry)];
}

export const findInstrument = (id: string) => allInstruments().find((c) => c.id === id);

/** Save a track's sound (instrument, SOUND knobs, effects) as one of your instruments. */
export async function saveInstrument(track: Track, name: string): Promise<CatalogInstrument> {
  if (track.kind !== "instrument") throw new Error("Only instrument tracks have a sound to save");
  const params = Object.fromEntries(
    Object.entries(track.params).filter(([k]) => k.startsWith("sound.")),
  );
  const { from: _from, ...instrument } = structuredClone(
    track.instrument ?? defaultInstrument(track),
  );
  const rec: InstrumentRecord = {
    id: uid("ins"),
    name,
    createdAt: Date.now(),
    sound: { instrument: { ...instrument, name }, params, effects: structuredClone(track.effects) },
  };
  await db.instruments.put(rec);
  await loadUserInstruments();
  return userEntry(rec);
}

export async function renameInstrument(id: string, name: string) {
  const rec = await db.instruments.get(id);
  if (!rec) return;
  await db.instruments.put({
    ...rec,
    name,
    sound: { ...rec.sound, instrument: { ...rec.sound.instrument, name } },
  });
  await loadUserInstruments();
}

export async function deleteInstrument(id: string) {
  await db.instruments.delete(id);
  await loadUserInstruments();
}

// ---------- your own multi-sample instruments and SoundFonts (D82) ----------

const record = (name: string, instrument: InstrumentSource): InstrumentRecord => ({
  id: uid("ins"),
  name,
  createdAt: Date.now(),
  sound: {
    instrument: { ...instrument, name },
    params: prefixed("sound", defaultParams(SOUND_PARAMS.instrument)),
    effects: [],
  },
});

/** A SoundFont becomes one of your instruments per instrument inside it. Returns how many. */
export async function importSoundfont(file: File): Promise<number> {
  const data = new Uint8Array(await file.arrayBuffer());
  const { SoundFont2 } = await import("soundfont2");
  const names = [...new Set(new SoundFont2(data).instruments.map((i) => i.header.name))].filter(
    (n) => n && n !== "EOI",
  );
  if (!names.length) throw new Error(`${file.name} has no instruments`);
  const id = `sf2:${await sha256(data.buffer as ArrayBuffer)}`;
  if (!(await db.blobs.get(id))) await db.blobs.put({ id, blob: new Blob([data]) });
  const base = file.name.replace(/\.sf2$/i, "");
  await db.instruments.bulkPut(
    names.map((n) =>
      record(names.length > 1 ? `${base} · ${n}` : base, {
        source: "sf2",
        preset: n,
        sampleId: id,
      }),
    ),
  );
  await loadUserInstruments();
  return names.length;
}

/** A multi-sample instrument from samples (each at the note in its name). */
export async function makeMultiSample(
  name: string,
  samples: { id: string; name: string; note?: number }[],
): Promise<CatalogInstrument> {
  if (!samples.length) throw new Error("No samples");
  // notes given (a pitched strudel.json), or read from the names
  const zones = samples.every((s) => s.note !== undefined)
    ? samples.map((s) => ({ note: s.note!, sampleId: s.id }))
    : zonesFor(samples.map((s) => s.name)).map((z) => ({
        note: z.note,
        sampleId: samples[z.index].id,
      }));
  const rec = record(name, { source: "sampler", preset: "sampler", zones });
  await db.instruments.put(rec);
  await loadUserInstruments();
  return userEntry(rec);
}
