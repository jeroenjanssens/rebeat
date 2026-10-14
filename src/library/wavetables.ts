/**
 * Your wavetables (D246): tables made from samples or WAV files, kept in IndexedDB like samples
 * (content-addressed: the same frames are one table), named in the menus, played by the synth
 * (the loader below), and carried in .rebeat and .rbsynth files.
 */
import { create } from "zustand";
import { db, type WavetableRecord } from "../storage/db";
import { FRAME, MAX_FRAMES, setTableName } from "../model/wavetables";
import { setUserTableLoader } from "../engine/synth/tables";

export const useWavetables = create<{ list: WavetableRecord[] }>(() => ({ list: [] }));

const blobId = (id: string) => `wt:${id.slice(5)}`;

/** The frames of a stored table's bytes (Float32, little-endian, FRAME per frame). */
export function framesOf(bytes: ArrayBuffer): Float32Array[] {
  const all = new Float32Array(bytes);
  const n = Math.min(MAX_FRAMES, Math.floor(all.length / FRAME));
  return Array.from({ length: n }, (_, i) => all.slice(i * FRAME, (i + 1) * FRAME));
}

function bytesOf(frames: Float32Array[]): Uint8Array {
  const all = new Float32Array(frames.length * FRAME);
  frames.forEach((f, i) => all.set(f.subarray(0, FRAME), i * FRAME));
  return new Uint8Array(all.buffer);
}

async function sha256(bytes: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let loaderSet = false;
/** Read your tables (startup): their names for the menus, and the synth's loader. */
export async function loadWavetables() {
  if (!loaderSet) {
    loaderSet = true;
    setUserTableLoader(async (id) => {
      const rec = await db.blobs.get(blobId(id));
      return rec ? framesOf(await rec.blob.arrayBuffer()) : null;
    });
  }
  const list = await db.wavetables.orderBy("createdAt").toArray();
  for (const t of list) setTableName(t.id, t.name);
  useWavetables.setState({ list });
}

/** Save frames as one of your tables; returns its id (an existing one if it's the same). */
export async function saveWavetable(name: string, frames: Float32Array[]): Promise<string> {
  const bytes = bytesOf(frames.slice(0, MAX_FRAMES));
  const id = `user:${await sha256(bytes)}`;
  await putWavetable(id, name, bytes);
  return id;
}

/** Store a table's bytes under its id, unless it's there (imports: .rebeat, .rbsynth). */
export async function putWavetable(id: string, name: string, bytes: Uint8Array) {
  if (!(await db.wavetables.get(id))) {
    await db.transaction("rw", db.wavetables, db.blobs, async () => {
      await db.blobs.put({ id: blobId(id), blob: new Blob([bytes as Uint8Array<ArrayBuffer>]) });
      await db.wavetables.put({
        id,
        name,
        frames: Math.floor(bytes.byteLength / 4 / FRAME),
        createdAt: Date.now(),
      });
    });
  }
  await loadWavetables();
}

/** A stored table's record and bytes (for files), or null. */
export async function wavetableData(id: string) {
  const rec = await db.wavetables.get(id);
  const blob = await db.blobs.get(blobId(id));
  if (!rec || !blob) return null;
  return { record: rec, bytes: new Uint8Array(await blob.blob.arrayBuffer()) };
}

export async function renameWavetable(id: string, name: string) {
  await db.wavetables.update(id, { name });
  await loadWavetables();
}

/** Remove a table (patches that use it play Basic shapes until it's back). */
export async function deleteWavetable(id: string) {
  await db.transaction("rw", db.wavetables, db.blobs, async () => {
    await db.wavetables.delete(id);
    await db.blobs.delete(blobId(id));
  });
  await loadWavetables();
}
