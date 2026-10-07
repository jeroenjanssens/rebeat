/**
 * The sample library (shared by all projects): import, organize, and decode samples on demand.
 * Samples are content-addressed (SHA-256), so importing the same file twice is detected.
 */
import { unzipSync } from "fflate";
import { create } from "zustand";
import { audioContext } from "../engine/context";
import { KIT_SOUNDS } from "../engine/kits";
import { computePeaks, getBuffer, registerSample } from "../engine/samples";
import { projectSampleIds } from "../model/schema";
import { useStore } from "../state/store";
import { db, type SampleRecord } from "../storage/db";
import { detectBpm, guessCategory, toMono } from "./analysis";
import { encodeWav } from "./wav";
import { isDefault, renderSettings, withDefaults, type SampleSettings } from "./processing";

export const AUDIO_EXT = /\.(wav|wave|mp3|ogg|oga|opus|flac|aac|m4a|aif|aiff|webm|caf)$/i;
const MIME: Record<string, string> = {
  wav: "audio/wav",
  wave: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  webm: "audio/webm",
};

export const isBuiltIn = (id: string) => id.startsWith("kit:") || id.startsWith("demo:");

interface LibraryState {
  samples: SampleRecord[];
  loaded: boolean;
  selectedId: string | null;
  importing: { done: number; total: number } | null;
  set: (p: Partial<Omit<LibraryState, "set">>) => void;
}

export const useLibrary = create<LibraryState>()((set) => ({
  samples: [],
  loaded: false,
  selectedId: null,
  importing: null,
  set: (p) => set(p),
}));

async function refresh() {
  const samples = await db.samples.toArray();
  useLibrary.getState().set({ samples, loaded: true });
}

export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function baseName(path: string) {
  return path
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "");
}

export interface ImportItem {
  name: string;
  data: ArrayBuffer;
  folder: string;
  tags?: string[];
  /** Known tempo (e.g. a loop recorded at the song tempo); skips detection. */
  bpm?: number;
}

/** Import one file; returns the sample id (existing or new), or null if it can't be decoded. */
async function importOne(item: ImportItem): Promise<string | null> {
  const hash = await sha256(item.data);
  // the same audio may already be here: imported as is, or as the result of an in-place edit
  const same =
    (await db.samples.where("contentHash").equals(hash).first()) ?? (await db.samples.get(hash));
  if (same && (same.contentHash ?? same.id) === hash) return same.id;
  // an edited sample took this file's original id: give the import an id of its own
  const id = same ? `${hash}-${Date.now().toString(36)}` : hash;
  let buffer: AudioBuffer;
  try {
    buffer = await audioContext().decodeAudioData(item.data.slice(0));
  } catch {
    return null;
  }
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  const name = baseName(item.name);
  const bpm =
    item.bpm ??
    (buffer.duration >= 1.2 && buffer.duration <= 40 ? detectBpm(toMono(buffer)) : undefined);
  const record: SampleRecord = {
    id,
    name,
    folder: item.folder,
    tags: item.tags ?? [],
    favorite: 0,
    createdAt: Date.now(),
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    mime: MIME[ext] ?? "audio/*",
    size: item.data.byteLength,
    bpm,
    peaks: [...computePeaks(buffer, 96)].map((v) => Math.round(v * 1000) / 1000),
  };
  await db.transaction("rw", db.samples, db.blobs, async () => {
    await db.samples.put(record);
    await db.blobs.put({ id, blob: new Blob([item.data], { type: record.mime }) });
  });
  registerSample({ id, name, category: guessCategory(name), bpm }, buffer);
  return id;
}

/** Import files (and zips) into a folder. Returns the ids of the imported samples, in order. */
export async function importFiles(files: (File | ImportItem)[], folder = ""): Promise<string[]> {
  const items: ImportItem[] = [];
  for (const f of files) {
    if (!(f instanceof File)) {
      items.push(f);
      continue;
    }
    if (/\.zip$/i.test(f.name))
      items.push(...unzipItems(await f.arrayBuffer(), folder || baseName(f.name)));
    else if (AUDIO_EXT.test(f.name) || f.type.startsWith("audio/")) {
      // a picked folder keeps its structure: "Drums/Kicks/k1.wav" → folder "Drums/Kicks"
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const sub = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      items.push({
        name: f.name,
        data: await f.arrayBuffer(),
        folder: [folder, sub].filter(Boolean).join("/"),
      });
    }
  }
  return (await importItems(items)).filter((id): id is string => !!id);
}

/** Import decoded-ready items; the result is aligned with the input (null = not audio). */
export async function importItems(items: ImportItem[]): Promise<(string | null)[]> {
  const ids: (string | null)[] = [];
  useLibrary.getState().set({ importing: { done: 0, total: items.length } });
  for (const [i, item] of items.entries()) {
    ids.push(await importOne(item));
    useLibrary.getState().set({ importing: { done: i + 1, total: items.length } });
  }
  useLibrary.getState().set({ importing: null });
  await refresh();
  return ids;
}

function unzipItems(data: ArrayBuffer, folder: string): ImportItem[] {
  const files = unzipSync(new Uint8Array(data), {
    filter: (f) => AUDIO_EXT.test(f.name) && !f.name.includes("__MACOSX"),
  });
  return Object.entries(files).map(([path, bytes]) => {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    return {
      name: path,
      data: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      folder: [folder, dir].filter(Boolean).join("/"),
    };
  });
}

/** Files from a drop, including dropped folders (read recursively). */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, path: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej),
      );
      Object.defineProperty(file, "webkitRelativePath", { value: path + file.name });
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, `${path}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, "");
  return out;
}

/** Store a recording (WAV) in the library's Recordings folder; returns its sample id. */
export async function saveRecording(
  channels: Float32Array[],
  sampleRate: number,
  name: string,
  bpm?: number,
) {
  const data = encodeWav(channels, sampleRate, 24);
  const [id] = await importItems([
    { name: `${name}.wav`, data, folder: "Recordings", tags: ["recording"], bpm },
  ]);
  return id;
}

// ---------- decoding on demand ----------

const loading = new Map<string, Promise<AudioBuffer | null>>();
const originals = new Map<string, AudioBuffer>();

/** The sample's audio before its settings (for the editor). */
export async function loadOriginal(id: string): Promise<AudioBuffer | null> {
  if (originals.has(id)) return originals.get(id)!;
  if (isBuiltIn(id)) return getBuffer(id) ?? null;
  await loadSample(id);
  if (originals.has(id)) return originals.get(id)!;
  // imported this session: decode the stored file again
  const blob = await db.blobs.get(id);
  if (!blob) return null;
  try {
    const buf = await audioContext().decodeAudioData(await blob.blob.arrayBuffer());
    originals.set(id, buf);
    return buf;
  } catch {
    return null;
  }
}

/** Store new settings on a sample: every track that uses it hears the change (D19). */
export async function applySettings(id: string, settings: SampleSettings) {
  const original = await loadOriginal(id);
  const rec = await db.samples.get(id);
  if (!original || !rec) return;
  await db.samples.update(id, { settings: isDefault(settings) ? undefined : settings });
  const buffer = isDefault(settings) ? original : await renderSettings(original, settings);
  registerSample({ id, name: rec.name, category: guessCategory(rec.name), bpm: rec.bpm }, buffer);
  await refresh();
}

/**
 * Apply an audio edit in place: the sample keeps its id (so every track that uses it, in every
 * project, gets the new sound) and its stored audio is replaced.
 */
export async function replaceAudio(
  id: string,
  channels: Float32Array[],
  sampleRate: number,
  settings: SampleSettings,
) {
  const data = encodeWav(channels, sampleRate, 24);
  const contentHash = await sha256(data);
  const original = new AudioBuffer({
    length: Math.max(1, channels[0].length),
    numberOfChannels: channels.length,
    sampleRate,
  });
  channels.forEach((c, i) => original.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  await db.transaction("rw", db.samples, db.blobs, async () => {
    await db.blobs.put({ id, blob: new Blob([data], { type: "audio/wav" }) });
    await db.samples.update(id, {
      contentHash,
      mime: "audio/wav",
      size: data.byteLength,
      duration: original.duration,
      sampleRate,
      channels: channels.length,
      peaks: [...computePeaks(original, 96)].map((v) => Math.round(v * 1000) / 1000),
      settings: isDefault(settings) ? undefined : settings,
    });
  });
  originals.set(id, original);
  const rec = await db.samples.get(id);
  const buffer = isDefault(settings) ? original : await renderSettings(original, settings);
  registerSample(
    { id, name: rec?.name ?? id, category: guessCategory(rec?.name ?? ""), bpm: rec?.bpm },
    buffer,
  );
  await refresh();
}

/** Save audio as a new library sample (a new version of `parentId`); returns its id. */
export async function saveVersion(
  channels: Float32Array[],
  sampleRate: number,
  name: string,
  parentId?: string,
  bpm?: number,
) {
  const parent = parentId ? await db.samples.get(parentId) : undefined;
  const data = encodeWav(channels, sampleRate, 24);
  const [id] = await importItems([
    {
      name: `${name}.wav`,
      data,
      folder: parent?.folder ?? "",
      tags: parent?.tags ?? [],
      bpm: bpm ?? parent?.bpm,
    },
  ]);
  if (id && parentId) await db.samples.update(id, { parentId });
  await refresh();
  return id;
}

/** Point every track in the open project from one sample to another. */
export function replaceInProject(from: string, to: string) {
  useStore.getState().commit((p) => {
    for (const t of p.tracks) {
      if (t.sampleId === from) t.sampleId = to;
      if (t.instrument?.sampleId === from) t.instrument.sampleId = to;
      for (const l of t.layers ?? []) if (l.sampleId === from) l.sampleId = to;
    }
  });
}

/** Make sure a sample's audio is decoded and available to the engine. */
export function loadSample(id: string): Promise<AudioBuffer | null> {
  const ready = getBuffer(id);
  if (ready) return Promise.resolve(ready);
  if (isBuiltIn(id)) return Promise.resolve(null);
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      const [rec, blob] = await Promise.all([db.samples.get(id), db.blobs.get(id)]);
      if (!rec || !blob) return null;
      try {
        const original = await audioContext().decodeAudioData(await blob.blob.arrayBuffer());
        originals.set(id, original);
        const settings = withDefaults(rec.settings as Partial<SampleSettings>);
        const buffer = isDefault(settings) ? original : await renderSettings(original, settings);
        registerSample(
          { id, name: rec.name, category: guessCategory(rec.name), bpm: rec.bpm },
          buffer,
        );
        return buffer;
      } catch {
        return null;
      }
    })();
    loading.set(id, p);
  }
  return p;
}

// ---------- organizing ----------

export async function updateSample(id: string, patch: Partial<SampleRecord>) {
  await db.samples.update(id, patch);
  await refresh();
}

export async function deleteSample(id: string) {
  await db.transaction("rw", db.samples, db.blobs, async () => {
    await db.samples.delete(id);
    await db.blobs.delete(id);
  });
  await refresh();
}

/** Tracks in the open project that use a sample. */
export function usageOf(id: string) {
  return useStore
    .getState()
    .project.tracks.filter(
      (t) =>
        t.sampleId === id ||
        t.instrument?.sampleId === id ||
        t.layers?.some((l) => l.sampleId === id),
    );
}

export function sampleName(id: string | undefined): string {
  if (!id) return "";
  return (
    KIT_SOUNDS.find((k) => k.id === id)?.name ??
    useLibrary.getState().samples.find((s) => s.id === id)?.name ??
    "Missing sample"
  );
}

let started = false;

/** Load the library and keep the open project's samples decoded. */
export function startLibrary() {
  if (started) return;
  started = true;
  void refresh();
  let last: unknown = null;
  const ensure = () => {
    const { project } = useStore.getState();
    if (project === last) return;
    last = project;
    for (const id of projectSampleIds(project)) void loadSample(id);
  };
  ensure();
  useStore.subscribe(ensure);
}
