/**
 * The instrument catalog (D78): everything an instrument track can play, for the library, the
 * track menu and the Inspector. Factory synths are part of Rebeat; sampled instruments stream
 * from smplr's hosts, each collection with its own license.
 */
import type { Effect, InstrumentSource } from "../model/types";
import { GM_NAMES, MALLET_NAMES, SMOLKEN_NAMES, VCSL_NAMES } from "./instrumentNames";
import { FACTORY_SYNTHS } from "./synths";

export type Family =
  | "Synths"
  | "Pianos & keys"
  | "General MIDI"
  | "Mallets"
  | "Orchestral"
  | "Double bass"
  | "Your instruments";

export const FAMILIES: Family[] = [
  "Synths",
  "Pianos & keys",
  "General MIDI",
  "Mallets",
  "Orchestral",
  "Double bass",
  "Your instruments",
];

export interface Collection {
  name: string;
  license: string;
  url?: string;
}

export const COLLECTIONS = {
  factory: { name: "Rebeat factory synths", license: "Part of Rebeat" },
  splendid: {
    name: "Splendid Grand Piano",
    license: "No license stated by the source",
    url: "https://github.com/sfzinstruments/SplendidGrandPiano",
  },
  epianos: {
    name: "Greg Sullivan E-Pianos",
    license: "CC BY 3.0",
    url: "https://github.com/sfzinstruments/GregSullivan.E-Pianos",
  },
  vcsl: {
    name: "Versilian Community Sample Library",
    license: "CC0 1.0 (public domain)",
    url: "https://github.com/sgossner/VCSL",
  },
  gm: {
    name: "MusyngKite General MIDI soundfont",
    license: "CC BY-SA 3.0",
    url: "https://github.com/gleitz/midi-js-soundfonts",
  },
  smolken: {
    name: "D. Smolken double bass",
    license: "CC0 1.0 (public domain)",
    url: "https://github.com/sfzinstruments/dsmolken.double-bass",
  },
  user: { name: "Your instruments", license: "Yours" },
} satisfies Record<string, Collection>;

export interface CatalogInstrument {
  /** "synth:acid", "smplr:sf:flute", "user:<id>" */
  id: string;
  name: string;
  family: Family;
  /** A group within the family ("Bass", "Brass"…). */
  group: string;
  /** What it's in the style of, or other details. */
  note?: string;
  source: InstrumentSource;
  /** Downloaded the first time it's played. */
  streamed: boolean;
  collection: Collection;
  /** Low instruments preview an octave or two down. */
  low?: boolean;
  /** Saved instruments: the SOUND knobs and effects that come with them. */
  params?: Record<string, number>;
  effects?: Effect[];
}

const words = (s: string) =>
  s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/** "lead_8_bass__lead" → "Lead 8 (Bass + Lead)", "honkytonk_piano" → "Honky-tonk Piano" */
export function gmName(id: string) {
  const m = /^(lead|pad|fx)_(\d)_(.*)$/.exec(id);
  if (m) return `${words(m[1])} ${m[2]} (${words(m[3].replace("__", " + "))})`;
  return words(id)
    .replace("Honkytonk", "Honky-tonk")
    .replace(/ (\d)$/, " $1");
}

const GM_GROUPS = [
  "Piano",
  "Chromatic percussion",
  "Organ",
  "Guitar",
  "Bass",
  "Strings",
  "Ensemble",
  "Brass",
  "Reed",
  "Pipe",
  "Synth lead",
  "Synth pad",
  "Synth effects",
  "Ethnic",
  "Percussive",
  "Sound effects",
];

const VCSL_GROUPS: Record<string, string> = {
  Chordophones: "Strings & keyboards",
  Aerophones: "Winds",
  Idiophones: "Percussion",
  Membranophones: "Drums",
  Electrophones: "Electronic",
};

const LOW = /bass|tuba|contrabass|cello|bassoon|timpani|taiko|baritone/i;

const smplr = (
  preset: string,
  name: string,
  family: Family,
  group: string,
  collection: Collection,
): CatalogInstrument => ({
  id: `smplr:${preset}`,
  name,
  family,
  group,
  source: { source: "smplr", preset },
  streamed: true,
  collection,
  low: LOW.test(name),
});

/** Built-in and streamed instruments (your own are added by the library). */
const SYNTH_GROUPS = ["Bass", "Leads", "Pads", "Keys", "Plucks & stabs", "FX"];

export const CATALOG: CatalogInstrument[] = [
  ...[...FACTORY_SYNTHS]
    .sort((a, b) => SYNTH_GROUPS.indexOf(a.group) - SYNTH_GROUPS.indexOf(b.group))
    .map((s): CatalogInstrument => ({
      id: `synth:${s.id}`,
      name: s.name,
      family: "Synths",
      group: s.group,
      note: s.note && `In the style of ${s.note}`,
      source: { source: "synth", preset: s.id },
      streamed: false,
      collection: COLLECTIONS.factory,
      low: s.group === "Bass",
    })),
  smplr("piano", "Grand Piano", "Pianos & keys", "Acoustic", COLLECTIONS.splendid),
  smplr("epiano:CP80", "Electric Grand (CP80)", "Pianos & keys", "Electric", COLLECTIONS.epianos),
  smplr("epiano:PianetT", "Pianet T", "Pianos & keys", "Electric", COLLECTIONS.epianos),
  smplr(
    "epiano:WurlitzerEP200",
    "Wurlitzer EP200",
    "Pianos & keys",
    "Electric",
    COLLECTIONS.epianos,
  ),
  smplr("epiano:TX81Z", "FM Piano (TX81Z)", "Pianos & keys", "Electric", COLLECTIONS.vcsl),
  ...GM_NAMES.map((n, i) =>
    smplr(`sf:${n}`, gmName(n), "General MIDI", GM_GROUPS[Math.floor(i / 8)], COLLECTIONS.gm),
  ),
  ...MALLET_NAMES.map((n) =>
    smplr(`mallet:${n}`, n, "Mallets", n.split(" - ")[0], COLLECTIONS.vcsl),
  ),
  ...VCSL_NAMES.map((n) => {
    const parts = n.split("/");
    return smplr(
      `vcsl:${n}`,
      parts.at(-1)!,
      "Orchestral",
      VCSL_GROUPS[parts[0]] ?? parts[0],
      COLLECTIONS.vcsl,
    );
  }),
  ...SMOLKEN_NAMES.map((n) => ({
    ...smplr(
      `smolken:${n}`,
      `Double Bass · ${n}`,
      "Double bass",
      "Double bass",
      COLLECTIONS.smolken,
    ),
    low: true,
  })),
];

/** The catalog id of what a source plays ("synth:acid", "smplr:piano"), or null for samplers. */
export function catalogId(src: InstrumentSource): string | null {
  if (src.source === "sampler") return null;
  return `${src.source}:${src.preset}`;
}

export const catalogEntry = (id: string) => CATALOG.find((c) => c.id === id);
