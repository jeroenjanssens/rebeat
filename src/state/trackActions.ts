/** Creating step tracks and changing their sound (library drops, kits, replace sound). */
import { guessCategory } from "../library/analysis";
import { loadSample, sampleName, useLibrary } from "../library/library";
import { KIT_SOUNDS } from "../engine/kits";
import { addTrack, makeTrack, setMode } from "../model/project";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import type { CatalogInstrument } from "../library/instruments";
import type { Sound, SoundCategory, Track } from "../model/types";
import { instrumentName, voiceSound } from "../engine/instruments";
import { convertSynthKnobs, resetMacros } from "../library/synthTrack";
import { defaultMode, player } from "../model/tracks";
import type { Project } from "../model/project";
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

/** New step tracks for samples: loops play as clips, everything else as hits. */
export function addSampleTracks(ids: string[], index?: number, categories?: SoundCategory[]) {
  const s = useStore.getState();
  let at = index ?? s.project.tracks.length;
  const created: string[] = [];
  s.commit((p) => {
    ids.forEach((id, i) => {
      const { name, category, bpm, duration } = info(id);
      const sound: Sound = { source: "sample", sampleId: id };
      const mode = defaultMode(sound, !!bpm && duration > 1.5);
      const t = makeTrack(mode, categories?.[i] ?? category, shortName(name), name, [], sound);
      addTrack(p, t, at++);
      created.push(t.id);
      if (mode === "clip")
        for (const pattern of Object.values(p.patterns))
          pattern.lanes[t.id].clip = { active: true, launchMode: "loop" };
    });
  });
  for (const id of ids) void loadSample(id);
  if (created.length) s.setUi({ selectedTrackId: created[0] });
  return created;
}

/** What a track plays, for labels: its sample's name, or its instrument's. */
export function soundLabel(track: Track): string {
  const src = track.sound;
  if (!src || src.source === "sample")
    return track.source || (src?.sampleId ? sampleName(src.sampleId) : "");
  return instrumentName(track.mode === "clip" ? src : voiceSound(track));
}

/** The SOUND knobs a track needs now (another sound or mode): defaults where it has none. */
function fillSoundKnobs(t: Track) {
  for (const [k, v] of Object.entries(defaultParams(SOUND_PARAMS[player(t)])))
    t.params[`sound.${k}`] ??= v;
}

/** In a recipe: play `sound` on a step track, keeping its mode when the sound can (D93). */
function putSound(p: Project, t: Track, sound: Sound) {
  const wasSynth = t.sound?.source === "synth";
  t.sound = sound;
  if (t.mode === "clip" && sound.source !== "sample") setMode(p, t.id, "notes");
  // a new synth's macros start where it rests them
  if (wasSynth || sound.source === "synth") resetMacros(t);
  fillSoundKnobs(t);
  t.source = soundLabel(t);
}

/** Give a step track another sound (a synth preset, a sampled instrument, a sample…). */
export function setSound(trackId: string, next: Sound) {
  if (next.sampleId) void loadSample(next.sampleId);
  useStore.getState().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (t) putSound(p, t, structuredClone(next));
  });
}

/** Replace a step track's sound with a sample (its mode stays: samples play in every mode). */
export function replaceSound(trackId: string, sampleId: string) {
  void loadSample(sampleId);
  useStore.getState().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (!t) return;
    // in Notes mode, a sample replacing a sample keeps its root note
    const root = t.sound?.source === "sample" ? t.sound.rootNote : undefined;
    putSound(p, t, { source: "sample", sampleId, ...(root ? { rootNote: root } : {}) });
    t.source = sampleName(sampleId);
  });
}

export const SAMPLE_MIME = "application/x-rebeat-sample";
export const KIT_MIME = "application/x-rebeat-kit";

/** Dragging an instrument from the library: its catalog id (D78). */
export const INSTRUMENT_MIME = "application/x-rebeat-instrument";

/** The track settings that come with a library sound: the sound, its SOUND knobs, its effects. */
function applyEntry(p: Project | null, t: Track, c: CatalogInstrument) {
  if (p) putSound(p, t, structuredClone(c.source));
  else t.sound = structuredClone(c.source);
  t.source = c.name;
  // what you heard in the library: the SOUND knobs at rest (the filter open) or the saved ones
  for (const k of Object.keys(t.params)) if (k.startsWith("sound.")) delete t.params[k];
  fillSoundKnobs(t);
  Object.assign(t.params, c.params ?? {});
  // instruments saved before the SOUND knobs became a synth's macros
  convertSynthKnobs(t);
  if (c.effects) t.effects = structuredClone(c.effects);
}

/** Play a library sound on a step track (keeping its mode where the sound has it, D93). */
export function playInstrumentOn(trackId: string, c: CatalogInstrument) {
  useStore.getState().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (t) applyEntry(p, t, c);
  });
}

/** A new step track playing a library sound, in the sound's own mode. */
export function addInstrumentTrack(c: CatalogInstrument, index?: number): string {
  const track = makeTrack(defaultMode(c.source), c.low ? "bass" : "keys", c.name, c.name);
  applyEntry(null, track, c);
  useStore.getState().commit((p) => addTrack(p, track, index));
  useStore.getState().setUi({ selectedTrackId: track.id });
  return track.id;
}
