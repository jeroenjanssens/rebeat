/** IndexedDB (via Dexie): projects, the sample library and audio blobs. */
import Dexie, { type EntityTable } from "dexie";

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
}

export interface BlobRecord {
  id: string;
  blob: Blob;
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

  constructor(name = "rebeat") {
    super(name);
    this.version(1).stores({
      projects: "id, name, updatedAt",
      samples: "id, name, folder, *tags, favorite, createdAt",
      blobs: "id",
      meta: "key",
    });
  }
}

export const db = new RebeatDB();
