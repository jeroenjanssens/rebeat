/**
 * Converting a beatbox take into step tracks (D115): one Hits track per class, on the current
 * page (or new pages for Keep every bar), playing your own hit or a kit sound. The take's Clip
 * track is muted, and the whole conversion is one undo step.
 */
import { importItems, loadSample } from "../library/library";
import { encodeWav } from "../library/wav";
import { addTrack, makeTrack, newSlot, slotPattern } from "../model/project";
import { sampleOf } from "../model/tracks";
import type { Sound, SoundCategory, StepSize } from "../model/types";
import { CLASS_INFO, type BeatboxClass } from "../library/beatbox/classes";
import type { ConvertResult } from "../library/beatbox/convert";
import type { BeatboxHit, BeatboxRecording } from "../library/beatbox/dataset";
import { audioOf } from "../library/beatbox/store";
import { useStore } from "./store";

const CATEGORY: Record<BeatboxClass, SoundCategory> = {
  kick: "kick",
  snare: "snare",
  hihat: "hat",
  openhat: "hat",
  tom: "tom",
  clap: "clap",
  crash: "perc",
  other: "vocal",
};

/** What each class plays: your own hit (a hit of the take), a kit sound or any library sample. */
export type ClassSound = { kind: "own"; hitId: string } | { kind: "sample"; sampleId: string };

/** Cut one hit out of the take as a sample, with short fades, into the library. */
async function cutHit(rec: BeatboxRecording, hit: BeatboxHit, name: string) {
  const a = audioOf(rec.id);
  if (!a) throw new Error("The take's audio isn't loaded.");
  const sr = a.buffer.sampleRate;
  const from = Math.max(0, Math.round((hit.start - 0.003) * sr));
  const to = Math.min(a.buffer.length, Math.round(hit.end * sr));
  const fadeIn = Math.round(0.002 * sr);
  const fadeOut = Math.min(Math.round(0.015 * sr), Math.floor((to - from) / 2));
  const channels = Array.from({ length: a.buffer.numberOfChannels }, (_, c) => {
    const out = a.buffer.getChannelData(c).slice(from, to);
    for (let i = 0; i < fadeIn && i < out.length; i++) out[i] *= i / fadeIn;
    for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= i / fadeOut;
    return out;
  });
  const [id] = await importItems([
    {
      name: `${name}.wav`,
      data: encodeWav(channels, sr, 24),
      folder: `Beatbox/${rec.name}`,
      tags: ["beatbox"],
    },
  ]);
  if (!id) throw new Error("The hit couldn't be saved as a sample.");
  return id;
}

/** Make the tracks. Returns their ids (in class order). */
export async function createTracks(
  rec: BeatboxRecording,
  result: ConvertResult,
  sounds: Partial<Record<BeatboxClass, ClassSound>>,
  stepSize: StepSize,
  hits: BeatboxHit[],
): Promise<string[]> {
  const classes = (Object.keys(CLASS_INFO) as BeatboxClass[]).filter((c) =>
    result.pages.some((p) => p[c]?.some(Boolean)),
  );
  const sampleIds: Partial<Record<BeatboxClass, string>> = {};
  for (const c of classes) {
    const s = sounds[c];
    if (!s) continue;
    if (s.kind === "sample") sampleIds[c] = s.sampleId;
    else {
      const hit = hits.find((h) => h.id === s.hitId);
      if (hit) sampleIds[c] = await cutHit(rec, hit, `${rec.name} ${CLASS_INFO[c].name}`);
    }
  }
  for (const id of Object.values(sampleIds)) void loadSample(id);

  const s = useStore.getState();
  const created: string[] = [];
  const takeSample = "sampleId" in rec.audio ? rec.audio.sampleId : undefined;
  s.commit((p) => {
    // the pages: the one being edited, then new ones after it for every further page
    const slotIds = [s.editSlotId];
    for (let i = 1; i < result.pages.length; i++)
      slotIds.push(newSlot(p, slotIds[slotIds.length - 1]));
    let at = p.tracks.length;
    for (const c of classes) {
      const sampleId = sampleIds[c];
      const sound: Sound | undefined = sampleId ? { source: "sample", sampleId } : undefined;
      const name = CLASS_INFO[c].short;
      const t = makeTrack(
        "hits",
        CATEGORY[c],
        name,
        `${rec.name} · ${CLASS_INFO[c].name}`,
        [],
        sound,
      );
      t.color = CLASS_INFO[c].color;
      addTrack(p, t, at++);
      created.push(t.id);
      result.pages.forEach((page, i) => {
        const pattern = slotPattern(p, slotIds[i]);
        const lane = pattern.lanes[t.id];
        if (pattern.stepCount !== result.length) lane.stepCountOverride = result.length;
        if (pattern.stepSize !== stepSize) lane.stepSizeOverride = stepSize;
        page[c]?.forEach((step, j) => {
          if (!step) return;
          Object.assign(lane.steps[j], {
            on: true,
            velocity: Math.round(step.velocity * 100) / 100,
            nudge: Math.round(step.nudge * 100) / 100,
          });
        });
      });
    }
    // the take's own Clip track goes quiet, so you hear the new tracks
    if (takeSample)
      for (const t of p.tracks) if (t.mode === "clip" && sampleOf(t) === takeSample) t.mute = true;
  });
  if (created.length) s.setUi({ selectedTrackId: created[0] });
  return created;
}
