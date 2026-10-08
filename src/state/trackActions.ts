/** Creating and changing tracks from samples (library drops, kits, replace sound). */
import { guessCategory } from "../library/analysis";
import { loadSample, sampleName, useLibrary } from "../library/library";
import { KIT_SOUNDS } from "../engine/kits";
import { addTrack, convertTrack, makeTrack } from "../model/project";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import type { CatalogInstrument } from "../library/instruments";
import type { InstrumentSource, SoundCategory, Track } from "../model/types";
import { defaultInstrument, instrumentName } from "../engine/instruments";
import { convertSynthKnobs, resetMacros } from "../library/synthTrack";
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

/** What a track plays, for labels: its sample, or its instrument's name. */
export function soundLabel(track: Track): string {
  if (track.kind !== "instrument")
    return track.source || (track.sampleId ? sampleName(track.sampleId) : "");
  const src = track.instrument ?? defaultInstrument(track);
  return src.source === "sampler" ? `Sampler · ${sampleName(src.sampleId)}` : instrumentName(src);
}

/** Give an instrument track another sound source (synth preset, sampled instrument, sampler). */
export function setInstrument(trackId: string, next: InstrumentSource) {
  if (next.sampleId) void loadSample(next.sampleId);
  useStore.getState().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (!t) return;
    t.instrument = next;
    t.source = soundLabel({ ...t, instrument: next } as Track);
    // a new synth's macros start where it rests them
    resetMacros(t);
  });
}

export function replaceSound(trackId: string, sampleId: string) {
  void loadSample(sampleId);
  useStore.getState().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (!t) return;
    if (t.kind === "instrument") {
      // a sample on an instrument track makes it a keyboard sampler (keeping its root note)
      const root = t.instrument?.source === "sampler" ? (t.instrument.rootNote ?? 60) : 60;
      t.instrument = { source: "sampler", preset: "sampler", sampleId, rootNote: root };
      t.source = `Sampler · ${sampleName(sampleId)}`;
      return;
    }
    t.sampleId = sampleId;
    t.source = sampleName(sampleId);
  });
}

export const SAMPLE_MIME = "application/x-rebeat-sample";
export const KIT_MIME = "application/x-rebeat-kit";

/** Dragging an instrument from the library: its catalog id (D78). */
export const INSTRUMENT_MIME = "application/x-rebeat-instrument";

/** The track settings that come with a library instrument: its source, SOUND knobs, effects. */
function applyEntry(t: Track, c: CatalogInstrument) {
  t.instrument = structuredClone(c.source);
  t.source = c.name;
  // what you heard in the library: the SOUND knobs at rest (the filter open) or the saved ones
  for (const k of Object.keys(t.params)) if (k.startsWith("sound.")) delete t.params[k];
  for (const [k, v] of Object.entries(defaultParams(SOUND_PARAMS.instrument)))
    t.params[`sound.${k}`] = v;
  Object.assign(t.params, c.params ?? {});
  // instruments saved before the SOUND knobs became a synth's macros
  convertSynthKnobs(t);
  if (c.effects) t.effects = structuredClone(c.effects);
}

/** Play a library instrument on a track; drum and audio tracks become instrument tracks. */
export function playInstrumentOn(trackId: string, c: CatalogInstrument) {
  useStore.getState().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (!t) return;
    if (t.kind !== "instrument") convertTrack(p, trackId, "instrument", sampleName);
    applyEntry(t, c);
  });
}

/** A new instrument track playing a library instrument. */
export function addInstrumentTrack(c: CatalogInstrument, index?: number) {
  const track = makeTrack("instrument", c.low ? "bass" : "keys", c.name, c.name);
  applyEntry(track, c);
  useStore.getState().commit((p) => addTrack(p, track, index));
  useStore.getState().setUi({ selectedTrackId: track.id });
}
