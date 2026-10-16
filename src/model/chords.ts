/**
 * The chord a set of notes makes (D135, D136), for the Keys panel's "A3 + C4 + E4 = Am".
 * Pure: the notes' pitch classes are looked up in a dictionary of chord symbols with every note
 * tried as the root, and the most likely reading wins. A bass that isn't the root is written
 * after a slash ("C/E", "D7/C").
 */

// Chord roots use C♯ and F♯ rather than D♭/G♭: those are the correct spellings for a major
// third above A/D and a perfect fourth above C, matching common notation. notes.ts:NAMES_FLAT
// uses D♭ and G♭ for the key selector, where flats are conventional.
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** Chord tones as semitones above the root. Extensions sit an octave up (9 = 2 + 12). */
const DEGREES: Record<string, number> = {
  "1": 0,
  "2": 2,
  "♭3": 3,
  "3": 4,
  "4": 5,
  "♭5": 6,
  "5": 7,
  "♯5": 8,
  "6": 9,
  "♭♭7": 9,
  "♭7": 10,
  "7": 11,
  "♭9": 13,
  "9": 14,
  "♯9": 15,
  "11": 17,
  "♯11": 18,
  "♭13": 20,
  "13": 21,
};

/**
 * Every chord symbol: its suffix ("" = major), its tones as degrees, how rare it is (0 = a
 * plain triad, 4 = exotic) and the tones it may leave out without changing its name ("13"
 * without its 9th is still a 13). The fifth of a chord with a third and a seventh may always
 * go. The rarity decides between readings of the same notes: C E G A is C6 rather than Am7/C.
 * Every symbol names its own notes in root position (a unit test checks), so a shape that only
 * ever reads as an inversion of a commoner chord (Cm♯5 = A♭/C) isn't listed.
 */
const CHORDS: [suffix: string, degrees: string, rarity: number, optional?: string][] = [
  // triads and the power chord
  ["", "1 3 5", 0],
  ["m", "1 ♭3 5", 0],
  ["5", "1 5", 1],
  ["dim", "1 ♭3 ♭5", 1],
  ["aug", "1 3 ♯5", 1],
  ["sus4", "1 4 5", 1],
  ["sus2", "1 2 5", 1],
  ["(♭5)", "1 3 ♭5", 3],
  ["sus2sus4", "1 2 4 5", 3],
  // sevenths
  ["7", "1 3 5 ♭7", 1],
  ["maj7", "1 3 5 7", 1],
  ["m7", "1 ♭3 5 ♭7", 1],
  ["m7♭5", "1 ♭3 ♭5 ♭7", 1],
  ["dim7", "1 ♭3 ♭5 ♭♭7", 1],
  ["m(maj7)", "1 ♭3 5 7", 2],
  ["7sus4", "1 4 5 ♭7", 2],
  ["7♯5", "1 3 ♯5 ♭7", 2],
  ["7♭5", "1 3 ♭5 ♭7", 2],
  ["maj7♯5", "1 3 ♯5 7", 3],
  ["maj7♭5", "1 3 ♭5 7", 3],
  ["dim(maj7)", "1 ♭3 ♭5 7", 3],
  ["7sus2", "1 2 5 ♭7", 3],
  ["maj7sus4", "1 4 5 7", 3],
  ["maj7sus2", "1 2 5 7", 3],
  ["maj7♯5sus4", "1 4 ♯5 7", 4],
  // sixths
  ["6", "1 3 5 6", 1],
  ["m6", "1 ♭3 5 6", 1],
  ["6/9", "1 3 5 6 9", 2, "5"],
  ["m6/9", "1 ♭3 5 6 9", 2, "5"],
  ["6♯11", "1 3 5 6 ♯11", 4],
  ["6/9♯11", "1 3 5 6 9 ♯11", 4],
  // added tones
  ["add9", "1 3 5 9", 1],
  ["madd9", "1 ♭3 5 9", 1],
  ["add11", "1 3 5 11", 2],
  ["madd11", "1 ♭3 5 11", 2],
  ["add♯11", "1 3 5 ♯11", 3],
  ["add♭9", "1 3 5 ♭9", 4],
  ["7add11", "1 3 5 ♭7 11", 3],
  ["m7add11", "1 ♭3 5 ♭7 11", 2],
  // ninths
  ["9", "1 3 5 ♭7 9", 2],
  ["maj9", "1 3 5 7 9", 2],
  ["m9", "1 ♭3 5 ♭7 9", 2],
  ["9sus4", "1 4 5 ♭7 9", 2],
  ["m(maj9)", "1 ♭3 5 7 9", 3],
  ["m9♭5", "1 ♭3 ♭5 ♭7 9", 3],
  ["9♭5", "1 3 ♭5 ♭7 9", 3],
  ["9♯5", "1 3 ♯5 ♭7 9", 3],
  ["maj9sus4", "1 4 5 7 9", 3],
  ["maj9♯5", "1 3 ♯5 7 9", 4],
  // elevenths
  ["11", "1 3 5 ♭7 9 11", 3],
  ["m11", "1 ♭3 5 ♭7 9 11", 2],
  ["maj11", "1 3 5 7 9 11", 4],
  ["m11♭5", "1 ♭3 ♭5 ♭7 9 11", 4],
  ["7♯11", "1 3 5 ♭7 ♯11", 2],
  ["maj7♯11", "1 3 5 7 ♯11", 2],
  ["9♯11", "1 3 5 ♭7 9 ♯11", 3],
  ["maj9♯11", "1 3 5 7 9 ♯11", 3],
  // thirteenths
  ["13", "1 3 5 ♭7 9 13", 2, "9"],
  ["maj13", "1 3 5 7 9 13", 2, "9"],
  ["m13", "1 ♭3 5 ♭7 9 13", 2, "9"],
  ["m13", "1 ♭3 5 ♭7 9 11 13", 2],
  ["13", "1 3 5 ♭7 9 11 13", 3],
  ["13sus4", "1 4 5 ♭7 9 13", 3, "9"],
  ["13♯11", "1 3 5 ♭7 9 ♯11 13", 3],
  ["maj13♯11", "1 3 5 7 9 ♯11 13", 3],
  // altered dominants
  ["7♭9", "1 3 5 ♭7 ♭9", 2],
  ["7♯9", "1 3 5 ♭7 ♯9", 2],
  ["7♭13", "1 3 5 ♭7 ♭13", 3],
  ["7♭9♯9", "1 3 5 ♭7 ♭9 ♯9", 3],
  ["7♭9♯11", "1 3 5 ♭7 ♭9 ♯11", 3],
  ["7♯9♯11", "1 3 5 ♭7 ♯9 ♯11", 3],
  ["7♭9♭13", "1 3 5 ♭7 ♭9 ♭13", 3],
  ["7♯9♭13", "1 3 5 ♭7 ♯9 ♭13", 3],
  ["7♯5♭9", "1 3 ♯5 ♭7 ♭9", 3],
  ["7♯5♯9", "1 3 ♯5 ♭7 ♯9", 3],
  ["13♭9", "1 3 5 ♭7 ♭9 13", 3],
  ["13♯9", "1 3 5 ♭7 ♯9 13", 3],
  ["7♭9sus4", "1 4 5 ♭7 ♭9", 3],
  ["m7♭9", "1 ♭3 5 ♭7 ♭9", 3],
  ["9♭13", "1 3 5 ♭7 9 ♭13", 4],
  ["7♯11♭13", "1 3 5 ♭7 ♯11 ♭13", 4],
  ["9♯11♭13", "1 3 5 ♭7 9 ♯11 ♭13", 4],
  ["9♯5♯11", "1 3 ♯5 ♭7 9 ♯11", 4],
  ["7♭9♯11♭13", "1 3 5 ♭7 ♭9 ♯11 ♭13", 4],
  ["7♯9♯11♭13", "1 3 5 ♭7 ♯9 ♯11 ♭13", 4],
  ["13♭9♯11", "1 3 5 ♭7 ♭9 ♯11 13", 4],
  ["13♯9♯11", "1 3 5 ♭7 ♯9 ♯11 13", 4],
  ["m7♭5♭9", "1 ♭3 ♭5 ♭7 ♭9", 4],
  ["maj7♭9", "1 3 5 7 ♭9", 4],
  ["maj7♯9♯11", "1 3 5 7 ♯9 ♯11", 4],
];

/** What reading a bass that isn't the root costs, against `rarity` (Am/C beats C6 without its 5th). */
const INVERSION = 1.5;
/** What each tone left out costs. */
const OMISSION = 1;

/** Every chord symbol as semitones above its root, in the order they're preferred (for tests). */
export const CHORD_TYPES: readonly { suffix: string; semitones: number[] }[] = CHORDS.map(
  ([suffix, degrees]) => ({ suffix, semitones: degrees.split(" ").map((d) => DEGREES[d]) }),
);

type Reading = { suffix: string; cost: number; order: number };

const maskOf = (semitones: number[]) => semitones.reduce((m, s) => m | (1 << (s % 12)), 0);
const bitCount = (mask: number) => mask.toString(2).replace(/0/g, "").length;

/** Pitch-class set (as a 12-bit mask above the root) → its cheapest name. */
const BY_MASK = (() => {
  const map = new Map<number, Reading>();
  CHORDS.forEach(([suffix, degrees, rarity, optional = ""], order) => {
    const tones = degrees.split(" ");
    const may = new Set(optional.split(" ").filter(Boolean));
    const third = tones.includes("3") || tones.includes("♭3");
    const seventh = tones.includes("7") || tones.includes("♭7");
    if (third && seventh && tones.includes("5")) may.add("5");
    const left = [...may];
    // every subset of the tones that may go, as long as three are left
    for (let drop = 0; drop < 1 << left.length; drop++) {
      const gone = left.filter((_, i) => drop & (1 << i));
      const kept = tones.filter((t) => !gone.includes(t));
      if (gone.length > 0 && kept.length < 3) continue;
      const mask = maskOf(kept.map((t) => DEGREES[t]));
      if (bitCount(mask) !== kept.length) continue;
      const cost = rarity + gone.length * OMISSION;
      const had = map.get(mask);
      if (!had || cost < had.cost) map.set(mask, { suffix, cost, order });
    }
  });
  return map;
})();

const pc = (n: number) => ((n % 12) + 12) % 12;

/** The chord's name, or null when the notes aren't one (fewer than two pitch classes, or no shape). */
export function chordName(notes: number[]): string | null {
  if (notes.length < 2) return null;
  const sorted = [...notes].sort((a, b) => a - b);
  const bass = pc(sorted[0]);
  // low to high, each pitch class once: the bass is tried first
  const pcs = [...new Set(sorted.map(pc))];
  if (pcs.length < 2) return null;
  let best: (Reading & { root: number }) | null = null;
  for (const root of pcs) {
    const reading = BY_MASK.get(pcs.reduce((m, p) => m | (1 << pc(p - root)), 0));
    if (!reading) continue;
    const cost = reading.cost + (root === bass ? 0 : INVERSION);
    if (!best || cost < best.cost || (cost === best.cost && reading.order < best.order)) {
      best = { ...reading, cost, root };
    }
  }
  if (!best) return null;
  const name = NAMES[best.root] + best.suffix;
  return best.root === bass ? name : `${name}/${NAMES[bass]}`;
}
