import { useEffect, useRef } from "react";
import { scratchBegin, scratchCut, scratchEnd, scratchMove } from "../engine/engine";
import type { Track } from "../model/types";

/**
 * Pointer handling for jog strips and platters: the speed of the hand sets the playback speed
 * (negative = backwards); holding still stops the record; letting go returns to the beat.
 */
export function useScratch(track: Track, unitsPerSecond: number, keepPosition = false) {
  const last = useRef<{ v: number; t: number } | null>(null);
  const idle = useRef(0);
  const trackRef = useRef(track);
  useEffect(() => {
    trackRef.current = track;
  });
  useEffect(() => () => clearTimeout(idle.current), []);

  return {
    /** Start with a value (x in px, or an angle in degrees). */
    begin: (v: number) => {
      last.current = { v, t: performance.now() };
      void scratchBegin(trackRef.current);
    },
    move: (v: number) => {
      const l = last.current;
      if (!l) return;
      const now = performance.now();
      const dt = Math.max(1, now - l.t) / 1000;
      const rate = (v - l.v) / dt / unitsPerSecond;
      last.current = { v, t: now };
      scratchMove(trackRef.current.id, Math.max(-4, Math.min(4, rate)));
      // hand held still: the record stops
      clearTimeout(idle.current);
      idle.current = window.setTimeout(() => scratchMove(trackRef.current.id, 0), 40);
    },
    end: () => {
      if (!last.current) return;
      last.current = null;
      clearTimeout(idle.current);
      scratchEnd(trackRef.current, keepPosition);
    },
    cut: (on: boolean) => scratchCut(trackRef.current.id, on),
    active: () => !!last.current,
  };
}
