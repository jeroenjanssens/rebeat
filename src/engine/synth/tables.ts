/**
 * The main-thread side of the wavetables (D243): building a table's mip levels once (factory
 * tables from their generators, your own through a loader the library registers), and which
 * tables a patch needs. The synth node sends them to its context before they play.
 */
import { factoryTable, mipTable, type MippedTable } from "../../model/wavetables";
import type { SynthPatch } from "../../model/synth";

const cache = new Map<string, Promise<MippedTable | null>>();
const ready = new Map<string, MippedTable>();

type Loader = (id: string) => Promise<Float32Array[] | null>;
let userLoader: Loader | null = null;
/** Where your own tables come from (the library, D246). */
export const setUserTableLoader = (fn: Loader) => void (userLoader = fn);

/** A table with its mip levels (built once, after the current task: it takes a few ms). */
export function loadTable(id: string): Promise<MippedTable | null> {
  let p = cache.get(id);
  if (!p) {
    p = new Promise<void>((r) => setTimeout(r, 0))
      .then(async () => {
        const factory = factoryTable(id);
        const frames = factory ? factory.make() : await userLoader?.(id);
        return frames?.length ? mipTable(id, frames) : null;
      })
      .then((t) => {
        if (t) ready.set(id, t);
        else cache.delete(id);
        return t;
      });
    cache.set(id, p);
  }
  return p;
}

/** A table already built (pictures), or null. */
export const builtTable = (id: string) => ready.get(id) ?? null;

/** Every table a patch can play: each wavetable oscillator's slots (D248). */
export function tablesOf(patch: SynthPatch): string[] {
  const ids = new Set<string>();
  for (const o of patch.osc)
    if (o.type === "wavetable") for (const id of [o.table, ...(o.tables ?? [])]) ids.add(id);
  return [...ids];
}
