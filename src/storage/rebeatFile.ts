/**
 * `.rebeat` files: a zip with `project.json`, `samples.json` (library metadata) and the audio of
 * every library sample the project uses. Built-in kit sounds aren't embedded: they're generated.
 */
import { strFromU8, strToU8, unzip, zip } from "fflate";
import type { Project } from "../model/project";
import { deserializeProject, projectSampleIds, serializeProject } from "../model/schema";
import { db, type SampleRecord, type WavetableRecord } from "./db";
import { tablesOf } from "../engine/synth/tables";
import { isSynthTrack, trackPatch } from "../library/synthTrack";

/** Your wavetables the project's synths play (D246). */
function projectTableIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const t of project.tracks)
    if (isSynthTrack(t))
      for (const id of tablesOf(trackPatch(t))) if (id.startsWith("user:")) ids.add(id);
  return [...ids];
}

const isBuiltIn = (id: string) => id.startsWith("kit:") || id.startsWith("demo:");

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    // audio is already compressed or doesn't compress well: store it, deflate the JSON
    zip(
      Object.fromEntries(
        Object.entries(files).map(([k, v]) => [k, [v, { level: k.endsWith(".json") ? 6 : 0 }]]),
      ),
      (err, data) => (err ? reject(err) : resolve(data)),
    ),
  );
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) =>
    unzip(data, (err, files) => (err ? reject(err) : resolve(files))),
  );
}

export async function exportRebeat(project: Project): Promise<Blob> {
  const ids = projectSampleIds(project).filter((id) => !isBuiltIn(id));
  const samples = (await db.samples.bulkGet(ids)).filter((s): s is SampleRecord => !!s);
  const files: Record<string, Uint8Array> = {
    "project.json": strToU8(JSON.stringify(serializeProject(project))),
    "samples.json": strToU8(JSON.stringify(samples)),
  };
  for (const s of samples) {
    const blob = await db.blobs.get(s.id);
    if (blob) files[`samples/${s.id}`] = new Uint8Array(await blob.blob.arrayBuffer());
  }
  // SoundFonts the tracks play (D82)
  for (const id of ids.filter((x) => x.startsWith("sf2:"))) {
    const blob = await db.blobs.get(id);
    if (blob) files[`soundfonts/${id.slice(4)}`] = new Uint8Array(await blob.blob.arrayBuffer());
  }
  // wavetables (D246)
  const tables = (await db.wavetables.bulkGet(projectTableIds(project))).filter(
    (t): t is WavetableRecord => !!t,
  );
  if (tables.length) files["wavetables.json"] = strToU8(JSON.stringify(tables));
  for (const t of tables) {
    const blob = await db.blobs.get(`wt:${t.id.slice(5)}`);
    if (blob) files[`wavetables/${t.id.slice(5)}`] = new Uint8Array(await blob.blob.arrayBuffer());
  }
  const bytes = await zipAsync(files);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/x-rebeat" });
}

/** Read a `.rebeat` file; its samples are added to the library (duplicates are skipped). */
export async function importRebeat(file: Blob): Promise<Project> {
  const files = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
  const json = files["project.json"];
  if (!json) throw new Error("Not a Rebeat project: project.json is missing.");
  const project = deserializeProject(JSON.parse(strFromU8(json)));
  const samples: SampleRecord[] = files["samples.json"]
    ? JSON.parse(strFromU8(files["samples.json"]))
    : [];
  for (const s of samples) {
    const audio = files[`samples/${s.id}`];
    if (!audio || (await db.samples.get(s.id))) continue;
    await db.transaction("rw", db.samples, db.blobs, async () => {
      await db.samples.put(s);
      await db.blobs.put({
        id: s.id,
        blob: new Blob([audio as Uint8Array<ArrayBuffer>], { type: s.mime }),
      });
    });
  }
  for (const [path, data] of Object.entries(files)) {
    if (!path.startsWith("soundfonts/")) continue;
    const id = `sf2:${path.slice(11)}`;
    if (!(await db.blobs.get(id)))
      await db.blobs.put({ id, blob: new Blob([data as Uint8Array<ArrayBuffer>]) });
  }
  const tables: WavetableRecord[] = files["wavetables.json"]
    ? JSON.parse(strFromU8(files["wavetables.json"]))
    : [];
  if (tables.length) {
    const { putWavetable } = await import("../library/wavetables");
    for (const t of tables) {
      const data = files[`wavetables/${t.id.slice(5)}`];
      if (data) await putWavetable(t.id, t.name, data);
    }
  }
  return project;
}

export function rebeatFileName(project: Project) {
  return `${project.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "project"}.rebeat`;
}
