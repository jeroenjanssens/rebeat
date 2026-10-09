/**
 * What the library list shows (D78): library samples, built-in kit sounds and instruments,
 * normalized to one kind of item.
 */
import { voiceSound } from "../../library/synthTrack";
import { useMemo } from "react";
import { KIT_SOUNDS, kitSounds, type KitSound } from "../../engine/kits";
import { CATALOG, catalogId, type CatalogInstrument, type Family } from "../../library/instruments";
import { useSettings } from "../../state/settings";
import { samplePeaks } from "../../engine/samples";
import { useLibrary } from "../../library/library";
import { useUserInstruments, userEntry } from "../../library/userInstruments";
import { sortSamples } from "../../library/sort";
import { useStore } from "../../state/store";

export type Location =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "used" }
  | { kind: "folder"; path: string }
  | { kind: "kit"; kit: string }
  | { kind: "online" }
  | { kind: "instruments"; family: Family };

export type TypeFilter = "all" | "loops" | "oneshots" | "instruments";
export type Length = "any" | "short" | "medium" | "long";

export interface Item {
  kind: "sample" | "instrument";
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
  /** Instruments: the catalog entry. */
  instrument?: CatalogInstrument;
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
    kind: "sample",
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

const instrumentItem = (c: CatalogInstrument, favorites: string[]): Item => ({
  kind: "instrument",
  id: c.id,
  name: c.name,
  duration: 0,
  peaks: [],
  favorite: favorites.includes(c.id),
  folder: `${c.family}/${c.group}`,
  tags: [c.family, c.group],
  builtIn: true,
  createdAt: 0,
  instrument: c,
});

/** What the project's tracks play: samples (library and built-in) and instruments. */
export function useUsedIds() {
  const tracks = useStore((s) => s.project.tracks);
  return useMemo(
    () =>
      new Set(
        tracks.flatMap((t) => [
          t.sound?.sampleId,
          ...(t.sound?.zones ?? []).map((z) => z.sampleId),
          ...(t.layers ?? []).map((l) => l.sampleId),
          t.mode !== "clip" ? catalogId(voiceSound(t)) : null,
        ]),
      ),
    [tracks],
  );
}

/** The items of a location, filtered and sorted. */
export function useLibraryItems(loc: Location, f: Filters): Item[] {
  const samples = useLibrary((s) => s.samples);
  const sort = useLibrary((s) => s.sort);
  const favorites = useSettings((s) => s.instrumentFavorites);
  const mine = useUserInstruments((s) => s.list);
  const usedIds = useUsedIds();
  return useMemo(() => {
    const q = f.query.trim().toLowerCase();
    const matches = (i: Item) =>
      !q || `${i.name} ${i.folder} ${i.tags.join(" ")}`.toLowerCase().includes(q);
    // instruments keep the catalog's order (grouped); samples follow the sort
    const instruments = (keep: (c: CatalogInstrument) => boolean) =>
      [...CATALOG, ...mine.map(userEntry)]
        .filter(keep)
        .map((c) => instrumentItem(c, favorites))
        .filter(matches);
    if (loc.kind === "instruments") return instruments((c) => c.family === loc.family);
    const samplesOnly = f.type === "loops" || f.type === "oneshots" || f.length !== "any";
    if (loc.kind === "all" && f.type === "instruments") return instruments(() => true);
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
          kind: "sample",
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
    list = list.filter(matches);
    if (f.type === "loops") list = list.filter((i) => i.bpm);
    if (f.type === "oneshots") list = list.filter((i) => !i.bpm);
    if (f.tag) list = list.filter((i) => i.tags.includes(f.tag!));
    if (f.length === "short") list = list.filter((i) => i.duration < 1);
    if (f.length === "medium") list = list.filter((i) => i.duration >= 1 && i.duration <= 5);
    if (f.length === "long") list = list.filter((i) => i.duration > 5);
    const sorted = sortSamples(list, sort);
    if (samplesOnly || f.tag || f.type === "instruments") return sorted;
    // instruments that belong here: favorites, used ones, or search results across everything
    if (loc.kind === "favorites")
      return [...sorted, ...instruments((c) => favorites.includes(c.id))];
    if (loc.kind === "used") return [...sorted, ...instruments((c) => usedIds.has(c.id))];
    if (loc.kind === "all" && q) return [...sorted, ...instruments(() => true)];
    return sorted;
  }, [loc, samples, f.query, f.type, f.tag, f.length, sort, usedIds, favorites, mine]);
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
