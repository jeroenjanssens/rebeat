/**
 * Device profiles: how to talk to each grid controller over MIDI (pad numbers, LED colors,
 * buttons, encoders). Launchpads run in Programmer mode, Push in User mode.
 */
import type { RGB } from "./grid";

export interface ControllerDevice {
  id: string;
  name: string;
  /** Matches the MIDI port name. */
  match: RegExp;
  needsSysex: boolean;
  /** Messages to send when connecting (e.g. switch to Programmer/User mode). */
  init: number[][];
  /** Messages for the whole grid (row 0 = top). */
  lights(colors: RGB[][]): number[][];
  /** A pad note → grid position, or null. */
  pad(note: number): { row: number; col: number } | null;
  /** Buttons by CC number. */
  buttons: Record<number, "up" | "down" | "left" | "right" | "play" | "stop">;
  /** Relative encoders: CC → index 0..7. */
  encoders?: Record<number, number>;
}

const LAUNCHPAD_IDS: Record<string, number> = { mini: 0x0d, x: 0x0c, pro: 0x0e };
const to7 = (v: number) => Math.round((v / 255) * 127);

function launchpad(kind: "mini" | "x" | "pro", name: string, match: RegExp): ControllerDevice {
  const dev = LAUNCHPAD_IDS[kind];
  const header = [0xf0, 0x00, 0x20, 0x29, 0x02, dev];
  return {
    id: `launchpad-${kind}`,
    name,
    match,
    needsSysex: true,
    // Programmer mode: pads send notes 11–88 (row × 10 + column, bottom-left = 11)
    init: [[...header, 0x0e, 0x01, 0xf7]],
    lights(colors) {
      const spec: number[] = [];
      colors.forEach((row, r) =>
        row.forEach((c, col) =>
          spec.push(0x03, (8 - r) * 10 + col + 1, to7(c[0]), to7(c[1]), to7(c[2])),
        ),
      );
      return [[...header, 0x03, ...spec, 0xf7]];
    },
    pad(note) {
      const row = Math.floor(note / 10);
      const col = (note % 10) - 1;
      if (row < 1 || row > 8 || col < 0 || col > 7) return null;
      return { row: 8 - row, col };
    },
    buttons: { 91: "up", 92: "down", 93: "left", 94: "right", 19: "play" },
  };
}

/** Push 2/3 in User mode: pads are notes 36–99 from the bottom-left; colors are palette indices. */
function nearestPushColor(c: RGB): number {
  // Push's default palette: a handful of hues at a few brightnesses is enough for track colors
  const palette: [number, RGB][] = [
    [0, [0, 0, 0]],
    [122, [255, 255, 255]],
    [123, [64, 64, 64]],
    [124, [20, 20, 20]],
    [127, [255, 0, 0]],
    [3, [255, 128, 0]],
    [8, [255, 255, 0]],
    [13, [128, 255, 0]],
    [20, [0, 255, 0]],
    [33, [0, 255, 255]],
    [45, [0, 64, 255]],
    [49, [128, 0, 255]],
    [57, [255, 0, 255]],
    [60, [255, 0, 128]],
  ];
  const lum = Math.max(...c);
  if (lum < 8) return 0;
  let best = palette[1];
  let bd = Infinity;
  for (const p of palette) {
    const k = lum / Math.max(1, Math.max(...p[1]));
    const d = (p[1][0] * k - c[0]) ** 2 + (p[1][1] * k - c[1]) ** 2 + (p[1][2] * k - c[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best[0];
}

const push = (id: string, name: string, match: RegExp): ControllerDevice => ({
  id,
  name,
  match,
  needsSysex: true,
  init: [[0xf0, 0x00, 0x21, 0x1d, 0x01, 0x01, 0x0a, 0x01, 0xf7]],
  lights: (colors) =>
    colors.flatMap((row, r) =>
      row.map((c, col) => [0x90, 36 + (7 - r) * 8 + col, nearestPushColor(c)]),
    ),
  pad: (note) =>
    note >= 36 && note <= 99
      ? { row: 7 - Math.floor((note - 36) / 8), col: (note - 36) % 8 }
      : null,
  buttons: { 46: "up", 47: "down", 44: "left", 45: "right", 85: "play" },
  encoders: { 71: 0, 72: 1, 73: 2, 74: 3, 75: 4, 76: 5, 77: 6, 78: 7 },
});

export const DEVICES: ControllerDevice[] = [
  launchpad("mini", "Launchpad Mini MK3", /launchpad mini|lpminimk3/i),
  launchpad("x", "Launchpad X", /launchpad x|lpx/i),
  launchpad("pro", "Launchpad Pro MK3", /launchpad pro|lppromk3/i),
  push("push2", "Push 2", /push 2.*user|ableton push 2/i),
  push("push3", "Push 3", /push 3/i),
];

export function detectDevice(portName: string): ControllerDevice | undefined {
  return DEVICES.find((d) => d.match.test(portName));
}

/** Relative encoder value: 1..63 = up, 65..127 = down. */
export function relative(value: number): number {
  return value < 64 ? value : value - 128;
}
