/**
 * Datasets in and out of the Beatbox panel (D110): a zip with the recordings as WAVs and
 * `hits.csv`, the format `ml/` trains on; and link sources (a strudel.json or a GitHub
 * repository, D74), whose keys label their sounds.
 */
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { audioBufferChannels, encodeWav } from "../wav";
import { audioContext } from "../../engine/context";
import { loadSource } from "../onlineImport";
import { classFromName, type BeatboxClass } from "./classes";
import { fileName, fromCsv, toCsv, type HitRow } from "./dataset";
import {
  addFiles,
  addRecording,
  hitsOf,
  isExample,
  loadAudio,
  loadBeatbox,
  useBeatbox,
  voiceByName,
} from "./store";

const README = `Rebeat beatbox dataset

hits.csv has one row per hit: file (a WAV in this folder), start and end (seconds), label
(kick, snare, hihat, openhat, tom, clap, crash, other; empty when not labeled) and voice (who
made the sound). Labels are the ones you gave or imported; the model's own guesses aren't
exported. Train on it with ml/ in the Rebeat repository: unzip into ml/data/exports/<name>/.
`;

/** Zip the recordings (of one voice, or all) with their labeled hits. */
export async function exportDataset(voiceId?: string): Promise<Uint8Array> {
  await loadBeatbox();
  const s = useBeatbox.getState();
  const voiceName = new Map(s.voices.map((v) => [v.id, v.name]));
  const files: Record<string, Uint8Array> = { "README.txt": strToU8(README) };
  const rows: HitRow[] = [];
  const taken = new Set<string>();
  for (const rec of s.recordings) {
    if (voiceId && rec.voiceId !== voiceId) continue;
    const a = await loadAudio(rec);
    if (!a) continue;
    const name = fileName(rec.name, taken);
    files[name] = new Uint8Array(encodeWav(audioBufferChannels(a.buffer), a.buffer.sampleRate, 16));
    for (const h of hitsOf(rec.id))
      rows.push({
        file: name,
        start: h.start,
        end: h.end,
        label: isExample(h) ? h.label : undefined,
        voice: voiceName.get(rec.voiceId) ?? "",
      });
  }
  files["hits.csv"] = strToU8(toCsv(rows));
  return zipSync(files, { level: 6 });
}

/** Import a dataset zip: voices by name, one recording per file, the hits as they were. */
export async function importDataset(data: ArrayBuffer): Promise<number> {
  await loadBeatbox();
  const files = unzipSync(new Uint8Array(data));
  const csvPath = Object.keys(files).find((p) => /(^|\/)hits\.csv$/i.test(p));
  if (!csvPath) {
    // a zip of audio files without labels: add them as files
    const audio = Object.entries(files).filter(([p]) => /\.(wav|mp3|ogg|flac|aiff?)$/i.test(p));
    for (const [p, bytes] of audio)
      await addFiles([{ name: p.split("/").pop()!, data: bytes.slice().buffer as ArrayBuffer }]);
    return audio.length;
  }
  const dir = csvPath.includes("/") ? csvPath.slice(0, csvPath.lastIndexOf("/") + 1) : "";
  const rows = fromCsv(strFromU8(files[csvPath]));
  const byFile = new Map<string, HitRow[]>();
  for (const r of rows) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  let count = 0;
  for (const [file, hits] of byFile) {
    const bytes = files[dir + file];
    if (!bytes) continue;
    let buffer: AudioBuffer;
    try {
      buffer = await audioContext().decodeAudioData(bytes.slice().buffer as ArrayBuffer);
    } catch {
      continue;
    }
    const labels = new Set(hits.map((h) => h.label));
    await addRecording(audioBufferChannels(buffer), buffer.sampleRate, {
      name: file.replace(/\.[^.]+$/, ""),
      kind: labels.size === 1 && hits.length < 40 ? "sounds" : "take",
      voiceId: await voiceByName(hits[0].voice || "Imported"),
      hits,
      labeledBy: "import",
    });
    count++;
  }
  return count;
}

/** Import a link source: each key's files become recordings, labeled by the key when it names
 * a class ("kick", "hihat"); "loop"-like keys and long files are takes. */
export async function importLink(input: string): Promise<number> {
  const kit = await loadSource(input.trim());
  let count = 0;
  for (const [key, urls] of Object.entries(kit.sounds)) {
    const label: BeatboxClass | undefined = classFromName(key);
    for (const url of urls) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const name = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
      const rec = await addFiles([
        { name, data: await res.arrayBuffer(), ...(label ? { label } : {}) },
      ]);
      if (rec) count++;
    }
  }
  return count;
}
