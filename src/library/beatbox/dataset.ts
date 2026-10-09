/**
 * Recordings, hits and voices (D110), and the dataset format they're exported in: a zip with
 * the recordings as WAVs and `hits.csv` (file, start, end, label, voice), the same format
 * `ml/` trains on (`rebeat_ml/data.py: read_folder`).
 */
import { isClass, type BeatboxClass } from "./classes";

export interface BeatboxVoice {
  id: string;
  name: string;
  createdAt: number;
}

export interface BeatboxRecording {
  id: string;
  name: string;
  voiceId: string;
  /** Single sounds (one class, repeated) or a take (a beat to convert). */
  kind: "sounds" | "take";
  /** Where the audio is: a blob of its own (`bbx:<sha256>`) or a library sample. */
  audio: { blob: string } | { sampleId: string };
  duration: number;
  createdAt: number;
  /** Known when recorded in Rebeat: the tempo, and where the first bar starts (seconds). */
  bpm?: number;
  barStart?: number;
}

export type LabeledBy = "you" | "import" | "model";

export interface BeatboxHit {
  id: string;
  recordingId: string;
  /** Seconds in the recording. */
  start: number;
  end: number;
  label?: BeatboxClass;
  labeledBy?: LabeledBy;
}

export const HITS_HEADER = ["file", "start", "end", "label", "voice"] as const;

export interface HitRow {
  file: string;
  start: number;
  end: number;
  label?: BeatboxClass;
  voice: string;
}

function quote(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: HitRow[]): string {
  const lines = [HITS_HEADER.join(",")];
  for (const r of rows)
    lines.push(
      [r.file, r.start.toFixed(4), r.end.toFixed(4), r.label ?? "", r.voice].map(quote).join(","),
    );
  return lines.join("\n") + "\n";
}

/** RFC 4180 CSV → rows of strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

export function fromCsv(text: string): HitRow[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const col = (name: string) => head.indexOf(name);
  const [f, s, e, l, v] = HITS_HEADER.map(col);
  if (f < 0 || s < 0) throw new Error("hits.csv needs at least the columns file and start");
  return rows.map((r) => {
    const start = Number(r[s]);
    const label = l >= 0 ? r[l] : "";
    return {
      file: r[f],
      start,
      end: e >= 0 && r[e] !== "" ? Number(r[e]) : start + 0.2,
      label: isClass(label) ? label : undefined,
      voice: v >= 0 ? r[v] : "",
    };
  });
}

/** A file name that's safe in a zip and unique among the others. */
export function fileName(name: string, taken: Set<string>): string {
  const base = name.replace(/[^\w\- .()]+/g, "_").trim() || "recording";
  let out = `${base}.wav`;
  for (let i = 2; taken.has(out); i++) out = `${base} ${i}.wav`;
  taken.add(out);
  return out;
}
