/** What the library list shows (D78): library samples and built-in kit sounds, normalized. */
import { useMemo } from "react";
import { KIT_SOUNDS, kitSounds, type KitSound } from "../../engine/kits";
import { samplePeaks } from "../../engine/samples";
import { useLibrary } from "../../library/library";
import { sortSamples } from "../../library/sort";
import { useStore } from "../../state/store";

export type Location =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "used" }
  | { kind: "folder"; path: string }
  | { kind: "kit"; kit: string }
  | { kind: "online" };

export type TypeFilter = "all" | "loops" | "oneshots";
export type Length = "any" | "short" | "medium" | "long";

export interface Item {
  id: string;
  name: string;
  duration: number;
  bpm?: number;
  peaks: ArrayLike<number>;
  favorite: boolean;
  folder: string;
  tags: string[];
  builtIn: boolean;
  createdAt: number;
}

export interface Filters {
  query: string;
  type: TypeFilter;
  tag: string | null;
  length: Length;
}

export const sameLoc = (a: Location, b: Location) => JSON.stringify(a) === JSON.stringify(b);

function kitItem(k: KitSound): Item {
  return {
    id: k.id,
    name: k.name,
    duration: k.length,
    peaks: samplePeaks(k.id, 96),
    favorite: false,
    folder: `Kits/${k.kit ?? "Demo"}`,
    tags: k.category ? [k.category] : [],
    builtIn: true,
    createdAt: 0,
  };
}

/** The samples the project's tracks play (library and built-in). */
export function useUsedIds() {
  const tracks = useStore((s) => s.project.tracks);
  return useMemo(
    () =>
      new Set(
        tracks.flatMap((t) => [
          t.sampleId,
          t.instrument?.sampleId,
          ...(t.layers ?? []).map((l) => l.sampleId),
        ]),
      ),
    [tracks],
  );
}

/** The items of a location, filtered and sorted. */
export function useLibraryItems(loc: Location, f: Filters): Item[] {
  const samples = useLibrary((s) => s.samples);
  const sort = useLibrary((s) => s.sort);
  const usedIds = useUsedIds();
  return useMemo(() => {
    let list: Item[];
    if (loc.kind === "kit") {
      list = kitSounds(loc.kit).map(kitItem);
    } else {
      list = samples
        .filter((s) => {
          if (loc.kind === "favorites") return s.favorite === 1;
          if (loc.kind === "used") return usedIds.has(s.id);
          if (loc.kind === "folder")
            return s.folder === loc.path || s.folder.startsWith(`${loc.path}/`);
          return true;
        })
        .map((s): Item => ({
          id: s.id,
          name: s.name,
          duration: s.duration,
          bpm: s.bpm,
          peaks: s.peaks,
          favorite: s.favorite === 1,
          folder: s.folder,
          tags: s.tags,
          builtIn: false,
          createdAt: s.createdAt,
        }));
      // most tracks play built-in kit sounds, which aren't in the library's own list
      if (loc.kind === "used")
        list.push(
          ...KIT_SOUNDS.filter((k) => usedIds.has(k.id)).map((k) => kitItem(k as KitSound)),
        );
    }
    const q = f.query.trim().toLowerCase();
    if (q)
      list = list.filter((i) =>
        `${i.name} ${i.folder} ${i.tags.join(" ")}`.toLowerCase().includes(q),
      );
    if (f.type === "loops") list = list.filter((i) => i.bpm);
    if (f.type === "oneshots") list = list.filter((i) => !i.bpm);
    if (f.tag) list = list.filter((i) => i.tags.includes(f.tag!));
    if (f.length === "short") list = list.filter((i) => i.duration < 1);
    if (f.length === "medium") list = list.filter((i) => i.duration >= 1 && i.duration <= 5);
    if (f.length === "long") list = list.filter((i) => i.duration > 5);
    return sortSamples(list, sort);
  }, [loc, samples, f.query, f.type, f.tag, f.length, sort, usedIds]);
}

/** Folders of the library (with their parents) and tags, for the sidebar and filter. */
export function useFoldersAndTags() {
  const samples = useLibrary((s) => s.samples);
  return useMemo(() => {
    const set = new Set<string>();
    for (const s of samples) {
      const parts = s.folder.split("/").filter(Boolean);
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join("/"));
    }
    return {
      folders: [...set].sort(),
      tags: [...new Set(samples.flatMap((s) => s.tags))].sort(),
    };
  }, [samples]);
}
