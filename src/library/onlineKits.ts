/**
 * Online drum machine kits from the community "tidal-drum-machines" collection (the one Strudel
 * uses). Fetched on demand by the user; nothing is bundled. The sounds come from many sources,
 * so check their licensing before publishing music made with them.
 */
import type { SoundCategory } from "../model/types";
import { guessCategory } from "./analysis";

const INDEX =
  "https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json";

export interface OnlineKit {
  /** The kit's name: a drum machine ("RolandTR808"), or the name of a source you added. */
  machine: string;
  /** Sources you added: the link they came from (to remove them again). */
  source?: string;
  /** Pitched entries of a strudel.json (note → file): multi-sample instruments (D82). */
  instruments?: Record<string, { note: number; url: string }[]>;
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
  return TYPE_NAMES[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export function typeCategory(type: string): SoundCategory {
  if (type === "bd") return "kick";
  if (type === "sd") return "snare";
  if (type === "cp") return "clap";
  if (["hh", "oh", "cr", "rd"].includes(type)) return "hat";
  if (["lt", "mt", "ht"].includes(type)) return "tom";
  if (type === "fx" || type === "misc") return "fx";
  // sounds of your own sources have names like "kick" or "hihat"
  return guessCategory(type);
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

/** One sound of an online kit: a sound type ("hh") and which of its variants. */
export interface OnlineSound {
  machine: string;
  type: string;
  variant: number;
  url: string;
  /** How many variants its type has (for the name). */
  variants: number;
}

export function kitSoundList(kit: OnlineKit): OnlineSound[] {
  const types = TYPE_ORDER.filter((t) => kit.sounds[t]).concat(
    Object.keys(kit.sounds).filter((t) => !TYPE_ORDER.includes(t)),
  );
  return types.flatMap((type) =>
    kit.sounds[type].map((url, variant) => ({
      machine: kit.machine,
      type,
      variant,
      url,
      variants: kit.sounds[type].length,
    })),
  );
}

/** "Cl Hat 2" */
export function soundLabel(s: OnlineSound) {
  return `${typeName(s.type)}${s.variants > 1 ? ` ${s.variant + 1}` : ""}`;
}

/** "Roland TR808 Cl Hat 2", the name in the library. */
export function soundName(s: OnlineSound) {
  return `${machineName(s.machine)} ${soundLabel(s)}`;
}

/** The file name in the collection, e.g. "Hat Closed.wav". */
export function soundFile(s: OnlineSound) {
  return decodeURIComponent(s.url.slice(s.url.lastIndexOf("/") + 1));
}

const SYNONYMS: Record<string, string> = {
  bd: "kick bass drum bassdrum",
  sd: "snare",
  cp: "clap",
  hh: "hat hihat hi-hat closed",
  oh: "hat hihat hi-hat open",
  rim: "rimshot",
  cb: "cowbell",
  lt: "tom low",
  mt: "tom mid",
  ht: "tom high",
  cr: "crash cymbal",
  rd: "ride cymbal",
  sh: "shaker",
  tb: "tambourine",
  perc: "percussion",
};

/** Sounds across all kits whose machine, type (or a synonym) or file name match every word. */
export function searchSounds(kits: OnlineKit[], query: string, limit = 200): OnlineSound[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: OnlineSound[] = [];
  for (const kit of kits)
    for (const s of kitSoundList(kit)) {
      const text =
        `${machineName(s.machine)} ${s.machine} ${s.type} ${typeName(s.type)} ${SYNONYMS[s.type] ?? ""} ${soundFile(s)}`.toLowerCase();
      if (words.every((w) => text.includes(w))) {
        out.push(s);
        if (out.length >= limit) return out;
      }
    }
  return out;
}

/** The first variant of every sound type: what "Load as tracks" and "Add kit" use. */
export function kitDefaults(kit: OnlineKit): OnlineSound[] {
  return kitSoundList(kit).filter((s) => s.variant === 0);
}

/** A sound dragged from the online kits, as drag data. */
export const ONLINE_MIME = "application/x-rebeat-online";
