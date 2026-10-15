import { type RefObject } from "react";
import { useElementSize } from "../../render/useElementSize";
import { STEP_SIZE_QUARTERS, type Pattern } from "../../model/types";

export type SizeClass = "compact" | "regular" | "large";

/** The panel's size class comes from its own width (container-based, not the window). */
export function useSizeClass(ref: RefObject<HTMLElement | null>) {
  const { width } = useElementSize(ref);
  const sizeClass: SizeClass = width < 860 ? "compact" : width < 1560 ? "regular" : "large";
  return { sizeClass, width };
}

const METRICS = {
  compact: {
    headerW: 128,
    scopeW: 56,
    padH: 24,
    /** Base pad width at 100% zoom (D131). */
    basePad: 22,
    minPad: 15,
    gap: 2,
    beatGap: 5,
    radius: 3,
  },
  regular: {
    headerW: 292,
    scopeW: 104,
    padH: 32,
    basePad: 30,
    minPad: 18,
    gap: 3,
    beatGap: 8,
    radius: 5,
  },
  large: {
    headerW: 320,
    scopeW: 168,
    padH: 50,
    basePad: 44,
    minPad: 26,
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
  /**
   * The effective zoom multiplier (padW / basePad).
   * In "fit" mode this reflects the computed fit ratio; in number mode it equals the zoom value.
   * Used to find the nearest fixed level when stepping away from Fit (D131).
   */
  effectiveZoom: number;
}

export function stepsPerBeat(pattern: Pattern) {
  return Math.round(1 / STEP_SIZE_QUARTERS[pattern.stepSize]);
}

/**
 * Compute the drum-machine layout geometry.
 *
 * - zoom === "fit": pad width fills the available panel width (minimum `m.minPad`, then scroll).
 * - zoom is a number: pad width = `m.basePad × zoom` exactly, no fitting (scroll when too wide).
 *
 * Pad height scales with a numeric zoom (clamped 0.8–1.6 of the nominal height); Fit keeps it.
 */
export function geometry(
  width: number,
  pattern: Pattern,
  sizeClass: SizeClass,
  zoom: number | "fit",
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

  let padW: number;
  let effectiveZoom: number;

  if (zoom === "fit") {
    // Fill the available width; enforce a minimum pad size below which the row scrolls.
    const rawFit = (available - gapsW) / n;
    padW = Math.max(m.minPad, rawFit);
    effectiveZoom = padW / m.basePad;
  } else {
    // Fixed size: base × zoom, no fitting (the row may scroll if too wide for the panel).
    padW = m.basePad * zoom;
    effectiveZoom = zoom;
  }

  // pads and everything sized like a row of pads (clips, lanes) use the same rounded width
  padW = Math.floor(padW * 10) / 10;
  // Fit keeps the nominal height: pages with fewer steps get wider pads, not taller rows (the
  // track list mustn't change height when you switch pages)
  const heightZoom = zoom === "fit" ? 1 : zoom;
  const padH = Math.round(m.padH * Math.min(1.6, Math.max(0.8, heightZoom)));

  return {
    sizeClass,
    headerW: m.headerW,
    scopeW: m.scopeW,
    padW,
    padH,
    gap: m.gap,
    beatGap: m.beatGap,
    radius: m.radius,
    groups,
    stepsW: n * padW + gapsW,
    effectiveZoom,
  };
}
