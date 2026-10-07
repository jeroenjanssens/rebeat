const NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NAMES_FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

/** Middle C (MIDI 60) = C4. */
export function noteName(midi: number, flats = false): string {
  const names = flats ? NAMES_FLAT : NAMES_SHARP;
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function pitchClassName(midi: number, flats = false): string {
  return (flats ? NAMES_FLAT : NAMES_SHARP)[midi % 12];
}

const CHORD_SHAPES: [number[], string][] = [
  [[0, 4, 7], ""],
  [[0, 3, 7], "m"],
  [[0, 3, 6], "dim"],
  [[0, 4, 8], "aug"],
  [[0, 4, 7, 11], "maj7"],
  [[0, 3, 7, 10], "m7"],
  [[0, 4, 7, 10], "7"],
  [[0, 2, 7], "sus2"],
  [[0, 5, 7], "sus4"],
];

/** A short label for a step's notes: a note name, a chord name, or "C4+2". */
export function notesLabel(notes: number[], flats = false): string {
  if (notes.length === 0) return "";
  if (notes.length === 1) return noteName(notes[0], flats);
  const sorted = [...notes].sort((a, b) => a - b);
  const classes = [...new Set(sorted.map((n) => n % 12))];
  for (const root of classes) {
    const intervals = classes.map((c) => (c - root + 12) % 12).sort((a, b) => a - b);
    for (const [shape, suffix] of CHORD_SHAPES) {
      if (shape.length === intervals.length && shape.every((v, i) => v === intervals[i])) {
        return pitchClassName(root, flats) + suffix;
      }
    }
  }
  return `${noteName(sorted[0], flats)}+${sorted.length - 1}`;
}

/** Pitches of a step's notes, low to high. */
export function stepPitches(step: { notes?: { pitch: number }[] }): number[] {
  return (step.notes ?? []).map((n) => n.pitch).sort((a, b) => a - b);
}

/** The longest note of a step, in steps (ties are drawn up to here). */
export function stepNoteLength(step: { notes?: { length: number }[] }): number {
  return Math.max(0, ...(step.notes ?? []).map((n) => n.length));
}

export const SCALES: Record<string, { name: string; steps: number[] }> = {
  major: { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: "Minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: "Phrygian", steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  harmonicMinor: { name: "Harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11] },
  pentMajor: { name: "Pentatonic major", steps: [0, 2, 4, 7, 9] },
  pentMinor: { name: "Pentatonic minor", steps: [0, 3, 5, 7, 10] },
  blues: { name: "Blues", steps: [0, 3, 5, 6, 7, 10] },
  chromatic: { name: "Chromatic", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export interface Key {
  root: number; // 0 = C
  scale: string;
}

export function scaleSteps(key: Key) {
  return (SCALES[key.scale] ?? SCALES.minor).steps;
}

export function inKey(midi: number, key: Key): boolean {
  return scaleSteps(key).includes((((midi - key.root) % 12) + 12) % 12);
}

/** Flats or sharps, following the key signature (E♭ in C minor, D♯ in E major). */
export function keyUsesFlats(key: Key): boolean {
  // the relative major decides: F, B♭, E♭, A♭, D♭ and G♭ major are written with flats
  const offset: Record<string, number> = { dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7 };
  const minor = ["minor", "harmonicMinor", "pentMinor", "blues"].includes(key.scale);
  const major = (key.root - (minor ? 9 : (offset[key.scale] ?? 0)) + 24) % 12;
  return [5, 10, 3, 8, 1, 6].includes(major);
}

export function keyName(key: Key): string {
  return `${pitchClassName(key.root, keyUsesFlats(key))} ${SCALES[key.scale]?.name.toLowerCase() ?? key.scale}`;
}

/** The nearest pitch in the key (for scale lock); ties go down. */
export function snapToKey(midi: number, key: Key): number {
  for (let d = 0; d < 12; d++) {
    if (inKey(midi - d, key)) return midi - d;
    if (inKey(midi + d, key)) return midi + d;
  }
  return midi;
}

/** A diatonic chord on a note: a triad or a seventh chord stacked in thirds within the key. */
export function chordInKey(midi: number, key: Key, size: 3 | 4): number[] {
  const root = snapToKey(midi, key);
  const steps = scaleSteps(key);
  if (steps.length < 7) return [root, root + 7, ...(size === 4 ? [root + 12] : [])];
  const pc = (((root - key.root) % 12) + 12) % 12;
  const degree = steps.indexOf(pc);
  const out: number[] = [];
  for (let k = 0; k < size; k++) {
    const d = degree + k * 2;
    out.push(root - pc + steps[d % 7] + Math.floor(d / 7) * 12);
  }
  return out;
}

/** Arpeggio note order. */
export function arpOrder(pitches: number[], mode: string, octaves: number): number[] {
  const up: number[] = [];
  for (let o = 0; o < Math.max(1, octaves); o++) for (const p of pitches) up.push(p + o * 12);
  if (mode === "down") return [...up].reverse();
  if (mode === "updown") return up.length > 2 ? [...up, ...up.slice(1, -1).reverse()] : up;
  if (mode === "played") return pitches;
  return up;
}

/** C natural minor, the key used by the mockup. */
export const KEY_ROOT = 0;
export const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];

export function inScale(midi: number, root = KEY_ROOT, scale = SCALE_MINOR): boolean {
  return scale.includes((midi - root + 120) % 12);
}
