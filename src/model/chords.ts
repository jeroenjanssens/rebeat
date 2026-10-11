/**
 * The chord a set of notes makes (D135), for the Controller panel's "A3 + C4 + E4 = Am". Pure:
 * pitch classes against known chord shapes, every note tried as the root; a bass that isn't
 * the root is written as an inversion ("C/E").
 */

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** Chord shapes as semitones above the root, and their suffix ("" = major). Fuller ones first. */
const SHAPES: [number[], string][] = [
  [[0, 4, 7, 11, 14], "maj9"],
  [[0, 3, 7, 10, 14], "m9"],
  [[0, 4, 7, 10, 14], "9"],
  [[0, 4, 7, 11], "maj7"],
  [[0, 3, 7, 10], "m7"],
  [[0, 4, 7, 10], "7"],
  [[0, 3, 6, 10], "m7♭5"],
  [[0, 3, 6, 9], "dim7"],
  [[0, 3, 7, 11], "m(maj7)"],
  [[0, 4, 7, 9], "6"],
  [[0, 3, 7, 9], "m6"],
  [[0, 4, 7, 14], "add9"],
  [[0, 5, 7, 10], "7sus4"],
  [[0, 4, 7], ""],
  [[0, 3, 7], "m"],
  [[0, 3, 6], "dim"],
  [[0, 4, 8], "aug"],
  [[0, 2, 7], "sus2"],
  [[0, 5, 7], "sus4"],
  [[0, 7], "5"],
];

const pcName = (pc: number) => NAMES[((pc % 12) + 12) % 12];

/** The chord's name, or null when the notes aren't one (fewer than two pitch classes, or no shape). */
export function chordName(notes: number[]): string | null {
  if (notes.length < 2) return null;
  const sorted = [...notes].sort((a, b) => a - b);
  const bass = ((sorted[0] % 12) + 12) % 12;
  const pcs = [...new Set(sorted.map((n) => ((n % 12) + 12) % 12))];
  if (pcs.length < 2) return null;
  for (const [shape, suffix] of SHAPES) {
    const want = new Set(shape.map((i) => i % 12));
    if (want.size !== pcs.length) continue;
    // the bass as the root first, so a plain triad isn't read as an inversion of another
    for (const root of [bass, ...pcs.filter((p) => p !== bass)]) {
      const intervals = new Set(pcs.map((p) => (p - root + 12) % 12));
      if ([...want].every((i) => intervals.has(i))) {
        const name = pcName(root) + suffix;
        return root === bass ? name : `${name}/${pcName(bass)}`;
      }
    }
  }
  return null;
}
