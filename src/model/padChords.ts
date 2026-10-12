/**
 * Chord pads (D137), after the Telepathic Instruments Orchid's chord buttons: in the pads' Chord
 * mode, pads 1–4 are the chord types (Dim, Min, Maj, Sus) and pads 5–8 the extensions (6, m7,
 * M7, 9). Hold them and play one key: the key is the root and the lowest note, and the chord is
 * built upward from it. Two chord types held together make the Orchid's secret chords. Pure.
 */

/** What each pad is, left to right (pad index 0..7). */
export const CHORD_PADS = ["Dim", "Min", "Maj", "Sus", "6", "m7", "M7", "9"] as const;

/** Whether a pad is a chord type (pads 1–4) rather than an extension (pads 5–8). */
export const isChordType = (pad: number) => pad >= 0 && pad < 4;

/** The chord types as semitones above the root (Sus is sus4, as on the Orchid). */
const TYPES: number[][] = [
  [0, 3, 6], // Dim
  [0, 3, 7], // Min
  [0, 4, 7], // Maj
  [0, 5, 7], // Sus
];

/** What each extension adds: 6 (A on C), m7 (B♭), M7 (B), 9 (D, an octave up). */
const EXTENSIONS: Record<number, number> = { 4: 9, 5: 10, 6: 11, 7: 14 };

/**
 * Two chord types held together (firmware 3.84's secret chords, from the Orchid manual's table
 * as quoted by others; unconfirmed on a device). `with` is the extension the manual lists with
 * the pair: the chord plays without it, and holding it adds nothing more.
 */
const SECRET: Record<string, { tones: number[]; with?: number }> = {
  "0,3": { tones: [0, 7] }, // Dim + Sus: power chord (C5)
  "2,3": { tones: [0, 4, 8] }, // Maj + Sus: augmented (C+)
  "1,3": { tones: [0, 3, 5, 7] }, // Min + Sus: Cm(add4)
  "0,1": { tones: [0, 3, 7, 8], with: 4 }, // Min + Dim (+ 6): Cm(♭6)
  "0,2": { tones: [0, 4, 7, 8], with: 4 }, // Maj + Dim (+ 6): C(♭6)
  "1,2": { tones: [0, 4, 7, 10, 15], with: 5 }, // Maj + Min (+ m7): C7♯9
};

/**
 * The chord's tones as semitones above the root, for the pads held (in the order they were
 * pressed), or null when no chord type is held (the key plays on its own). With three or four
 * chord types held, the first two pressed count.
 */
export function padChordTones(pads: readonly number[]): number[] | null {
  const types = [...new Set(pads.filter(isChordType))];
  if (types.length === 0) return null;
  let tones: number[];
  let listed: number | undefined;
  if (types.length === 1) tones = TYPES[types[0]];
  else {
    const secret = SECRET[[types[0], types[1]].sort((a, b) => a - b).join(",")];
    tones = secret.tones;
    listed = secret.with;
  }
  const extra = pads.filter((p) => !isChordType(p) && p !== listed && p in EXTENSIONS);
  return [...new Set([...tones, ...extra.map((p) => EXTENSIONS[p])])].sort((a, b) => a - b);
}

/** The notes a key plays with the pads held (root first, within MIDI's range), or null. */
export function padChord(root: number, pads: readonly number[]): number[] | null {
  const tones = padChordTones(pads);
  return tones && tones.map((t) => root + t).filter((n) => n >= 0 && n <= 127);
}

/** The pads held, as the buttons read ("Maj + m7"), for the monitor and the display. */
export function padChordLabel(pads: readonly number[]): string {
  const order = [...new Set(pads)].sort((a, b) => a - b);
  return order.map((p) => CHORD_PADS[p]).join(" + ");
}

/** How far chord voicing goes either way (D140): ±8 inversions. */
export const VOICING_RANGE = 8;

/**
 * A chord's voicing (D140), as the Orchid's Voicing dial: each step up moves the lowest note an
 * octave up, each step down the highest note an octave down (C E G → +1: E G C, −1: G C E
 * below). Notes that would leave MIDI's range stop it. Low to high.
 */
export function voiceChord(notes: readonly number[], steps: number): number[] {
  const out = [...notes].sort((a, b) => a - b);
  for (let i = 0; i < Math.abs(steps) && out.length > 1; i++) {
    if (steps > 0) {
      if (out[0] + 12 > 127) break;
      out.push(out.shift()! + 12);
    } else {
      if (out[out.length - 1] - 12 < 0) break;
      out.unshift(out.pop()! - 12);
    }
    out.sort((a, b) => a - b);
  }
  return out;
}
