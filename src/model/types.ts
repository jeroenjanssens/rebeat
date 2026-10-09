import type { SynthPatch } from "./synth";
/**
 * How a step track plays (D93): single hits on its steps, notes and chords, or its sample as a
 * clip across the page.
 */
export type TrackMode = "hits" | "notes" | "clip";

export type SoundCategory =
  "kick" | "snare" | "clap" | "hat" | "perc" | "tom" | "bass" | "keys" | "vocal" | "fx";

export type StepSize = "1/4" | "1/8" | "1/8T" | "1/16" | "1/16T" | "1/32";

export interface Step {
  on: boolean;
  velocity: number; // 0..1
  probability: number; // 0..1
  nudge: number; // -0.5..0.5 of a step
  ratchet: number; // 1..8
  pitch: number; // semitones, in Hits mode
  gate: number; // 0..1 of a step, in Hits mode (notes have their own length)
  accent: boolean;
  condition?: string; // e.g. "1:2", "FILL"
  locked?: boolean; // legacy flag (mockup demo)
  /** Parameter locks: this step's own values for the track's sound parameters ("sound.tune"…). */
  locks?: Record<string, number>;
  /** Notes mode: the notes starting on this step (a chord when several). Kept in Hits mode. */
  notes?: Note[];
}

export interface Note {
  pitch: number; // MIDI, middle C = 60 = C4
  length: number; // in steps
  velocity: number; // 0..1
  /** 303-style glide into this note (mono synths). */
  slide?: boolean;
}

/**
 * A track's part on one page. Every lane has steps (Hits and Notes) and may have clip settings
 * (Clip), so switching a track's mode keeps both (D93).
 */
export interface Lane {
  steps: Step[]; // always MAX_STEPS long; steps beyond the count are kept, just hidden
  stepCountOverride?: number;
  /** The track's own step size on this page (polyrhythms); default = the page's. */
  stepSizeOverride?: StepSize;
  /** The track's own swing (0.5..0.75); default = page/global swing. */
  swingOverride?: number;
  /** Clip mode: whether the clip plays on this page, and how. */
  clip?: ClipSettings;
}

export interface ClipSettings {
  active: boolean;
  launchMode: "loop" | "oneshot";
}

/** Clip settings of a lane (a lane without them plays its clip, looped). */
export const clipOf = (lane: Lane): ClipSettings =>
  lane.clip ?? { active: true, launchMode: "loop" };

export interface Track {
  id: string;
  name: string;
  /** How the track plays: Hits, Notes or Clip (D93). */
  mode: TrackMode;
  category: SoundCategory;
  color: string;
  source: string; // the sound's name, for display
  /** What makes its sound (D94); none = silent (an empty Clip track). */
  sound?: Sound;
  /** Hits mode with a synth or sampled instrument: the note each hit plays (plus the step's pitch). */
  hitNote?: number;
  mute: boolean;
  solo: boolean;
  arm: boolean;
  volume: number; // 0..1 fader position
  params: Record<string, number>; // encoder values keyed by parameter id
  effects: Effect[];
  /** Clip mode: overdub layers recorded on top of the clip. */
  layers?: ClipLayer[];
  /** Notes mode: transpose in semitones. */
  transpose?: number;
  arp?: Arpeggiator;
}

export interface Arpeggiator {
  on: boolean;
  mode: "up" | "down" | "updown" | "random" | "played";
  rate: StepSize;
  octaves: number;
  /** Note length as a share of the arp step (0..1). */
  gate: number;
}

export interface Effect {
  /** Stable id (for reordering); older projects may not have one. */
  id?: string;
  name: string;
  params: Record<string, number>;
  bypass?: boolean;
}

/**
 * What makes a step track's sound (D94), in three families: a sample (`sample`), a synth
 * (`synth`), or a sampled instrument (`smplr`: streamed, `sf2`: a SoundFont, `multi`: your own
 * multi-sample).
 */
export type SoundSource = "sample" | "synth" | "smplr" | "sf2" | "multi";
export type SoundFamily = "sample" | "synth" | "instrument";

export interface Sound {
  source: SoundSource;
  /** Synth preset id, smplr instrument name, or the instrument inside a SoundFont. */
  preset?: string;
  /** Synths: the track's own (edited) patch; without one, the factory synth `preset` (D79). */
  patch?: SynthPatch;
  /** The sound's name when it isn't a factory one (edited or from your library). */
  name?: string;
  /** The library sound it came from ("user:<id>"), for Used in project. */
  from?: string;
  /** Samples: the sample. SoundFonts: the .sf2 file. */
  sampleId?: string;
  /** Samples and multi-samples in Notes mode: the note that plays them at their own pitch. */
  rootNote?: number;
  /** Multi-samples (D82): samples at their notes; each note plays from the nearest. */
  zones?: { note: number; sampleId: string }[];
}

export const soundFamily = (s: Sound): SoundFamily =>
  s.source === "sample" ? "sample" : s.source === "synth" ? "synth" : "instrument";

export interface ClipLayer {
  id: string;
  sampleId: string;
  gain: number;
  mute: boolean;
}

export interface Pattern {
  id: string;
  name: string;
  linkColor: string;
  stepCount: number;
  stepSize: StepSize;
  /** Page swing (0.5..0.75); undefined = follow the project swing. */
  swing?: number;
  lanes: Record<string, Lane>;
  /** The page's own key (overrides the project key). */
  keyOverride?: { root: number; scale: string };
  /** Transpose instrument tracks on this page, in semitones. */
  transpose?: number;
}

export interface PageSlot {
  id: string;
  patternId: string;
  repeats: number;
}

export const MAX_STEPS = 128;
export const STEP_COUNT_PRESETS = [8, 12, 16, 24, 32, 48, 64];
export const STEP_SIZES: StepSize[] = ["1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"];

/** Length of a step in quarter notes. */
export const STEP_SIZE_QUARTERS: Record<StepSize, number> = {
  "1/4": 1,
  "1/8": 1 / 2,
  "1/8T": 1 / 3,
  "1/16": 1 / 4,
  "1/16T": 1 / 6,
  "1/32": 1 / 8,
};

/**
 * A step's velocity (D75). Notes carry their own velocity, so on note steps it's the loudest
 * note's; on hits it's the step's.
 */
export function stepVelocity(s: Step): number {
  return s.notes?.length ? Math.max(...s.notes.map((n) => n.velocity)) : s.velocity;
}

/** Set a step's velocity; the notes follow, keeping a chord's balance (the loudest gets `v`). */
export function setStepVelocity(s: Step, v: number) {
  const top = stepVelocity(s);
  s.velocity = v;
  for (const n of s.notes ?? []) n.velocity = top > 0 ? Math.min(1, (n.velocity * v) / top) : v;
}

export function emptyStep(): Step {
  return {
    on: false,
    velocity: 0.8,
    probability: 1,
    nudge: 0,
    ratchet: 1,
    pitch: 0,
    gate: 1,
    accent: false,
  };
}

export function laneLength(lane: Lane, pattern: Pattern): number {
  return lane.stepCountOverride ?? pattern.stepCount;
}
