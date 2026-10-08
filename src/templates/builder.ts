/** Helpers for writing templates and example songs as code. */
import { defaultBuses, defaultMaster, defaultPerf } from "../model/effects";
import { makePattern, makeTrack, type Project } from "../model/project";
import type { Effect, Pattern, SoundCategory, StepLane, StepSize, Track } from "../model/types";

export function emptyProject(name: string, bpm: number): Project {
  return {
    name,
    bpm,
    timeSignature: [4, 4],
    swing: 0.5,
    metronome: false,
    countIn: false,
    tracks: [],
    patterns: {},
    slots: [],
    buses: defaultBuses(),
    master: defaultMaster(),
    key: { root: 0, scale: "minor" },
    midiMappings: [],
    playMode: "song",
    perf: defaultPerf(),
  };
}

/** A drum track playing a built-in kit sound, e.g. drumTrack("Kick", "kit:808:kick", "808 Kick", "kick"). */
export function drumTrack(
  name: string,
  sampleId: string,
  source: string,
  category: SoundCategory,
  effects: Effect[] = [],
) {
  const t = makeTrack("drum", category, name, source, effects);
  t.sampleId = sampleId;
  return t;
}

/** An instrument track with a synth preset (see engine/instruments.ts). */
export function synthTrack(
  name: string,
  preset: string,
  source: string,
  category: SoundCategory,
  effects: Effect[] = [],
) {
  const t = makeTrack("instrument", category, name, source, effects);
  t.instrument = { source: "synth", preset };
  return t;
}

/** Add a page (after the tracks exist) and put it in the song order. */
export function page(
  p: Project,
  name: string,
  stepCount = 16,
  repeats = 1,
  stepSize: StepSize = "1/16",
): Pattern {
  const pattern = makePattern(p, name, stepCount);
  pattern.stepSize = stepSize;
  p.patterns[pattern.id] = pattern;
  p.slots.push({ id: `slot-${pattern.id}`, patternId: pattern.id, repeats });
  return pattern;
}

/**
 * Step strings: `.` off, `x` on, `X` accent, `o` soft, `p` 50% probability,
 * `r` ratchet ×3, `<`/`>` nudged early/late, `c` condition 1:2, `l` parameter lock.
 * Spaces are ignored (use them to group beats).
 */
export function drum(pattern: Pattern, track: Track, code: string) {
  const lane = pattern.lanes[track.id] as StepLane;
  [...code.replace(/\s/g, "")].forEach((ch, i) => {
    if (ch === ".") return;
    const s = lane.steps[i];
    s.on = true;
    s.velocity = 0.8;
    if (ch === "X") s.accent = true;
    if (ch === "X") s.velocity = 1;
    if (ch === "o") s.velocity = 0.42;
    if (ch === "p") s.probability = 0.5;
    if (ch === "r") s.ratchet = 3;
    if (ch === "<") s.nudge = -0.2;
    if (ch === ">") s.nudge = 0.2;
    if (ch === "c") s.condition = "1:2";
    if (ch === "l") s.locks = { "sound.tune": 0.6, "sound.decay": 0.5 };
  });
}

/** Notes: [step, midi notes, length in steps, slide?] */
export function notes(
  pattern: Pattern,
  track: Track,
  list: [number, number[], number, boolean?][],
  velocity = 0.75,
) {
  const lane = pattern.lanes[track.id] as StepLane;
  for (const [i, n, length, slide] of list) {
    const s = lane.steps[i];
    s.on = true;
    s.velocity = velocity;
    s.notes = n.map((pitch) => ({ pitch, length, velocity, ...(slide ? { slide } : {}) }));
  }
}

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  dim: [0, 3, 6],
};

/** The pitch class of a note name ("F#", "Bb"). */
export function pitchOf(name: string): number {
  const base = PITCH[name[0]];
  const acc = name.slice(1).replace(/[^#b]/g, "");
  return (base + (acc === "#" ? 1 : acc === "b" ? -1 : 0) + 12) % 12;
}

/** A chord by name ("Dm", "F#m7", "Ab", "C/G"), voiced from the root in the given octave (C4 = 60). */
export function chord(name: string, octave = 4): number[] {
  const [main, bass] = name.split("/");
  const m = /^([A-G][#b]?)(.*)$/.exec(main)!;
  const root = 12 * (octave + 1) + pitchOf(m[1]);
  const tones = (QUALITY[m[2]] ?? QUALITY[""]).map((i) => root + i);
  if (bass) tones.unshift(12 * octave + pitchOf(bass));
  return tones;
}

/** A single note by name and octave ("F#", 2) → MIDI. */
export function note(name: string, octave: number): number {
  return 12 * (octave + 1) + pitchOf(name);
}
