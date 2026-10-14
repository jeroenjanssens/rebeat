/**
 * The Bend card's settings (D222): the values its steppers walk through, and every control as a
 * MIDI-learn target ("bend:amount", "bend:shape"…), so a controller knob can move a bend live.
 */
import {
  DEFAULT_BEND_SHAPES,
  sanitizePlayStyle,
  type BendStyle,
  type BendValues,
} from "../model/perform";
import { BEND_SHAPES } from "../model/types";
import { tempoNow } from "../engine/transport";
import { setPlayStyle } from "./keys";
import { useSettings } from "./settings";

/** Times in seconds, and in quarter notes when synced to the tempo. */
export const BEND_SECONDS = [0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.2, 0.3, 0.5, 0.8, 1.2, 2, 3, 5];
export const BEND_QUARTERS = [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16];

const Q_NAMES: Record<number, string> = {
  0.125: "1/32",
  0.25: "1/16",
  0.5: "1/8",
  0.75: "1/8.",
  1: "1/4",
  1.5: "1/4.",
  2: "1/2",
  4: "1 bar",
  8: "2 bars",
  16: "4 bars",
};

/** A time as the card shows it: "120 ms", "1.2 s", "1/8", "1 bar"; 0 is "none". */
export function bendTimeLabel(v: number, unit: "s" | "q"): string {
  if (v <= 0) return "none";
  if (unit === "q") return Q_NAMES[v] ?? `${Math.round(v * 100) / 100} q`;
  return v < 1 ? `${Math.round(v * 1000)} ms` : `${Math.round(v * 10) / 10} s`;
}

/** The nearest value in a list. */
export const nearest = (list: number[], v: number) =>
  list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b));

/** One step through a list from v (the nearest first). */
export function stepIn(list: number[], v: number, dir: -1 | 1): number {
  const i = list.indexOf(nearest(list, v));
  return list[Math.max(0, Math.min(list.length - 1, i + dir))];
}

export const bendStyle = (): BendStyle => sanitizePlayStyle(useSettings.getState().playStyle).bend;

/** Change the card's settings. */
export function setBend(change: Partial<BendStyle>) {
  setPlayStyle({ bend: change });
}

/** Change the shape being edited's own values. */
export function setBendValues(change: Partial<BendValues>) {
  const b = bendStyle();
  setBend({ shapes: { ...b.shapes, [b.shape]: { ...b.shapes[b.shape], ...change } } });
}

/** Back to the shape's values before you changed them. */
export function resetBendValue(key: keyof BendValues) {
  setBendValues({ [key]: DEFAULT_BEND_SHAPES[bendStyle().shape][key] });
}

/** Sync to the tempo, or back to seconds: the times stay about as long as they were. */
export function setBendSync(sync: boolean) {
  const v = bendStyle().shapes[bendStyle().shape];
  if ((v.unit === "q") === sync) return;
  const secPerQ = 60 / (tempoNow() || 120);
  const conv = (t: number) =>
    t <= 0 ? 0 : sync ? nearest(BEND_QUARTERS, t / secPerQ) : nearest(BEND_SECONDS, t * secPerQ);
  setBendValues({ unit: sync ? "q" : "s", time: conv(v.time), delay: conv(v.delay) });
}

/** The range of a shape's amount: notes of the key for Next, semitones else. */
export const amountRange = (shape: BendStyle["shape"]) =>
  shape === "next" ? 4 : shape === "shake" ? 2 : 12;

/** The card's controls for MIDI learn (D222): their values as 0..1, and setting them. */
export function bendControl(id: string): number | null {
  const b = bendStyle();
  const v = b.shapes[b.shape];
  const list = v.unit === "q" ? BEND_QUARTERS : BEND_SECONDS;
  const r = amountRange(b.shape);
  switch (id) {
    case "on":
      return b.on ? 1 : 0;
    case "shape":
      return BEND_SHAPES.indexOf(b.shape) / (BEND_SHAPES.length - 1);
    case "amount":
      return (v.amount + r) / (2 * r);
    case "time":
      return list.indexOf(nearest(list, v.time)) / (list.length - 1);
    case "delay":
      return v.delay <= 0 ? 0 : (list.indexOf(nearest(list, v.delay)) + 1) / list.length;
    case "chance":
      return b.chance;
    case "velocity":
      return (b.velocity + 1) / 2;
  }
  return null;
}

export function setBendControl(id: string, k: number) {
  const x = Math.min(1, Math.max(0, k));
  const b = bendStyle();
  const v = b.shapes[b.shape];
  const list = v.unit === "q" ? BEND_QUARTERS : BEND_SECONDS;
  const r = amountRange(b.shape);
  switch (id) {
    case "on":
      return setBend({ on: x >= 0.5 });
    case "shape":
      return setBend({ shape: BEND_SHAPES[Math.round(x * (BEND_SHAPES.length - 1))] });
    case "amount": {
      const a = -r + x * 2 * r;
      return setBendValues({
        amount: b.shape === "next" ? Math.round(a) : Math.round(a * 10) / 10,
      });
    }
    case "time":
      return setBendValues({ time: list[Math.round(x * (list.length - 1))] });
    case "delay": {
      const i = Math.round(x * list.length);
      return setBendValues({ delay: i === 0 ? 0 : list[i - 1] });
    }
    case "chance":
      return setBend({ chance: Math.round(x * 100) / 100 });
    case "velocity":
      return setBend({ velocity: Math.round((x * 2 - 1) * 100) / 100 });
  }
}
