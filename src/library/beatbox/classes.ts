/**
 * The classes a beatbox hit can have (D107), in the model's output order. `model.json` lists
 * them too; a test keeps the two the same.
 */
export const BEATBOX_CLASSES = [
  "kick",
  "snare",
  "hihat",
  "openhat",
  "tom",
  "clap",
  "crash",
  "other",
] as const;
export type BeatboxClass = (typeof BEATBOX_CLASSES)[number];

export const CLASS_INFO: Record<
  BeatboxClass,
  { name: string; short: string; color: string; kit?: string }
> = {
  kick: { name: "Kick", short: "Kick", color: "#f87171", kit: "kit:808:kick" },
  snare: { name: "Snare", short: "Snare", color: "#fbbf24", kit: "kit:808:snare" },
  hihat: { name: "Closed hi-hat", short: "Hat", color: "#34d399", kit: "kit:808:chh" },
  openhat: { name: "Open hi-hat", short: "Open", color: "#22d3ee", kit: "kit:808:ohh" },
  tom: { name: "Tom", short: "Tom", color: "#a78bfa", kit: "kit:808:tom" },
  clap: { name: "Clap", short: "Clap", color: "#f472b6", kit: "kit:808:clap" },
  crash: { name: "Crash", short: "Crash", color: "#93c5fd", kit: "kit:909:crash" },
  other: { name: "Other", short: "Other", color: "#9ca3af" },
};

export const isClass = (v: unknown): v is BeatboxClass =>
  typeof v === "string" && (BEATBOX_CLASSES as readonly string[]).includes(v);

const NAME_TABLE: [BeatboxClass, string[]][] = [
  ["openhat", ["openhat", "openhihat", "ohh", "hho", "oh"]],
  ["hihat", ["hihat", "hat", "hh", "hhc", "closedhat", "closedhihat", "ch"]],
  ["kick", ["kick", "kd", "bd", "bassdrum"]],
  ["snare", ["snare", "sd", "sn"]],
  ["tom", ["tom", "lt", "mt", "ht"]],
  ["clap", ["clap", "cp", "snap", "rim", "rimshot"]],
  ["crash", ["crash", "cymbal", "cy", "ride"]],
];

/** A class from a file or strudel.json key name ("kick2.wav", "Open hat", "hh_o"); the same
 * rules as `ml/rebeat_ml/classes.py: from_name`. */
export function classFromName(name: string): BeatboxClass | undefined {
  const n = name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[-_ ]/g, "")
    .replace(/\d+$/, "");
  return NAME_TABLE.find(([, keys]) => keys.includes(n))?.[0];
}
