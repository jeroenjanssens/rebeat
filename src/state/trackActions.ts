/** Creating and changing tracks from samples (library drops, kits, replace sound). */
import { guessCategory } from "../library/analysis";
import { loadSample, sampleName, useLibrary } from "../library/library";
import { KIT_SOUNDS } from "../engine/kits";
import { addTrack, makeTrack } from "../model/project";
import type { SoundCategory } from "../model/types";
import { useStore } from "./store";

function info(id: string) {
  const kit = KIT_SOUNDS.find((k) => k.id === id);
  if (kit)
    return {
      name: kit.name,
      category: (kit.category ?? "perc") as SoundCategory,
      bpm: kit.bpm,
      duration: 0,
    };
  const rec = useLibrary.getState().samples.find((s) => s.id === id);
  return {
    name: rec?.name ?? "Sample",
    category: guessCategory(rec?.name ?? ""),
    bpm: rec?.bpm,
    duration: rec?.duration ?? 0,
  };
}

function shortName(name: string) {
  return (
    name
      .replace(/^(\d{3}|Roland|Linn|Emu|Korg|Yamaha|Boss|Casio|Akai)\s*\S*\s+/i, "")
      .slice(0, 14) || name.slice(0, 14)
  );
}

/** New tracks for samples: loops become audio tracks, everything else drum tracks. */
export function addSampleTracks(ids: string[], index?: number, categories?: SoundCategory[]) {
  const s = useStore.getState();
  let at = index ?? s.project.tracks.length;
  const created: string[] = [];
  s.commit((p) => {
    ids.forEach((id, i) => {
      const { name, category, bpm, duration } = info(id);
      const loop = !!bpm && duration > 1.5;
      const t = makeTrack(
        loop ? "audio" : "drum",
        categories?.[i] ?? category,
        shortName(name),
        name,
      );
      t.sampleId = id;
      addTrack(p, t, at++);
      created.push(t.id);
      if (loop)
        for (const pattern of Object.values(p.patterns)) {
          const lane = pattern.lanes[t.id];
          if (lane.kind === "clip") lane.active = true;
        }
    });
  });
  for (const id of ids) void loadSample(id);
  if (created.length) s.setUi({ selectedTrackId: created[0] });
  return created;
}

export function replaceSound(trackId: string, sampleId: string) {
  void loadSample(sampleId);
  useStore.getState().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (!t) return;
    if (t.kind === "instrument") {
      // dropping a sample on an instrument track makes it a keyboard sampler
      t.instrument = { source: "sampler", preset: "sampler", sampleId, rootNote: 60 };
      t.source = `Sampler · ${sampleName(sampleId)}`;
      return;
    }
    t.sampleId = sampleId;
    t.source = sampleName(sampleId);
  });
}

export const SAMPLE_MIME = "application/x-rebeat-sample";
export const KIT_MIME = "application/x-rebeat-kit";
