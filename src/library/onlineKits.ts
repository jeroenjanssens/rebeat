/**
 * Online drum machine kits from the community "tidal-drum-machines" collection (the one Strudel
 * uses). Fetched on demand by the user; nothing is bundled. The sounds come from many sources,
 * so check their licensing before publishing music made with them.
 */
import type { SoundCategory } from "../model/types";
import { importItems } from "./library";

const INDEX =
  "https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json";

export interface OnlineKit {
  machine: string;
  /** Sound type (bd, sd, hh, …) → sample URLs. */
  sounds: Record<string, string[]>;
}

const TYPE_NAMES: Record<string, string> = {
  bd: "Kick",
  sd: "Snare",
  cp: "Clap",
  hh: "Cl Hat",
  oh: "Op Hat",
  rim: "Rim",
  cb: "Cowbell",
  lt: "Low Tom",
  mt: "Mid Tom",
  ht: "High Tom",
  cr: "Crash",
  rd: "Ride",
  sh: "Shaker",
  tb: "Tambourine",
  perc: "Perc",
  misc: "Misc",
  fx: "FX",
};

export const TYPE_ORDER = [
  "bd",
  "sd",
  "cp",
  "rim",
  "hh",
  "oh",
  "lt",
  "mt",
  "ht",
  "cb",
  "cr",
  "rd",
  "sh",
  "tb",
  "perc",
  "misc",
  "fx",
];

export function typeName(type: string) {
  return TYPE_NAMES[type] ?? type.toUpperCase();
}

export function typeCategory(type: string): SoundCategory {
  if (type === "bd") return "kick";
  if (type === "sd") return "snare";
  if (type === "cp") return "clap";
  if (["hh", "oh", "cr", "rd"].includes(type)) return "hat";
  if (["lt", "mt", "ht"].includes(type)) return "tom";
  if (type === "fx" || type === "misc") return "fx";
  return "perc";
}

/** "RolandTR808" → "Roland TR808" */
export function machineName(machine: string) {
  return machine.replace(/([a-z])([A-Z])/g, "$1 $2");
}

let index: Promise<OnlineKit[]> | null = null;

export function fetchKitIndex(): Promise<OnlineKit[]> {
  index ??= (async () => {
    const res = await fetch(INDEX);
    if (!res.ok) throw new Error(`Kit index unavailable (${res.status})`);
    const json = (await res.json()) as Record<string, string[] | string>;
    const base = String(json._base ?? "");
    const kits = new Map<string, OnlineKit>();
    for (const [key, urls] of Object.entries(json)) {
      if (key.startsWith("_") || !Array.isArray(urls)) continue;
      const i = key.lastIndexOf("_");
      const machine = key.slice(0, i);
      const type = key.slice(i + 1);
      if (!kits.has(machine)) kits.set(machine, { machine, sounds: {} });
      kits.get(machine)!.sounds[type] = urls.map((u) => (u.startsWith("http") ? u : base + u));
    }
    return [...kits.values()].sort((a, b) => a.machine.localeCompare(b.machine));
  })().catch((e) => {
    index = null;
    throw e;
  });
  return index;
}

/** Download sounds into the library (folder "Kits/<machine>"); returns [type, sampleId] pairs. */
export async function downloadKit(
  kit: OnlineKit,
  opts: { types?: string[]; variant?: number } = {},
): Promise<[string, string][]> {
  const types = (opts.types ?? TYPE_ORDER.filter((t) => kit.sounds[t])).filter(
    (t) => kit.sounds[t],
  );
  const folder = `Kits/${machineName(kit.machine)}`;
  const items = await Promise.all(
    types.map(async (type) => {
      const urls = kit.sounds[type];
      const url = urls[Math.min(opts.variant ?? 0, urls.length - 1)];
      const res = await fetch(url);
      if (!res.ok) return null;
      const name = `${machineName(kit.machine)} ${typeName(type)}${urls.length > 1 ? ` ${(opts.variant ?? 0) + 1}` : ""}`;
      return {
        type,
        item: { name: `${name}.wav`, data: await res.arrayBuffer(), folder, tags: ["kit", type] },
      };
    }),
  );
  const ok = items.filter((x): x is NonNullable<typeof x> => !!x);
  const ids = await importItems(ok.map((x) => x.item));
  return ok.flatMap((x, i) => (ids[i] ? [[x.type, ids[i]] as [string, string]] : []));
}
