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
  notes?: number[]; // MIDI notes, instrument tracks
  length?: number; // note length in steps, instrument tracks
  slide?: boolean;
}

export interface StepLane {
  kind: "steps";
  steps: Step[]; // always MAX_STEPS long; steps beyond the count are kept, just hidden
  stepCountOverride?: number;
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
  effects: { name: string; params: Record<string, number> }[];
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
