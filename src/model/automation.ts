/**
 * What can be automated (D189): the knobs the engine can move at an audio time. A target is a
 * MIDI-learn target string (D186), so a lane names a knob the same way a mapping does.
 */
import { isDraft } from "immer";
import { curveAt, lanePoints, type ResolvedPoint } from "./arrangement";
import { effectivePatch, isSynthTrack, soundDefs, trackPatch } from "../library/synthTrack";
import { EFFECT_PARAMS, MIX_PARAMS, SOUND_PARAMS, type ParamDef } from "./params";
import { KNOB_SECTIONS, getPath, knobDef, paramName, paramOf, toKnob } from "./patchParams";
import { SWITCHES, switchAt, switchDef, switchIndex, switchOf } from "./patchSwitches";
import type { Project } from "./project";
import { applyMacros, type SynthPatch } from "./synth";
import { tableName } from "./wavetables";
import type { AutomationLane, Effect, Track } from "./types";

/**
 * Effect knobs that can't move at an audio time (D206): changing them builds the effect again.
 * Every other effect knob can be automated, and so can every effect's On (D207).
 */
export const NOT_AUTOMATABLE: Record<string, Record<string, string>> = {
  Reverb: {
    size: "Changing it builds a new reverb",
    decay: "Changing it builds a new reverb",
    predelay: "Changing it builds a new reverb",
  },
  Delay: { spread: "Switching it builds a new delay" },
  Filter: { type: "Switching it builds a new filter" },
};

/** Every effect's on/off, as a knob (D207): off below the middle. */
export const FX_ON: ParamDef = {
  id: "on",
  label: "On",
  default: 1,
  steps: 2,
  format: (v) => (v >= 0.5 ? "On" : "Off"),
};

/** A track's automatable mix knobs (channel values). */
const TRACK_MIX = ["pan", "width", "sendA", "sendB", "low", "mid", "high"];

export interface AutomatableKnob {
  target: string;
  /** "Pad · Brightness" */
  label: string;
  /** The group in the picker: a track's name, "Master" or a bus. */
  group: string;
  /** Where it is within its group (D208): its sound, its synth's own knobs (D226), its mix, or
   * one of its effects. */
  section: "Sound" | "Synth" | "Mix" | "Effects";
  /** The effect it belongs to: its id and its name in the list ("Tremolo 2"). */
  effect?: { id: string; name: string };
  /** The part of the synth it belongs to ("Filter 1"), folding in the picker like an effect. */
  part?: { id: string; name: string };
  /** Something to know about automating it ("From the next note"), shown in the picker. */
  note?: string;
  /** The knob's own name ("Rate"). */
  name: string;
  def: ParamDef;
  /** Why it can't be automated (shown, greyed, in the picker). */
  why?: string;
}

const VOLUME = MIX_PARAMS.find((d) => d.id === "volume")!;
const mixDef = (id: string) => MIX_PARAMS.find((d) => d.id === id)!;

/** Effects with their names in a list: a second Tremolo is "Tremolo 2". */
export function effectNames(fx: Effect[]): string[] {
  const seen: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const e of fx) counts[e.name] = (counts[e.name] ?? 0) + 1;
  return fx.map((e) => {
    seen[e.name] = (seen[e.name] ?? 0) + 1;
    return counts[e.name] > 1 && seen[e.name] > 1 ? `${e.name} ${seen[e.name]}` : e.name;
  });
}

/** An effect chain's knobs: every knob and its On, the ones that rebuild it with `why`. */
function fxKnobs(fx: Effect[], prefix: string, group: string, owner: string): AutomatableKnob[] {
  const out: AutomatableKnob[] = [];
  const names = effectNames(fx);
  fx.forEach((e, i) => {
    const defs = EFFECT_PARAMS[e.name] ?? [];
    const effect = { id: e.id ?? "", name: names[i] };
    for (const def of [FX_ON, ...defs])
      out.push({
        target: `${prefix}:fx:${e.id}:${def.id}`,
        label: `${owner} · ${names[i]} ${def.label}`,
        group,
        section: "Effects",
        effect,
        name: def.label,
        def,
        why: NOT_AUTOMATABLE[e.name]?.[def.id],
      });
  });
  return out;
}

/** What a synth track sounds like at rest: its patch with the macros at its knobs, applied
 * (the values its editor's knobs show). Cached per track: tracks are immutable outside drafts. */
const heard = new WeakMap<Track, SynthPatch>();
function heardPatch(track: Track): SynthPatch {
  if (isDraft(track)) return applyMacros(effectivePatch(track));
  let p = heard.get(track);
  if (!p) heard.set(track, (p = applyMacros(effectivePatch(track))));
  return p;
}

/** Synth knobs that only change the next notes (D226). */
const NEXT_NOTE =
  /^(osc\.\d\.phase|envs\.\d\.velocity|lfos\.\d\.phase|voice\.velocityCurve|voice\.voices|physical\.exciter\.(level|velocity))$/;

/** The parts of a patch it uses (D241, D249): a physical model's only with that source, a
 * wavetable's knobs and switches only on wavetable oscillators. Lanes on the others stay. */
function inUse(base: SynthPatch, section: string, path: string) {
  if (section === "exciter" || section === "resonator" || section === "body")
    return base.source === "physical";
  const wt = /^osc\.(\d)\.(position|warpAmount|slot|warp|smooth)$/.exec(path);
  return !wt || base.osc[Number(wt[1])].type === "wavetable";
}

/** A slot switch's lane names the tables in its slots (D248). */
function slotDef(base: SynthPatch, path: string, def: ParamDef): ParamDef {
  const m = /^osc\.(\d)\.slot$/.exec(path);
  if (!m) return def;
  const o = base.osc[Number(m[1])];
  const names = [o.table, ...o.tables].map(tableName);
  return {
    ...def,
    format: (k) => {
      const i = Math.round(Math.min(1, Math.max(0, k)) * ((def.steps ?? 2) - 1));
      return names[i] ? `${i + 1}: ${names[i]}` : `${i + 1}: (slot 1's)`;
    },
  };
}

/** Every knob of a synth track's patch (D226), by part, with what to know about each. */
function synthKnobs(track: Track): AutomatableKnob[] {
  const t = `track:${track.id}`;
  const base = trackPatch(track);
  // which macros move each knob
  const movedBy = new Map<string, string[]>();
  base.macros.forEach((m, i) => {
    for (const target of m.targets) {
      const list = movedBy.get(target.path) ?? [];
      list.push(`${m.name || `Macro ${i + 1}`} (macro ${i + 1})`);
      movedBy.set(target.path, list);
    }
  });
  const out: AutomatableKnob[] = [];
  for (const section of KNOB_SECTIONS) {
    const part = { id: `synth:${section.id}`, name: section.title };
    // its switches first (D231), as the editor shows them above the knobs
    for (const sw of SWITCHES.filter(
      (x) => x.section === section.id && inUse(base, x.section, x.path),
    ))
      out.push({
        target: `${t}:synth:${sw.path}`,
        label: `${track.name} · ${section.short ? `${section.short} · ` : ""}${sw.label}`,
        group: track.name,
        section: "Synth",
        part,
        name: sw.label,
        def: slotDef(base, sw.path, switchDef(sw, switchAt(base, sw.path), base)),
        note: sw.nextNote ? "From the next note" : undefined,
      });
    for (const d of section.params) {
      if (!inUse(base, section.id, d.path)) continue;
      const lfo = /^lfos\.(\d)\.phase$/.exec(d.path);
      const notes: string[] = [];
      if (NEXT_NOTE.test(d.path)) notes.push("From the next note");
      if (/^osc\.\d\.unison$/.test(d.path)) notes.push("A change during a note can click");
      const macros = movedBy.get(d.path);
      if (macros)
        notes.push(`${macros.join(", ")} moves this too; its lane decides while it plays`);
      out.push({
        target: `${t}:synth:${d.path}`,
        label: `${track.name} · ${paramName(d.path)}`,
        group: track.name,
        section: "Synth",
        part: { id: `synth:${section.id}`, name: section.title },
        name: d.label,
        def: knobDef(d, getPath(base, d.path) ?? d.min),
        note: notes.join(". ") || undefined,
        why:
          lfo && base.lfos[Number(lfo[1])].mode === "global"
            ? "A global LFO's phase is only set when the synth starts"
            : undefined,
      });
    }
  }
  return out;
}

/** A track's automatable knobs: level, mix, its sound's filter (samples) or macros (synths). */
export function trackKnobs(track: Track): AutomatableKnob[] {
  const t = `track:${track.id}`;
  const out: AutomatableKnob[] = [
    {
      target: `${t}:volume`,
      label: `${track.name} · Level`,
      group: track.name,
      section: "Mix",
      name: "Level",
      def: VOLUME,
    },
  ];
  if (isSynthTrack(track))
    for (const def of soundDefs(track))
      out.push({
        target: `${t}:sound.${def.id}`,
        label: `${track.name} · ${def.label}`,
        group: track.name,
        section: "Sound",
        name: def.label,
        def,
      });
  else
    for (const id of ["cutoff", "reso"]) {
      const def = Object.values(SOUND_PARAMS)
        .flat()
        .find((d) => d.id === id);
      if (def)
        out.push({
          target: `${t}:sound.${id}`,
          label: `${track.name} · ${def.label}`,
          group: track.name,
          section: "Sound",
          name: def.label,
          def,
        });
    }
  if (isSynthTrack(track)) out.push(...synthKnobs(track));
  for (const id of TRACK_MIX)
    out.push({
      target: `${t}:mix.${id}`,
      label: `${track.name} · ${mixDef(id).label}`,
      group: track.name,
      section: "Mix",
      // the sends are named after their buses ("Reverb"): say they're sends
      name: id.startsWith("send") ? `${mixDef(id).label} send` : mixDef(id).label,
      def: mixDef(id),
    });
  out.push(...fxKnobs(track.effects, t, track.name, track.name));
  return out;
}

/** The lists per project (D226: a synth track adds about a hundred knobs; the lanes, the knob
 * menus and the override watcher ask on every render and commit). Drafts aren't cached. */
const lists = new WeakMap<
  Project,
  { all: AutomatableKnob[]; ok: AutomatableKnob[]; by: Map<string, AutomatableKnob> }
>();
function knobLists(project: Project) {
  let l = lists.get(project);
  if (l) return l;
  const all = buildPickerKnobs(project);
  l = { all, ok: all.filter((k) => !k.why), by: new Map(all.map((k) => [k.target, k])) };
  if (!isDraft(project) && !isDraft(project.tracks)) lists.set(project, l);
  return l;
}

/** Every knob for the picker (D208), grouped by track, then the buses and the master; the ones
 * that can't be automated have `why`. */
export function pickerKnobs(project: Project): AutomatableKnob[] {
  return knobLists(project).all;
}

function buildPickerKnobs(project: Project): AutomatableKnob[] {
  const out = project.tracks.flatMap(trackKnobs);
  const level = (target: string, group: string): AutomatableKnob => ({
    target,
    label: `${group} · Level`,
    group,
    section: "Mix",
    name: "Level",
    def: VOLUME,
  });
  for (const b of project.buses) {
    const name = `Bus ${b.name}`;
    out.push(level(`bus:${b.id}`, name));
    out.push(...fxKnobs(b.effects, `bus:${b.id}`, name, name));
  }
  out.push(level("master:volume", "Master"));
  out.push(...fxKnobs(project.master.effects, "master", "Master", "Master"));
  return out;
}

/** Every automatable knob in a project, grouped by track, then the buses and the master. */
export function automatableKnobs(project: Project): AutomatableKnob[] {
  return knobLists(project).ok;
}

/**
 * A lane's name: its knob ("Pad · Brightness", or without the owner "Brightness"), or what
 * became of it: an effect that was removed (D209), or a knob that's gone.
 */
export function laneTitle(project: Project, target: string, short = false): string {
  const knob = knobLists(project).by.get(target);
  if (knob) return short ? knob.label.split(" · ").slice(1).join(" · ") : knob.label;
  return target.includes(":fx:") ? "Effect removed" : "Knob gone";
}

/** The knob a target names, if it can be automated. */
export function knobFor(project: Project, target: string): AutomatableKnob | undefined {
  const k = knobLists(project).by.get(target);
  return k && !k.why ? k : undefined;
}

export const isAutomatable = (project: Project, target: string) => !!knobFor(project, target);

/** Who a target belongs to: a track id, "master" or a bus id. */
export function targetOwner(target: string): { kind: "track" | "bus" | "master"; id: string } {
  const [kind, id] = target.split(":");
  if (kind === "track") return { kind, id };
  if (kind === "bus") return { kind, id };
  return { kind: "master", id: "master" };
}

/** A target's current value from the project (the knob's own position, 0..1). */
export function knobValue(project: Project, target: string): number {
  const [kind, id, ...rest] = target.split(":");
  const key = rest.join(":");
  const fxValue = (list: Effect[], k: string) => {
    const [, fxId, param] = k.split(":");
    const fx = list.find((f) => f.id === fxId);
    if (param === "on") return fx?.bypass ? 0 : 1;
    return (
      fx?.params[param] ??
      EFFECT_PARAMS[fx?.name ?? ""]?.find((d) => d.id === param)?.default ??
      0.5
    );
  };
  if (kind === "master")
    return id === "volume"
      ? project.master.volume
      : fxValue(project.master.effects, `fx:${rest.join(":")}`);
  if (kind === "bus") {
    const b = project.buses.find((x) => x.id === id);
    if (!b) return 0;
    return key ? fxValue(b.effects, key) : b.volume;
  }
  const t = project.tracks.find((x) => x.id === id);
  if (!t) return 0;
  if (key === "volume") return t.volume;
  if (key.startsWith("fx:")) return fxValue(t.effects, key);
  if (key.startsWith("synth:")) {
    // the knob as its editor shows it (macros applied): a hand on it moves this
    const path = key.slice(6);
    const sw = switchOf(path);
    if (sw)
      return isSynthTrack(t)
        ? switchIndex(sw, switchAt(heardPatch(t), path)) / (sw.options.length - 1)
        : 0;
    const d = paramOf(path);
    const v = isSynthTrack(t) ? getPath(heardPatch(t), path) : undefined;
    return d && typeof v === "number" ? Math.min(1, Math.max(0, toKnob(d, v))) : 0;
  }
  return t.params[key] ?? 0.5;
}

/**
 * Fewer points with the same shape (Ramer–Douglas–Peucker), for recorded automation (D191):
 * points within `tolerance` (0..1 of the range) of the line between their neighbours go.
 */
export function thinPoints<T extends { q: number; value: number }>(
  points: T[],
  tolerance = 0.01,
): T[] {
  if (points.length < 3) return points;
  let worst = 0;
  let at = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const t = b.q === a.q ? 0 : (p.q - a.q) / (b.q - a.q);
    const d = Math.abs(p.value - (a.value + t * (b.value - a.value)));
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tolerance) return [a, b];
  return [
    ...thinPoints(points.slice(0, at + 1), tolerance).slice(0, -1),
    ...thinPoints(points.slice(at), tolerance),
  ];
}

/** How many values a lane's knob has (D229): 0 for a smooth knob, 2 for an on/off… */
export function laneSteps(project: Project, target: string): number {
  const n = knobLists(project).by.get(target)?.def.steps ?? 0;
  return n >= 2 ? n : 0;
}

/** A lane's points as they play: eased, or held from band to band on a stepped lane. */
export function lanePointsOf(project: Project, lane: AutomationLane): ResolvedPoint[] {
  return lanePoints(project, lane.points, laneSteps(project, lane.target));
}

/** A lane's value at song position q, as it plays. */
export function laneValueAt(project: Project, lane: AutomationLane, q: number): number | null {
  return curveAt(lanePointsOf(project, lane), q);
}

/** The names of a stepped knob's values ("Off", "On"), lowest first. */
export function stepLabels(def: ParamDef): string[] {
  const n = def.steps ?? 0;
  return n >= 2 ? Array.from({ length: n }, (_, i) => def.format(i / (n - 1))) : [];
}
