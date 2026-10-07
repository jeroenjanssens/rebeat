import type { SoundCategory } from "./types";

/** 16 track colors that read well on both dark and light surfaces. */
export const TRACK_PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
];

export const CATEGORY_COLOR: Record<SoundCategory, string> = {
  kick: TRACK_PALETTE[0],
  snare: TRACK_PALETTE[1],
  clap: TRACK_PALETTE[2],
  hat: TRACK_PALETTE[3],
  perc: TRACK_PALETTE[5],
  tom: TRACK_PALETTE[6],
  bass: TRACK_PALETTE[10],
  keys: TRACK_PALETTE[13],
  vocal: TRACK_PALETTE[15],
  fx: TRACK_PALETTE[8],
};

export const LINK_COLORS = ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24", "#c084fc", "#2dd4bf"];
