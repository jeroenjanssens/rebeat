/**
 * Smooth resets (D72): a double-click glides a control back to its default instead of jumping,
 * over 300 ms for the full range (less for shorter distances). Only for the mouse: MIDI and
 * controllers set values directly.
 */
import { useEffect, useRef } from "react";
import { onFrame } from "../render/raf";
import { withUndoKey } from "../state/store";

const FULL_MS = 300;
const MIN_MS = 60;

/** How long a glide over `distance` (a fraction of the control's range) takes, in ms. */
export function glideDuration(distance: number): number {
  const d = Math.min(1, Math.abs(distance));
  return d === 0 ? 0 : Math.max(MIN_MS, FULL_MS * d);
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** The value `elapsed` ms into a glide; exactly `to` at the end. */
export function glideAt(from: number, to: number, elapsed: number, duration: number): number {
  if (elapsed >= duration) return to;
  return from + (to - from) * easeOut(Math.max(0, elapsed) / duration);
}

/** Glide from `from` to `to`, calling `apply` every frame; returns a function that stops it. */
export function startGlide(
  from: number,
  to: number,
  apply: (v: number) => void,
  span = 1,
): () => void {
  const duration = glideDuration((to - from) / span);
  if (duration === 0) {
    apply(to);
    return () => {};
  }
  const start = performance.now();
  // all frames are one undo step
  const key = `glide-${start}`;
  const off = onFrame((now) => {
    const v = glideAt(from, to, now - start, duration);
    withUndoKey(key, () => apply(v));
    if (v === to) off();
  });
  return off;
}

/** A control's glide: a new one replaces the running one; stop() when the user grabs it. */
export function useGlide() {
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), []);
  return {
    glide(from: number, to: number, apply: (v: number) => void, span = 1) {
      stopRef.current();
      stopRef.current = startGlide(from, to, apply, span);
    },
    stop() {
      stopRef.current();
      stopRef.current = () => {};
    },
  };
}
