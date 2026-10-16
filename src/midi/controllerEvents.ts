/**
 * What a controller's controls are doing, as events (for the Keys panel and the device
 * display): "fader 2 is at 87, it set Reverb to 68%". Emitted by `audio-io/midi.ts` after it
 * routed a message, so an event also says what Rebeat did with it. Pure, no browser APIs.
 */
export type ControlKind = "key" | "pad" | "knob" | "fader" | "encoder" | "button" | "strip";

export interface ControllerEvent {
  /** The input port's name. */
  device: string;
  /** Which control, by the active controller map's slots (keys and pads by note). */
  control: { kind: ControlKind; index: number; slot?: string };
  /** The raw value: 0..127 (velocity for keys and pads, 0 on release); strips: 0..127. */
  value: number;
  /** Keys, pads and buttons: whether it's down. */
  down?: boolean;
  /** What it controls (a resolved target such as "track:<id>:volume"), if mapped. */
  target?: string;
  /** The target's value after this message (0..1), if it has one. */
  targetValue?: number;
  /** A relative knob or encoder: the steps it turned (+ clockwise). */
  turn?: number;
  /** What Rebeat did, as the monitor says it. */
  action: string;
}

type Listener = (e: ControllerEvent) => void;
const listeners = new Set<Listener>();

export function onControllerEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function emitControllerEvent(e: ControllerEvent) {
  for (const fn of listeners) fn(e);
}
