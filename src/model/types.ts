export type TrackKind = "drum" | "instrument" | "audio";

export type SoundCategory =
  "kick" | "snare" | "clap" | "hat" | "perc" | "tom" | "bass" | "keys" | "vocal" | "fx";

export type StepSize = "1/4" | "1/8" | "1/8T" | "1/16" | "1/16T" | "1/32";

export interface Step {
  on: boolean;
  velocity: number; // 0..1
  probability: number; // 0..1
  nudge: number; // -0.5..0.5 of a step
  ratchet: number; // 1..8
  pitch: number; // semitones, drum tracks
  gate: number; // 0..1 of a step (drum) / unused for notes
  accent: boolean;
  condition?: string; // e.g. "1:2", "FILL"
  locked?: boolean; // has a parameter lock
  /** Instrument tracks: the notes starting on this step (a chord when several). */
  notes?: Note[];
}

export interface Note {
  pitch: number; // MIDI, middle C = 60 = C4
  length: number; // in steps
  velocity: number; // 0..1
  /** 303-style glide into this note (mono synths). */
  slide?: boolean;
}

export interface StepLane {
  kind: "steps";
  steps: Step[]; // always MAX_STEPS long; steps beyond the count are kept, just hidden
  stepCountOverride?: number;
  /** The track's own step size on this page (polyrhythms); default = the page's. */
  stepSizeOverride?: StepSize;
  /** The track's own swing (0.5..0.75); default = page/global swing. */
  swingOverride?: number;
}

export interface ClipLane {
  kind: "clip";
  active: boolean;
  launchMode: "loop" | "oneshot";
}

export type Lane = StepLane | ClipLane;

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  category: SoundCategory;
  color: string;
  source: string; // sample or instrument preset name, for display
  sampleId?: string;
  mute: boolean;
  solo: boolean;
  arm: boolean;
  volume: number; // 0..1 fader position
  params: Record<string, number>; // encoder values keyed by parameter id
  effects: Effect[];
  /** Instrument tracks: the sound source (synth preset, keyboard sampler or sampled instrument). */
  instrument?: InstrumentSource;
  /** Audio tracks: overdub layers recorded on top of the clip. */
  layers?: ClipLayer[];
  /** Instrument tracks: transpose in semitones. */
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

export interface InstrumentSource {
  source: "synth" | "sampler" | "smplr";
  /** Synth preset id or smplr instrument name. */
  preset: string;
  /** Keyboard sampler: the sample and the note it was recorded at. */
  sampleId?: string;
  rootNote?: number;
}

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

export function laneLength(lane: StepLane, pattern: Pattern): number {
  return lane.stepCountOverride ?? pattern.stepCount;
}
