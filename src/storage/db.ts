/** IndexedDB (via Dexie): projects, the sample library and audio blobs. */
import Dexie, { type EntityTable } from "dexie";
import type { Effect, Sound } from "../model/types";
import type { BeatboxHit, BeatboxRecording, BeatboxVoice } from "../library/beatbox/dataset";

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Serialized project (schema-versioned JSON). */
  data: unknown;
  /** Small preview image (data URL) for the project browser. */
  thumbnail?: string;
}

export interface SampleRecord {
  /** SHA-256 of the audio file. */
  id: string;
  name: string;
  folder: string;
  tags: string[];
  favorite: 0 | 1;
  createdAt: number;
  duration: number;
  sampleRate: number;
  channels: number;
  mime: string;
  size: number;
  bpm?: number;
  key?: string;
  /** Waveform peaks (0..1), for thumbnails. */
  peaks: number[];
  /** Non-destructive edits (trim, fades, gain, …). */
  settings?: unknown;
  /** The sample this one was rendered from (editor bounce). */
  parentId?: string;
  /** SHA-256 of the current audio, when it differs from the id (edited in place). */
  contentHash?: string;
}

export interface BlobRecord {
  id: string;
  blob: Blob;
}

/** One of Your sounds (D81, D95): a sound with its knobs and effects. */
export interface InstrumentRecord {
  id: string;
  name: string;
  createdAt: number;
  /** 2: the sound is a step track sound (D94); older records hold a version 6 instrument source
   * and are converted when they're read (userInstruments.ts). */
  version?: 2;
  sound: {
    /** The sound (the field kept its old name). */
    instrument: Sound;
    /** The SOUND knobs ("sound.cutoff" → value). */
    params: Record<string, number>;
    effects: Effect[];
  };
  /**
   * Made by editing this factory synth (its id): your copy, kept up to date as you go on
   * shaping it in the synth editor.
   */
  copyOf?: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export class RebeatDB extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">;
  samples!: EntityTable<SampleRecord, "id">;
  blobs!: EntityTable<BlobRecord, "id">;
  meta!: EntityTable<MetaRecord, "key">;
  instruments!: EntityTable<InstrumentRecord, "id">;
  beatboxVoices!: EntityTable<BeatboxVoice, "id">;
  beatboxRecordings!: EntityTable<BeatboxRecording, "id">;
  beatboxHits!: EntityTable<BeatboxHit, "id">;

  constructor(name = "rebeat") {
    super(name);
    this.version(1).stores({
      projects: "id, name, updatedAt",
      samples: "id, name, folder, *tags, favorite, createdAt",
      blobs: "id",
      meta: "key",
    });
    // samples edited in place keep their id; `contentHash` says what audio they hold now
    this.version(2).stores({
      samples: "id, name, folder, *tags, favorite, createdAt, contentHash",
    });
    // your own instruments (saved synths and sounds)
    this.version(3).stores({ instruments: "id, name, createdAt" });
    // the Beatbox panel's voices, recordings and their hits (D110); audio in `blobs`
    this.version(4).stores({
      beatboxVoices: "id, name",
      beatboxRecordings: "id, voiceId, createdAt",
      beatboxHits: "id, recordingId",
    });
  }
}

export const db = new RebeatDB();
