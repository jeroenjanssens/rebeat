/**
 * The Beatbox panel's data (D110): voices, recordings and hits in IndexedDB, their audio, and
 * what the model thinks of every hit (D109), calibrated per voice (D112). Edits save at once;
 * they're not part of the project or its undo.
 */
import { create } from "zustand";
import { db } from "../../storage/db";
import { audioContext } from "../../engine/context";
import { computePeaks } from "../../engine/samples";
import { encodeWav, audioBufferChannels } from "../wav";
import { loadOriginal, sha256 } from "../library";
import { BEATBOX_CLASSES, classFromName, type BeatboxClass } from "./classes";
import { PrototypeSums, blend, softmax } from "./calibrate";
import type { BeatboxHit, BeatboxRecording, BeatboxVoice, LabeledBy } from "./dataset";
import { classify, useModel } from "./model";
import { detectOnsets, firstOnset, hitEnd, hitWindow, peakDb } from "./onsets";
import { mono, resample } from "./resample";
import type { ConvertSettings } from "./convert";

export interface Prediction {
  logits: Float32Array;
  embedding: Float32Array;
  /** The hit's start when it was classified (moving a hit classifies it again). */
  start: number;
}

export interface Audio {
  buffer: AudioBuffer;
  /** 16 kHz mono, what onsets and the model work on. */
  x: Float32Array;
  peaks: Float32Array;
}

interface BeatboxState {
  loaded: boolean;
  voices: BeatboxVoice[];
  recordings: BeatboxRecording[];
  hits: BeatboxHit[];
  voiceId: string;
  selectedRecordingId: string | null;
  selectedHitIds: string[];
  predictions: Record<string, Prediction>;
  /** Convert settings per take, for this session. */
  convert: Record<string, ConvertSettings>;
  /** Bumped when audio finishes loading, so waveforms redraw. */
  audioVersion: number;
  set: (patch: Partial<BeatboxState>) => void;
}

export const useBeatbox = create<BeatboxState>()((set) => ({
  loaded: false,
  voices: [],
  recordings: [],
  hits: [],
  voiceId: "",
  selectedRecordingId: null,
  selectedHitIds: [],
  predictions: {},
  convert: {},
  audioVersion: 0,
  set: (patch) => set(patch),
}));

const get = () => useBeatbox.getState();
// saved records outlive the session, so ids are random rather than model/id's counter
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const VOICE_KEY = "beatbox.voice";

// ---------- loading ----------

let loading: Promise<void> | null = null;

export function loadBeatbox(): Promise<void> {
  loading ??= (async () => {
    let voices = await db.beatboxVoices.toArray();
    if (!voices.length) {
      const me: BeatboxVoice = { id: uid("voice"), name: "Me", createdAt: Date.now() };
      await db.beatboxVoices.put(me);
      voices = [me];
    }
    const recordings = await db.beatboxRecordings.orderBy("createdAt").toArray();
    const hits = await db.beatboxHits.toArray();
    const saved = (await db.meta.get(VOICE_KEY))?.value as string | undefined;
    const voiceId = voices.some((v) => v.id === saved) ? saved! : voices[0].id;
    get().set({ loaded: true, voices, recordings, hits, voiceId });
  })();
  return loading;
}

// ---------- audio ----------

const audio = new Map<string, Audio>();
const decoding = new Map<string, Promise<Audio | null>>();

export const audioOf = (recordingId: string) => audio.get(recordingId);

export function loadAudio(rec: BeatboxRecording): Promise<Audio | null> {
  const had = decoding.get(rec.id);
  if (had) return had;
  const p = (async () => {
    let buffer: AudioBuffer | null = null;
    if ("blob" in rec.audio) {
      const b = await db.blobs.get(rec.audio.blob);
      if (b) buffer = await audioContext().decodeAudioData(await b.blob.arrayBuffer());
    } else buffer = await loadOriginal(rec.audio.sampleId);
    if (!buffer) return null;
    const a: Audio = {
      buffer,
      x: resample(mono(audioBufferChannels(buffer)), buffer.sampleRate),
      peaks: computePeaks(buffer, 2048),
    };
    audio.set(rec.id, a);
    get().set({ audioVersion: get().audioVersion + 1 });
    return a;
  })();
  decoding.set(rec.id, p);
  p.catch(() => decoding.delete(rec.id));
  return p;
}

// ---------- recordings ----------

async function storeAudio(channels: Float32Array[], sampleRate: number) {
  const data = encodeWav(channels, sampleRate, 16);
  const id = `bbx:${await sha256(data)}`;
  await db.blobs.put({ id, blob: new Blob([data], { type: "audio/wav" }) });
  return id;
}

export interface NewRecording {
  name: string;
  kind: BeatboxRecording["kind"];
  /** Single sounds: every hit found gets this label. */
  label?: BeatboxClass;
  labeledBy?: LabeledBy;
  bpm?: number;
  barStart?: number;
  voiceId?: string;
  /** One sound (a short file): one hit from its start, instead of finding them. */
  oneShot?: boolean;
  /** The recording's own hits (an imported dataset), instead of finding them. */
  hits?: { start: number; end: number; label?: BeatboxClass }[];
}

function oneShotHit(x: Float32Array) {
  const start = firstOnset(x);
  return { start, end: hitEnd(x, start) };
}

/** Hits found by onsets, each ending at the next or once it has decayed. */
export function findHits(x: Float32Array, sensitivity = 0.5) {
  const onsets = detectOnsets(x, { sensitivity });
  return onsets.map((o, i) => ({ start: o.time, end: hitEnd(x, o.time, onsets[i + 1]?.time) }));
}

async function addRecordingWith(
  audioRef: BeatboxRecording["audio"],
  buffer: AudioBuffer,
  opts: NewRecording,
): Promise<BeatboxRecording> {
  await loadBeatbox();
  const rec: BeatboxRecording = {
    id: uid("rec"),
    name: opts.name,
    voiceId: opts.voiceId ?? get().voiceId,
    kind: opts.kind,
    audio: audioRef,
    duration: buffer.duration,
    createdAt: Date.now(),
    ...(opts.bpm ? { bpm: opts.bpm } : {}),
    ...(opts.barStart !== undefined ? { barStart: opts.barStart } : {}),
  };
  const a: Audio = {
    buffer,
    x: resample(mono(audioBufferChannels(buffer)), buffer.sampleRate),
    peaks: computePeaks(buffer, 2048),
  };
  audio.set(rec.id, a);
  decoding.set(rec.id, Promise.resolve(a));
  const found: { start: number; end: number; label?: BeatboxClass }[] =
    opts.hits ?? (opts.oneShot ? [oneShotHit(a.x)] : findHits(a.x));
  const hits: BeatboxHit[] = found.map((h) => {
    const label = h.label ?? opts.label;
    return {
      id: uid("hit"),
      recordingId: rec.id,
      start: h.start,
      end: h.end,
      ...(label ? { label, labeledBy: opts.labeledBy ?? "you" } : {}),
    };
  });
  await db.transaction("rw", db.beatboxRecordings, db.beatboxHits, async () => {
    await db.beatboxRecordings.put(rec);
    await db.beatboxHits.bulkPut(hits);
  });
  get().set({
    recordings: [...get().recordings, rec],
    hits: [...get().hits, ...hits],
    selectedRecordingId: rec.id,
    selectedHitIds: [],
  });
  void predict(rec.id);
  return rec;
}

/** A recording from captured channels (the panel's Record). */
export async function addRecording(
  channels: Float32Array[],
  sampleRate: number,
  opts: NewRecording,
) {
  const blob = await storeAudio(channels, sampleRate);
  const buffer = new AudioBuffer({
    length: Math.max(1, channels[0].length),
    numberOfChannels: channels.length,
    sampleRate,
  });
  channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return addRecordingWith({ blob }, buffer, opts);
}

/** A take from a library sample (a Clip track's recording, a loop), without copying it. */
export async function addRecordingFromSample(sampleId: string, opts: NewRecording) {
  await loadBeatbox();
  const existing = get().recordings.find(
    (r) => "sampleId" in r.audio && r.audio.sampleId === sampleId,
  );
  if (existing) {
    get().set({ selectedRecordingId: existing.id, selectedHitIds: [] });
    return existing;
  }
  const buffer = await loadOriginal(sampleId);
  if (!buffer) throw new Error("That sample's audio couldn't be loaded.");
  return addRecordingWith({ sampleId }, buffer, opts);
}

/** Audio files: one recording each. A name that says its class ("kick2.wav") labels its hits,
 * and a short file is single sounds; anything else is a take. */
export async function addFiles(
  files: { name: string; data: ArrayBuffer; label?: BeatboxClass | "other" }[],
) {
  let last: BeatboxRecording | null = null;
  for (const f of files) {
    let buffer: AudioBuffer;
    try {
      buffer = await audioContext().decodeAudioData(f.data.slice(0));
    } catch {
      continue;
    }
    const label = f.label ?? classFromName(f.name);
    const short = buffer.duration < 1.5;
    const blob = await storeAudio(audioBufferChannels(buffer), buffer.sampleRate);
    last = await addRecordingWith({ blob }, buffer, {
      name: f.name.replace(/\.[^.]+$/, ""),
      kind: label || short ? "sounds" : "take",
      oneShot: short,
      ...(label || short ? { label: label ?? "other", labeledBy: "import" as const } : {}),
    });
  }
  return last;
}

export async function updateRecording(id: string, patch: Partial<BeatboxRecording>) {
  await db.beatboxRecordings.update(id, patch);
  get().set({ recordings: get().recordings.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

export async function removeRecording(id: string) {
  const rec = get().recordings.find((r) => r.id === id);
  if (!rec) return;
  const hitIds = get()
    .hits.filter((h) => h.recordingId === id)
    .map((h) => h.id);
  await db.transaction("rw", db.beatboxRecordings, db.beatboxHits, db.blobs, async () => {
    await db.beatboxRecordings.delete(id);
    await db.beatboxHits.bulkDelete(hitIds);
    if ("blob" in rec.audio) {
      const blob = rec.audio.blob;
      const shared = get().recordings.some(
        (r) => r.id !== id && "blob" in r.audio && r.audio.blob === blob,
      );
      if (!shared) await db.blobs.delete(blob);
    }
  });
  audio.delete(id);
  decoding.delete(id);
  const s = get();
  s.set({
    recordings: s.recordings.filter((r) => r.id !== id),
    hits: s.hits.filter((h) => h.recordingId !== id),
    selectedRecordingId: s.selectedRecordingId === id ? null : s.selectedRecordingId,
    selectedHitIds: [],
  });
}

// ---------- hits ----------

export const hitsOf = (recordingId: string, hits = get().hits) =>
  hits.filter((h) => h.recordingId === recordingId).sort((a, b) => a.start - b.start);

async function saveHits(changed: BeatboxHit[]) {
  await db.beatboxHits.bulkPut(changed);
  const byId = new Map(changed.map((h) => [h.id, h]));
  const known = new Set(get().hits.map((h) => h.id));
  get().set({
    hits: [
      ...get().hits.map((h) => byId.get(h.id) ?? h),
      ...changed.filter((h) => !known.has(h.id)),
    ],
  });
}

export async function addHit(recordingId: string, start: number, end: number) {
  const hit: BeatboxHit = { id: uid("hit"), recordingId, start, end: Math.max(end, start + 0.02) };
  await saveHits([hit]);
  get().set({ selectedHitIds: [hit.id] });
  void predict(recordingId);
  return hit;
}

export async function updateHit(id: string, patch: Partial<Pick<BeatboxHit, "start" | "end">>) {
  const h = get().hits.find((x) => x.id === id);
  if (!h) return;
  const next = { ...h, ...patch };
  if (next.end < next.start + 0.02) next.end = next.start + 0.02;
  await saveHits([next]);
  if (patch.start !== undefined) void predict(h.recordingId);
}

export async function labelHits(
  ids: string[],
  label: BeatboxClass | undefined,
  by: LabeledBy = "you",
) {
  const set = new Set(ids);
  const changed = get()
    .hits.filter((h) => set.has(h.id))
    .map((h) => {
      const next: BeatboxHit = { ...h, label, labeledBy: by };
      if (!label) {
        delete next.label;
        delete next.labeledBy;
      }
      return next;
    });
  await saveHits(changed);
}

export async function removeHits(ids: string[]) {
  const set = new Set(ids);
  await db.beatboxHits.bulkDelete(ids);
  const s = get();
  s.set({
    hits: s.hits.filter((h) => !set.has(h.id)),
    selectedHitIds: s.selectedHitIds.filter((id) => !set.has(id)),
  });
}

/** Find the hits again; the ones you labeled stay (and keep their place). */
export async function redetect(recordingId: string, sensitivity: number) {
  const a = audio.get(recordingId);
  if (!a) return;
  const current = hitsOf(recordingId);
  const keep = current.filter((h) => h.labeledBy === "you");
  const found = findHits(a.x, sensitivity).filter(
    (f) => !keep.some((k) => Math.abs(k.start - f.start) < 0.03),
  );
  const drop = current.filter((h) => !keep.includes(h)).map((h) => h.id);
  await db.beatboxHits.bulkDelete(drop);
  const added: BeatboxHit[] = found.map((f) => ({ id: uid("hit"), recordingId, ...f }));
  const s = get();
  const dropSet = new Set(drop);
  s.set({ hits: s.hits.filter((h) => !dropSet.has(h.id)), selectedHitIds: [] });
  await saveHits(added);
  void predict(recordingId);
}

// ---------- voices ----------

export async function setVoice(voiceId: string) {
  await db.meta.put({ key: VOICE_KEY, value: voiceId });
  get().set({ voiceId });
}

export async function addVoice(name: string) {
  const v: BeatboxVoice = { id: uid("voice"), name, createdAt: Date.now() };
  await db.beatboxVoices.put(v);
  get().set({ voices: [...get().voices, v] });
  await setVoice(v.id);
  return v;
}

export async function renameVoice(id: string, name: string) {
  await db.beatboxVoices.update(id, { name });
  get().set({ voices: get().voices.map((v) => (v.id === id ? { ...v, name } : v)) });
}

/** Remove a voice; its recordings move to another voice. */
export async function removeVoice(id: string) {
  const s = get();
  if (s.voices.length < 2) return;
  const to = s.voices.find((v) => v.id !== id)!.id;
  for (const r of s.recordings.filter((r) => r.voiceId === id))
    await updateRecording(r.id, { voiceId: to });
  await db.beatboxVoices.delete(id);
  get().set({ voices: get().voices.filter((v) => v.id !== id) });
  if (s.voiceId === id) await setVoice(to);
}

export async function voiceByName(name: string): Promise<string> {
  await loadBeatbox();
  const found = get().voices.find((v) => v.name === name);
  return found ? found.id : (await addVoice(name)).id;
}

// ---------- the model ----------

const queue = new Set<string>();
let running: Promise<void> | null = null;

/** Classify the hits of a recording that have no prediction for where they start now. */
export function predict(recordingId: string): Promise<void> {
  queue.add(recordingId);
  running ??= (async () => {
    try {
      while (queue.size) {
        const [id] = queue;
        queue.delete(id);
        const rec = get().recordings.find((r) => r.id === id);
        if (!rec) continue;
        const a = audio.get(id) ?? (await loadAudio(rec));
        if (!a) continue;
        const todo = hitsOf(id).filter((h) => get().predictions[h.id]?.start !== h.start);
        if (!todo.length) continue;
        const all = hitsOf(id);
        const next = (h: BeatboxHit) => all.find((o) => o.start > h.start + 0.03)?.start;
        const out = await classify(todo.map((h) => hitWindow(a.x, h.start, next(h))));
        const predictions = { ...get().predictions };
        todo.forEach((h, i) => (predictions[h.id] = { ...out[i], start: h.start }));
        get().set({ predictions });
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Classify every recording of a voice (calibration needs the embeddings of all its labels). */
export async function predictVoice(voiceId: string) {
  for (const r of get().recordings.filter((r) => r.voiceId === voiceId)) await predict(r.id);
}

/** Labels that count as examples: yours and imported ones, not the model's own. */
export const isExample = (h: BeatboxHit): h is BeatboxHit & { label: BeatboxClass } =>
  !!h.label && h.labeledBy !== "model";

const CLASS_INDEX = Object.fromEntries(BEATBOX_CLASSES.map((c, i) => [c, i])) as Record<
  BeatboxClass,
  number
>;

/** A voice's calibration: per-class sums of its examples' embeddings. */
export function calibrationOf(voiceId: string, s = get()): PrototypeSums | null {
  const recs = new Set(s.recordings.filter((r) => r.voiceId === voiceId).map((r) => r.id));
  let sums: PrototypeSums | null = null;
  for (const h of s.hits) {
    if (!recs.has(h.recordingId) || !isExample(h)) continue;
    const p = s.predictions[h.id];
    if (!p) continue;
    sums ??= new PrototypeSums(BEATBOX_CLASSES.length, p.embedding.length);
    sums.add(p.embedding, CLASS_INDEX[h.label]);
  }
  return sums;
}

export interface Guess {
  label: BeatboxClass;
  confidence: number;
  probs: number[];
}

/** What the model thinks a hit is, calibrated to its voice (without the hit's own label). */
export function guessOf(
  hit: BeatboxHit,
  calibration: PrototypeSums | null,
  calibrated = true,
): Guess | null {
  const p = get().predictions[hit.id];
  if (!p) return null;
  const info = useModel.getState().info;
  let probs: number[];
  if (!calibrated || !calibration) probs = softmax(p.logits);
  else {
    const protos = calibration.prototypes(
      isExample(hit) ? { embedding: p.embedding, label: CLASS_INDEX[hit.label] } : undefined,
    );
    probs = blend(p.logits, p.embedding, protos, info?.calibration.tau, info?.calibration.k);
  }
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return { label: BEATBOX_CLASSES[best], confidence: probs[best], probs };
}

/** The label a hit converts with: yours, else the model's guess. */
export function finalLabel(hit: BeatboxHit, calibration: PrototypeSums | null) {
  return isExample(hit) ? hit.label : (hit.label ?? guessOf(hit, calibration)?.label);
}

export const hitPeakDb = (hit: BeatboxHit) => {
  const a = audio.get(hit.recordingId);
  return a ? peakDb(a.x, hit.start) : -12;
};

export interface VoiceStats {
  counts: Record<BeatboxClass, number>;
  /** Leave-one-out accuracy over the voice's examples: the model alone, and calibrated. */
  plain: number | null;
  calibrated: number | null;
  perClass: Record<BeatboxClass, { plain: number; calibrated: number; n: number }>;
}

export function voiceStats(voiceId: string, s = get()): VoiceStats {
  const calibration = calibrationOf(voiceId, s);
  const recs = new Set(s.recordings.filter((r) => r.voiceId === voiceId).map((r) => r.id));
  const counts = Object.fromEntries(BEATBOX_CLASSES.map((c) => [c, 0])) as VoiceStats["counts"];
  const perClass = Object.fromEntries(
    BEATBOX_CLASSES.map((c) => [c, { plain: 0, calibrated: 0, n: 0 }]),
  ) as VoiceStats["perClass"];
  let n = 0;
  let plain = 0;
  let cal = 0;
  for (const h of s.hits) {
    if (!recs.has(h.recordingId) || !isExample(h)) continue;
    counts[h.label]++;
    const a = guessOf(h, calibration, false);
    const b = guessOf(h, calibration, true);
    if (!a || !b) continue;
    n++;
    perClass[h.label].n++;
    if (a.label === h.label) {
      plain++;
      perClass[h.label].plain++;
    }
    if (b.label === h.label) {
      cal++;
      perClass[h.label].calibrated++;
    }
  }
  return { counts, plain: n ? plain / n : null, calibrated: n ? cal / n : null, perClass };
}
