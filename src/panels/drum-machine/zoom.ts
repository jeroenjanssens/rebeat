/**
 * Drum-machine zoom: the fixed level set, stepping helpers and formatting.
 * Zoom is `number | "fit"`, persisted in the settings (D131).
 * A number is a multiplier on the base pad width (0.5 = 50%, 1.0 = 100%, etc.).
 * "fit" fills the available width with a minimum pad size.
 */

/** The fixed zoom levels shown in the combobox dropdown, as multipliers (0.5 = 50%). */
export const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5];

/** Format a zoom value for display. */
export function formatZoom(zoom: number | "fit"): string {
  if (zoom === "fit") return "Fit";
  return `${Math.round(zoom * 100)}%`;
}

/**
 * Return the next level in `dir` (+1 = zoom in, -1 = zoom out).
 * `effectiveZoom` is the current effective zoom multiplier (for stepping from "fit":
 * pass the geometric ratio of padW / basePad so the first step starts near the fitted size).
 * Always returns a `number` — stepping away from Fit produces a fixed level.
 */
export function nextZoomLevel(zoom: number | "fit", dir: 1 | -1, effectiveZoom: number): number {
  // Use the effective zoom as the reference point when on Fit or between levels.
  const current = zoom === "fit" ? effectiveZoom : zoom;

  if (dir === 1) {
    // Zoom in: find the smallest level strictly above current.
    for (const l of ZOOM_LEVELS) {
      if (l > current + 0.005) return l;
    }
    return ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  } else {
    // Zoom out: find the largest level strictly below current.
    for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
      if (ZOOM_LEVELS[i] < current - 0.005) return ZOOM_LEVELS[i];
    }
    return ZOOM_LEVELS[0];
  }
}

/** Clamp a percent value (25–400) and convert to a multiplier. */
export function percentToZoom(percent: number): number {
  return Math.min(400, Math.max(25, Math.round(percent))) / 100;
}
