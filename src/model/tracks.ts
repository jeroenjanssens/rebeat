/**
 * Step tracks (D93): every track has a sound and a mode. These helpers answer the questions the
 * old track kinds used to: how a track plays, what it plays, and which part of the engine plays it.
 */
import type { Sound, SoundFamily, Track, TrackMode } from "./types";
import { soundFamily } from "./types";

export const isHits = (t: Track) => t.mode === "hits";
export const isNotes = (t: Track) => t.mode === "notes";
export const isClip = (t: Track) => t.mode === "clip";

/** Whether a track plays its steps (Hits and Notes; a Clip track keeps them, hidden). */
export const stepped = (p: { tracks: Track[] }, trackId: string) =>
  p.tracks.some((t) => t.id === trackId && t.mode !== "clip");

/** The sample a track plays (samples only; not a SoundFont's file or a multi-sample's zones). */
export const sampleOf = (t: Pick<Track, "sound">): string | undefined =>
  t.sound?.source === "sample" ? t.sound.sampleId : undefined;

export const familyOf = (t: Track): SoundFamily | undefined =>
  t.sound ? soundFamily(t.sound) : undefined;

/**
 * Which part of the engine plays a track: one-shot hits of its sample (`drum`), an instrument
 * voice for notes, and for hits of a synth or sampled instrument (`voice`), or its clip (`clip`).
 * It also picks the SOUND knobs (SOUND_PARAMS).
 */
export type Player = "drum" | "voice" | "clip";

export function player(t: Pick<Track, "mode" | "sound">): Player {
  if (t.mode === "clip") return "clip";
  if (t.mode === "hits" && (!t.sound || t.sound.source === "sample")) return "drum";
  return "voice";
}

/** Clip mode is for samples (or a track without a sound yet, waiting for a recording). */
export const canClip = (s: Sound | undefined) => !s || s.source === "sample";

/** The mode a new track gets for a sound: one-shots hit, loops play as clips, the rest notes. */
export function defaultMode(s: Sound | undefined, loop = false): TrackMode {
  if (!s || s.source === "sample") return loop ? "clip" : "hits";
  return "notes";
}

/** The note a sample (or multi-sample) plays at its own pitch in Notes mode. */
export const rootOf = (s: Sound | undefined) => s?.rootNote ?? 60;

/**
 * The note each hit plays on a voice (a synth or sampled instrument in Hits mode, D93), before the
 * step's pitch: the track's own, else the sound's root, else C2 for basses and C4 for the rest.
 */
export function hitNoteOf(t: Track): number {
  if (t.hitNote !== undefined) return t.hitNote;
  if (t.sound?.source === "sample" || t.sound?.source === "multi") return rootOf(t.sound);
  return t.category === "bass" ? 36 : 60;
}
