/**
 * Your sounds (D81, D95): synths you shaped and sounds you saved (samples too), with their SOUND
 * knobs and effects, so any project can use them. They live in the library database; tracks keep a full
 * copy of the sound, so projects stay self-contained.
 */
import { create } from "zustand";
import { detachedTracks, onPatchEdit } from "./synthTrack";
import { factorySynth } from "./synths";
import { useStore } from "../state/store";
import { uid } from "../model/id";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import { prefixed } from "../model/project";
import type { Sound, Track } from "../model/types";
import { soundFromV6 } from "../model/schema";
import { voiceSound } from "./synthTrack";
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

/** What a track plays, to save: its sound (a Notes track without one plays the default synth). */
const trackSound = (track: Track): Sound | undefined =>
  track.sound ?? (track.mode === "notes" ? voiceSound(track) : undefined);

/** A track's sound as stored in Your sounds. */
function soundOf(track: Track, name: string): InstrumentRecord["sound"] {
  const params = Object.fromEntries(
    Object.entries(track.params).filter(([k]) => k.startsWith("sound.")),
  );
  const { from: _from, ...instrument } = JSON.parse(JSON.stringify(trackSound(track))) as Sound;
  return {
    instrument: { ...instrument, name },
    params,
    effects: JSON.parse(JSON.stringify(track.effects)),
  };
}

const saving = new Map<string, ReturnType<typeof setTimeout>>();

/** Store a track's sound in Your sounds entry `id` (after the edit is committed; edits in a
 * row: once). The track is looked up then: in the project, or a library sound being edited. */
export function saveSoundSoon(id: string, trackId: string, delay: number, copyOf?: string) {
  clearTimeout(saving.get(id));
  saving.set(
    id,
    setTimeout(async () => {
      saving.delete(id);
      const track =
        useStore.getState().project.tracks.find((t) => t.id === trackId) ??
        detachedTracks.get(trackId);
      if (!track?.sound || track.sound.from !== `user:${id}`) return;
      const old = await db.instruments.get(id);
      const name = track.sound.name ?? old?.name ?? "Synth";
      await db.instruments.put({
        id,
        name,
        version: 2,
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
  const src = t.sound!;
  if (event === "fork") {
    const factory = factorySynth(src.preset ?? "");
    const id = uid("ins");
    const name = copyName(factory?.name ?? "Synth");
    src.name = name;
    src.from = `user:${id}`;
    t.source = name;
    useUserInstruments.setState((s) => ({
      list: [
        ...s.list,
        {
          id,
          name,
          version: 2,
          createdAt: Date.now(),
          sound: soundOf(t, name),
          copyOf: src.preset,
        },
      ],
    }));
    saveSoundSoon(id, t.id, 0, src.preset);
    return;
  }
  // later edits keep the copy up to date (only copies made this way, not instruments you saved)
  const id = src.from?.startsWith("user:") ? src.from.slice(5) : null;
  const rec = id && useUserInstruments.getState().list.find((r) => r.id === id);
  if (rec && rec.copyOf) saveSoundSoon(rec.id, t.id, 600);
});

export async function loadUserInstruments() {
  const list = await db.instruments.orderBy("createdAt").toArray();
  const old = list.filter((r) => r.version !== 2);
  for (const r of old) upgradeRecord(r);
  if (old.length) await db.instruments.bulkPut(old);
  useUserInstruments.setState({ list });
}

/**
 * A record saved before step tracks (D94): its instrument source becomes a sound (a sampler a
 * sample or multi-sample), and a voice's ADSR decay gets its new name, as in projects.
 */
export function upgradeRecord(r: InstrumentRecord) {
  const src = soundFromV6(r.sound.instrument as unknown as Record<string, unknown>);
  r.sound.instrument = src;
  const p = r.sound.params;
  if (src.source !== "synth" && "sound.decay" in p) {
    p["sound.envDecay"] = p["sound.decay"];
    delete p["sound.decay"];
  }
  r.version = 2;
}

/** One of Your sounds as a catalog entry. */
export function userEntry(r: InstrumentRecord): CatalogInstrument {
  const src = r.sound.instrument;
  return {
    id: `user:${r.id}`,
    name: r.name,
    family: "Your sounds",
    group:
      src.source === "synth"
        ? "Synths"
        : src.source === "sf2"
          ? "SoundFonts"
          : src.source === "multi"
            ? "Multi-samples"
            : src.source === "sample"
              ? "Samples"
              : "Sampled instruments",
    source: { ...src, name: r.name, from: `user:${r.id}` },
    streamed: src.source === "smplr",
    collection: COLLECTIONS.user,
    params: r.sound.params,
    effects: r.sound.effects,
  };
}

/** Every playable library sound: built-in, streamed and yours. */
export function allInstruments(): CatalogInstrument[] {
  return [...CATALOG, ...useUserInstruments.getState().list.map(userEntry)];
}

export const findInstrument = (id: string) => allInstruments().find((c) => c.id === id);

/** Save a step track's sound (the sound, its SOUND knobs, its effects) to Your sounds. */
export async function saveInstrument(track: Track, name: string): Promise<CatalogInstrument> {
  if (!trackSound(track)) throw new Error("This track has no sound to save yet");
  const rec: InstrumentRecord = {
    id: uid("ins"),
    name,
    version: 2,
    createdAt: Date.now(),
    sound: soundOf(track, name),
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

// ---------- your own multi-samples and SoundFonts (D82) ----------

const record = (name: string, instrument: Sound): InstrumentRecord => ({
  id: uid("ins"),
  name,
  version: 2,
  createdAt: Date.now(),
  sound: {
    instrument: { ...instrument, name },
    params: prefixed("sound", defaultParams(SOUND_PARAMS.voice)),
    effects: [],
  },
});

/** A SoundFont becomes one of Your sounds per instrument inside it. Returns how many. */
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

/** A multi-sample from samples (each at the note in its name). */
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
  const rec = record(name, { source: "multi", zones });
  await db.instruments.put(rec);
  await loadUserInstruments();
  return userEntry(rec);
}
