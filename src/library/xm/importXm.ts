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
      data: encodeWav(s.channels, XM_RATE, 16),
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
  await setLevel(project);
  // through the schema, as a saved project is: every field checked and filled in
  return {
    project: deserializeProject(JSON.parse(JSON.stringify(serializeProject(project)))),
    notes,
  };
}

/** Where an imported song's mix sits (D291): the example songs' level, peaks below −1 dB. */
const TARGET_RMS_DB = -18;
const MAX_PEAK_DB = -1;

/**
 * FT2 sums its channels at its own amplification, so a module's level is anyone's guess: render
 * three of its sections offline (a quarter, half and three quarters in) and set every track's
 * fader so the song sits at the example songs' level.
 */
async function setLevel(project: Project) {
  const { renderProject } = await import("../../engine/render");
  const n = project.slots.length;
  const picks = [...new Set([0.25, 0.5, 0.75].map((f) => Math.min(n - 1, Math.floor(n * f))))];
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (const i of picks) {
    const b = await renderProject(project, {
      range: "section",
      slotId: project.slots[i].id,
      tail: 0,
      sampleRate: 22050,
    });
    for (let c = 0; c < b.numberOfChannels; c++)
      for (const x of b.getChannelData(c)) {
        sum += x * x;
        peak = Math.max(peak, Math.abs(x));
      }
    count += b.length * b.numberOfChannels;
  }
  if (!count || !sum) return;
  const rmsDb = 10 * Math.log10(sum / count);
  const gain = Math.min(
    10 ** ((TARGET_RMS_DB - rmsDb) / 20),
    peak > 0 ? 10 ** (MAX_PEAK_DB / 20) / peak : Infinity,
  );
  // a fader's gain is (position / 0.8)²: positions scale by the gain's square root, the faders'
  // and the level lanes' points alike (a volume slide is a lane, D289)
  const scale = Math.sqrt(Math.max(0.0025, gain));
  const fit = (v: number) => Math.max(0, Math.min(1, v * scale));
  for (const t of project.tracks) t.volume = Math.max(0.05, fit(t.volume));
  for (const lane of project.automation ?? [])
    if (/^track:[^:]+:volume$/.test(lane.target))
      for (const pt of lane.points) pt.value = fit(pt.value);
}
