/**
 * Your instruments (D81): synths you shaped and sounds you saved, with their SOUND knobs and
 * effects, so any project can use them. They live in the library database; tracks keep a full
 * copy of the sound, so projects stay self-contained.
 */
import { create } from "zustand";
import { defaultInstrument } from "../engine/instruments";
import { uid } from "../model/id";
import type { Track } from "../model/types";
import { db, type InstrumentRecord } from "../storage/db";
import { COLLECTIONS, CATALOG, type CatalogInstrument } from "./instruments";

export const useUserInstruments = create<{ list: InstrumentRecord[] }>()(() => ({ list: [] }));

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
      src.source === "synth" ? "Synths" : src.source === "sampler" ? "Samplers" : "Instruments",
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
