/** Sorting the library list (by name, duration or date added, in either direction). */
export type SortBy = "name" | "duration" | "recent";
export interface SampleSort {
  by: SortBy;
  /** Ascending: A→Z, shortest first, oldest first. */
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: SampleSort = { by: "recent", dir: "desc" };

/** The direction a sort starts in when you pick it. */
export const NATURAL_DIR: Record<SortBy, SampleSort["dir"]> = {
  name: "asc",
  duration: "asc",
  recent: "desc",
};

interface Sortable {
  name: string;
  duration: number;
  createdAt: number;
}

const compare: Record<SortBy, (a: Sortable, b: Sortable) => number> = {
  // "Kick 2" before "Kick 10"
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  duration: (a, b) => a.duration - b.duration,
  recent: (a, b) => a.createdAt - b.createdAt,
};

/** A sorted copy; ties keep their order (so built-in kits stay in kit order by date). */
export function sortSamples<T extends Sortable>(list: T[], sort: SampleSort): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => sign * compare[sort.by](a, b));
}

/** The sort button's label, e.g. "Name ↑". */
export function sortLabel(sort: SampleSort): string {
  if (sort.by === "recent") return sort.dir === "desc" ? "Newest" : "Oldest";
  return `${sort.by === "name" ? "Name" : "Duration"} ${sort.dir === "asc" ? "↑" : "↓"}`;
}
