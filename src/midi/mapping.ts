/**
 * MIDI mappings without the browser (D119–D121): relative encoders, roles that global mappings
 * point at (the selected track's n-th SOUND knob…), which mapping a message hits, where a note
 * goes, and pickup. `audio-io/midi.ts` wires it to Web MIDI.
 */
import type { MidiMapping, MidiMode, Project } from "../model/project";
import type { Track } from "../model/types";

// ---------- relative encoders (D120) ----------

/** How many steps a relative message moves (+ clockwise), or 0 for none. */
export function relativeDelta(mode: MidiMode, value: number): number {
  switch (mode) {
    case "rel64":
      return value - 64;
    case "rel2c":
      return value < 64 ? value : value - 128;
    case "relsign":
      return value < 64 ? value : -(value - 64);
    default:
      return 0;
  }
}

/**
 * What a control sends, from the values of its first few messages while it turns: relative
 * encoders repeat small codes around 64 (offset), near 0 and 127 (two's complement) or near 0 and
 * 64 (sign bit); absolute ones move through values. Null when it can't tell yet.
 *
 * D129: fader slots are never sniffed (see midi.ts), so this function only sees data from knobs
 * and encoders. D141: a wrong guess sticks (it's saved) and turns a knob into one that goes the
 * same way whichever way it turns, so relative needs strong evidence: at least half the messages
 * repeat the one before, the values don't walk a path (66, 67, 67, 68 is an absolute knob turned
 * slowly), and an absolute knob held at its end (124, 127, 127 or 127, 127, 127) isn't taken for
 * two's complement turning down.
 */
export function detectMode(values: number[]): MidiMode | null {
  if (values.length < 2) return null;
  const pairs = values.length - 1;
  const repeatCount = values.filter((v, i) => i > 0 && v === values[i - 1]).length;
  const repeats = repeatCount > 0;
  const all = (lo: number, hi: number) => values.every((v) => v >= lo && v <= hi);
  const inSets = (...ranges: [number, number][]) =>
    values.every((v) => ranges.some(([lo, hi]) => v >= lo && v <= hi));
  const distinct = new Set(values).size;
  // a walk moves by small steps (relative codes jump across 0 and 127, or 1 and 65)
  const near = (v: number, i: number) => i === 0 || Math.abs(v - values[i - 1]) <= 12;
  const up = values.every((v, i) => near(v, i) && (i === 0 || v >= values[i - 1]));
  const down = values.every((v, i) => near(v, i) && (i === 0 || v <= values[i - 1]));
  const last = values[values.length - 1];
  const path = (up || down) && (distinct >= 3 || (distinct >= 2 && (last === 0 || last === 127)));
  const relative = repeatCount * 2 >= pairs && !path;
  if (relative) {
    if (all(57, 71) && values.every((v) => v !== 64)) return "rel64";
    // 127 alone is also where an absolute knob stops: two's complement needs another code too
    if (inSets([1, 15], [113, 127]) && values.some((v) => v !== 127)) return "rel2c";
    if (inSets([1, 15], [65, 79])) return "relsign";
  }
  // values that move like a fader: absolute
  if (!repeats || values.length >= 4) return "absolute";
  return null;
}

/**
 * Whether a knob taken for relative is really absolute (D141): six values in a row that only go
 * one way without repeating. Relative knobs turned slowly repeat their code; this walk is what an
 * absolute knob sends, so a wrong guess heals itself as soon as the knob is turned a little.
 */
export function walksLikeAbsolute(values: number[]): boolean {
  if (values.length < 6) return false;
  const up = values.every((v, i) => i === 0 || v > values[i - 1]);
  const down = values.every((v, i) => i === 0 || v < values[i - 1]);
  return up || down;
}

// ---------- roles (D121) ----------

/** Global targets name roles; project targets name tracks by id. */
export const ROLES = {
  selectedSound: (n: number) => `selected:sound:${n}`,
  selectedVolume: "selected:volume",
  selectedMix: (id: string) => `selected:mix.${id}`,
  trackVolume: (n: number) => `track#${n}:volume`,
};

export interface TargetContext {
  project: Project;
  selectedTrackId: string | null | undefined;
  /** The SOUND knob ids a track shows (`soundDefs(track)`), in order. */
  soundIds: (t: Track) => string[];
}

/** A role as the concrete target it means now ("selected:sound:1" → "track:<id>:sound.tune"),
 * or the target itself; null when it means nothing (no track selected, no 9th knob). */
export function resolveTarget(target: string, ctx: TargetContext): string | null {
  const selected = ctx.project.tracks.find((t) => t.id === ctx.selectedTrackId);
  if (target.startsWith("selected:")) {
    if (!selected) return null;
    const rest = target.slice("selected:".length);
    if (rest.startsWith("sound:")) {
      const n = Number(rest.slice(6));
      const id = ctx.soundIds(selected)[n - 1];
      return id ? `track:${selected.id}:sound.${id}` : null;
    }
    return `track:${selected.id}:${rest}`;
  }
  const byIndex = /^track#(\d+):(.+)$/.exec(target);
  if (byIndex) {
    const t = ctx.project.tracks[Number(byIndex[1]) - 1];
    return t ? `track:${t.id}:${byIndex[2]}` : null;
  }
  // browse:sound, browse:section and modifier:shift resolve to themselves
  return target;
}

/** A concrete target's current value (0..1), for relative steps and pickup; null if unknown. */
export function readTarget(target: string, project: Project): number | null {
  const [kind, id, ...rest] = target.split(":");
  const key = rest.join(":");
  if (kind === "master" && id === "volume") return project.master.volume;
  if (kind === "bus") return project.buses.find((b) => b.id === id)?.volume ?? null;
  if (kind !== "track") return null;
  const t = project.tracks.find((x) => x.id === id);
  if (!t) return null;
  if (key === "volume") return t.volume;
  if (key.startsWith("fx:")) {
    const [, fxId, param] = key.split(":");
    return t.effects.find((f) => f.id === fxId)?.params[param] ?? null;
  }
  return t.params[key] ?? null;
}

// ---------- which mapping (D121) ----------

export interface Incoming {
  kind: "cc" | "note";
  channel: number;
  number: number;
  device: string;
}

const matches = (m: MidiMapping, x: Incoming) =>
  m.type === x.kind &&
  m.channel === x.channel &&
  m.number === x.number &&
  (!m.device || m.device === x.device);

/** The mapping a message hits: the project's first, then your global ones. */
export function findMapping(
  x: Incoming,
  project: MidiMapping[],
  global: MidiMapping[],
): { mapping: MidiMapping; scope: "project" | "global" } | null {
  const p = project.find((m) => matches(m, x));
  if (p) return { mapping: p, scope: "project" };
  const g = global.find((m) => matches(m, x));
  return g ? { mapping: g, scope: "global" } : null;
}

/** Mappings without the ones a new mapping replaces (same target, or same control). */
export function withMapping(list: MidiMapping[], next: MidiMapping): MidiMapping[] {
  return [
    ...list.filter(
      (x) =>
        x.target !== next.target &&
        !(
          x.type === next.type &&
          x.channel === next.channel &&
          x.number === next.number &&
          (!x.device || !next.device || x.device === next.device)
        ),
    ),
    next,
  ];
}

// ---------- notes (D119) ----------

/** "any" = every channel is the pads', "off" = none (0..15 otherwise). */
export type PadsChannel = number | "any" | "off";

/** Where a note goes: a step track by position (pads, 36 = track 1), or the selected Notes track. */
export function routeNote(
  channel: number,
  note: number,
  padsChannel: PadsChannel,
  selectedIsNotes: boolean,
): { to: "pad"; index: number } | { to: "notes" } | null {
  const pad = note >= 36 ? { to: "pad" as const, index: note - 36 } : null;
  const onPads = padsChannel === "any" || padsChannel === channel;
  if (onPads) return pad;
  if (selectedIsNotes) return { to: "notes" };
  return pad;
}

// ---------- pickup (D120) ----------

/**
 * Which of `n` equal zones an absolute knob's value (0..127) is in (D142): a stepped setting
 * read from where the knob points, so every step takes the same turn and both ends are reached.
 */
export function knobZone(value: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.floor((value * n) / 128)));
}

/**
 * Soft takeover for absolute controls: the control moves the target only once it reaches the
 * target's value (passes it, or comes within 3%), so a fader that sits elsewhere doesn't jump.
 */
export function pickedUp(previous: number | undefined, value: number, current: number): boolean {
  if (Math.abs(value - current) <= 0.03) return true;
  if (previous === undefined) return false;
  return (previous - current) * (value - current) <= 0;
}
