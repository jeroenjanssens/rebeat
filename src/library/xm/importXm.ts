/**
 * Loading a Fast Tracker 2 module (D279): read it, make the project, put its samples in the
 * library (Library → FT2 → the song) and point the tracks at them. Loaded lazily (the import).
 */
import { deserializeProject, serializeProject } from "../../model/schema";
import type { Project } from "../../model/project";
import { importItems } from "../library";
import { encodeWav } from "../wav";
import { convertXm, XM_RATE } from "./convert";
import { parseXm } from "./parse";

export async function importXm(file: File): Promise<{ project: Project; notes: string[] }> {
  const mod = parseXm(await file.arrayBuffer());
  const { project, samples, notes } = convertXm(mod, file.name);
  const folder = `FT2/${project.name.replace(/\//g, "-")}`;
  const ids = await importItems(
    samples.map((s) => ({
      name: `${s.name.replace(/[/\\]/g, "-") || "sample"}.wav`,
      data: encodeWav([s.pcm], XM_RATE, 16),
      folder,
    })),
  );
  const real = new Map(samples.map((s, i) => [s.key, ids[i]]));
  for (const t of project.tracks) {
    const sound = t.sound;
    if (!sound) continue;
    if (sound.sampleId) sound.sampleId = real.get(sound.sampleId) ?? undefined;
    if (sound.zones)
      sound.zones = sound.zones.flatMap((z) => {
        const id = real.get(z.sampleId);
        return id ? [{ ...z, sampleId: id }] : [];
      });
  }
  // through the schema, as a saved project is: every field checked and filled in
  return {
    project: deserializeProject(JSON.parse(JSON.stringify(serializeProject(project)))),
    notes,
  };
}
