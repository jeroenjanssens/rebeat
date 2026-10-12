/**
 * The colors of a controller's pads 1–8 (D144), the same on the device (the MiniLab 3's pad
 * lights) and in the Controller panel: in Drum mode each pad has the color of the track it plays,
 * in Chord and Key mode the chord types (pads 1–4) are blue and the extensions (5–8) purple. With
 * Shift held the MiniLab shows its own colors for the pads' second functions. Pure, no browser
 * APIs.
 */

export type PadMode = "drum" | "chord" | "key" | "next";

/** Chord and Key mode: the chord types, then the extensions. */
export const CHORD_TYPE_COLOR = "#2f7dff";
export const EXTENSION_COLOR = "#9d4dff";

/** Shift held: Arp, Pad, Prog, Loop, Stop, Play, Record, Tap, as the MiniLab 3 lights them. */
export const SHIFT_PAD_COLORS = [
  "#1fb4ff",
  "#1fb4ff",
  "#1fb4ff",
  "#ff8a3d",
  "#1fb4ff",
  "#2fe36b",
  "#ff3b30",
  "#ffd84a",
] as const;

/** What pads 1–8 show: a color each, or null for a pad that plays nothing (unlit). In Next mode
 * (D159) each pad is a suggestion, in the color of what it does (`suggestions`: their colors). */
export function padColors(
  tracks: readonly { color: string }[],
  mode: PadMode,
  suggestions: readonly string[] = [],
): readonly (string | null)[] {
  if (mode === "next") return Array.from({ length: 8 }, (_, i) => suggestions[i] ?? null);
  if (mode !== "drum")
    return Array.from({ length: 8 }, (_, i) => (i < 4 ? CHORD_TYPE_COLOR : EXTENSION_COLOR));
  return Array.from({ length: 8 }, (_, i) => tracks[i]?.color ?? null);
}

/** A "#rrggbb" color as the MiniLab's 7-bit RGB (0..127 each); unlit is black. */
export function deviceRgb(hex: string | null): [number, number, number] {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return [0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round((c * 127) / 255)) as [
    number,
    number,
    number,
  ];
}
