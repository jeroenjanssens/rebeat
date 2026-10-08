import { useEffect, useState, type RefObject } from "react";
import { STEP_SIZE_QUARTERS, type Pattern } from "../../model/types";

export type SizeClass = "compact" | "regular" | "large";

/** The panel's size class comes from its own width (container-based, not the window). */
export function useSizeClass(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    let raf = 0;
    // deferred a frame: changing the layout inside the observer callback causes RO loop errors
    const ro = new ResizeObserver(([e]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(e.contentRect.width));
    });
    ro.observe(ref.current!);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref]);
  const sizeClass: SizeClass = width < 860 ? "compact" : width < 1560 ? "regular" : "large";
  return { sizeClass, width };
}

const METRICS = {
  compact: {
    headerW: 128,
    scopeW: 56,
    padH: 24,
    minPad: 15,
    maxPad: 30,
    gap: 2,
    beatGap: 5,
    radius: 3,
  },
  regular: {
    headerW: 292,
    scopeW: 104,
    padH: 32,
    minPad: 18,
    maxPad: 54,
    gap: 3,
    beatGap: 8,
    radius: 5,
  },
  large: {
    headerW: 320,
    scopeW: 168,
    padH: 50,
    minPad: 26,
    maxPad: 72,
    gap: 4,
    beatGap: 11,
    radius: 7,
  },
} as const;

export interface Geometry {
  sizeClass: SizeClass;
  headerW: number;
  scopeW: number;
  padW: number;
  padH: number;
  gap: number;
  beatGap: number;
  radius: number;
  /** Step indices grouped by beat; `barStart` marks groups that begin a new bar. */
  groups: { indices: number[]; barStart: boolean }[];
  stepsW: number;
}

export function stepsPerBeat(pattern: Pattern) {
  return Math.round(1 / STEP_SIZE_QUARTERS[pattern.stepSize]);
}

export function geometry(
  width: number,
  pattern: Pattern,
  sizeClass: SizeClass,
  zoom: number,
): Geometry {
  const m = METRICS[sizeClass];
  const n = pattern.stepCount;
  const spb = stepsPerBeat(pattern);
  const groupSize = spb === 1 ? 4 : spb;
  const stepsPerBar = spb * 4;

  const groups: Geometry["groups"] = [];
  for (let i = 0; i < n; i += groupSize) {
    groups.push({
      indices: Array.from({ length: Math.min(groupSize, n - i) }, (_, k) => i + k),
      barStart: i > 0 && i % stepsPerBar === 0,
    });
  }
  const bars = groups.filter((g) => g.barStart).length;
  const gapsW =
    (n - groups.length) * m.gap + (groups.length - 1) * m.beatGap + bars * (m.beatGap + 1);
  const available = width - m.headerW - m.scopeW - 40;
  const fit = Math.max(m.minPad * zoom, Math.min(m.maxPad * zoom, (available - gapsW) / n));
  // pads and everything sized like a row of pads (clips, lanes) use the same rounded width
  const padW = Math.floor(fit * 10) / 10;
  return {
    sizeClass,
    headerW: m.headerW,
    scopeW: m.scopeW,
    padW,
    padH: Math.round(m.padH * Math.min(1.6, Math.max(0.8, zoom))),
    gap: m.gap,
    beatGap: m.beatGap,
    radius: m.radius,
    groups,
    stepsW: n * padW + gapsW,
  };
}
