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

/** C natural minor, the key used by the mockup. */
export const KEY_ROOT = 0;
export const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];

export function inScale(midi: number, root = KEY_ROOT, scale = SCALE_MINOR): boolean {
  return scale.includes((midi - root + 120) % 12);
}
