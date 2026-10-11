/**
 * Key mode (D138), after the Telepathic Instruments Orchid's Key Mode: every key plays the
 * diatonic chord of Key mode's own key on that note, moved into the key first (C♯ in C major
 * plays C). The extension pads add the key's own sixth, seventh or ninth; a chord type pad plays
 * that chord on the key as pressed, so you can borrow chords. Pure.
 */
import { snapToKey, SCALES, type Key } from "./notes";
import { isChordType, padChordTones } from "./padChords";

/** The scales Key mode offers: the ones with 7 notes, so every degree has a triad. */
export const KEY_MODE_SCALES = [
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "harmonicMinor",
] as const;

/** Key mode's key from another key (the page's): a 5- or 6-note scale gives its parent scale. */
export function keyModeKeyFrom(key: Key): Key {
  if ((KEY_MODE_SCALES as readonly string[]).includes(key.scale)) return { ...key };
  const minor = key.scale === "pentMinor" || key.scale === "blues";
  return { root: key.root, scale: minor ? "minor" : "major" };
}

/** The next or previous root, a semitone a step (B → C). */
export function stepKeyRoot(key: Key, step: number): Key {
  return { ...key, root: (((key.root + step) % 12) + 12) % 12 };
}

/** The next or previous scale in `KEY_MODE_SCALES` (wrapping). */
export function stepKeyScale(key: Key, step: number): Key {
  const all = KEY_MODE_SCALES as readonly string[];
  const at = Math.max(0, all.indexOf(key.scale));
  return { ...key, scale: all[(((at + step) % all.length) + all.length) % all.length] };
}

export const sameKey = (a: Key, b: Key) => a.root === b.root && a.scale === b.scale;

/** Scale steps above the root for each extension pad (6: a sixth, m7/M7: the seventh, 9: a ninth). */
const EXTENSION_STEPS: Record<number, number> = { 4: 5, 5: 6, 6: 6, 7: 8 };

/**
 * The notes a key plays in Key mode, with the chord pads held (in the order pressed): low to
 * high, root first, within MIDI's range.
 */
export function keyModeChord(pressed: number, key: Key, pads: readonly number[]): number[] {
  const inRange = (notes: number[]) =>
    [...new Set(notes)].filter((n) => n >= 0 && n <= 127).sort((a, b) => a - b);
  // a chord type pad: that chord on the key as pressed, as in Chord mode
  if (pads.some(isChordType)) return inRange(padChordTones(pads)!.map((t) => pressed + t));

  const k = keyModeKeyFrom(key);
  const steps = SCALES[k.scale].steps;
  const root = snapToKey(pressed, k);
  const pc = (((root - k.root) % 12) + 12) % 12;
  const degree = steps.indexOf(pc);
  /** The note `n` scale steps above the root. */
  const above = (n: number) =>
    root - pc + steps[(degree + n) % 7] + Math.floor((degree + n) / 7) * 12;
  const extras = pads.filter((p) => p in EXTENSION_STEPS).map((p) => above(EXTENSION_STEPS[p]));
  return inRange([above(0), above(2), above(4), ...extras]);
}
