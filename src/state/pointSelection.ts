/**
 * The selected points (D235): any number of lanes' points at once, by lane (a lane's id, or
 * "tempo") and index in its saved list. The timeline's lanes, the Inspector's table and the
 * rectangle all share it (`ui.pointSelection`).
 */
import { create } from "zustand";
import { useStore } from "./store";

export interface PointSelection {
  lanes: Record<string, number[]>;
  /** The lane of the point picked last (the Inspector's table shows it). */
  last?: string;
}

export const NO_POINTS: PointSelection = { lanes: {} };

export const selectedIn = (s: PointSelection, key: string): number[] => s.lanes[key] ?? [];

/** Only these points of one lane. */
export const onlyIn = (key: string, indexes: number[]): PointSelection => ({
  lanes: indexes.length ? { [key]: [...new Set(indexes)] } : {},
  last: key,
});

/** The selection with these points added. */
export function withAdded(s: PointSelection, add: Record<string, number[]>): PointSelection {
  const lanes = { ...s.lanes };
  let last = s.last;
  for (const [key, ids] of Object.entries(add)) {
    if (!ids.length) continue;
    lanes[key] = [...new Set([...(lanes[key] ?? []), ...ids])];
    last = key;
  }
  return { lanes, last };
}

/** The selection without these points. */
export function withRemoved(s: PointSelection, remove: Record<string, number[]>): PointSelection {
  const lanes = { ...s.lanes };
  for (const [key, ids] of Object.entries(remove)) {
    const left = (lanes[key] ?? []).filter((i) => !ids.includes(i));
    if (left.length) lanes[key] = left;
    else delete lanes[key];
  }
  return { lanes, last: s.last };
}

/** One point in or out of the selection (Shift+click). */
export function toggled(s: PointSelection, key: string, index: number): PointSelection {
  return selectedIn(s, key).includes(index)
    ? withRemoved(s, { [key]: [index] })
    : withAdded(s, { [key]: [index] });
}

/** How many points, in how many lanes. */
export function countOf(s: PointSelection): { points: number; lanes: number } {
  const lists = Object.values(s.lanes).filter((l) => l.length);
  return { points: lists.reduce((n, l) => n + l.length, 0), lanes: lists.length };
}

/** "7 points in 3 lanes", "2 points", "" for one. */
export function countText(s: PointSelection): string {
  const { points, lanes } = countOf(s);
  if (points < 2) return "";
  return lanes > 1 ? `${points} points in ${lanes} lanes` : `${points} points`;
}

export const pointSelection = () => useStore.getState().pointSelection;
export const setPointSelection = (s: PointSelection) =>
  useStore.getState().setUi({ pointSelection: s });

/**
 * The rectangle being drawn over the lanes (D236), in client coordinates, and the points inside
 * it so far (highlighted while dragging).
 */
export const useBox = create<{
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
  inside: Record<string, number[]>;
  mode: "replace" | "add" | "remove";
}>(() => ({ rect: null, inside: {}, mode: "replace" }));
