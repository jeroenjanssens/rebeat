/**
 * What can be automated (D189): the knobs the engine can move at an audio time. A target is a
 * MIDI-learn target string (D186), so a lane names a knob the same way a mapping does.
 */
import { isSynthTrack, soundDefs } from "../library/synthTrack";
import { EFFECT_PARAMS, MIX_PARAMS, SOUND_PARAMS, type ParamDef } from "./params";
import type { Project } from "./project";
import type { Effect, Track } from "./types";

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
  /** Where it is within its group (D208): its sound, its mix, or one of its effects. */
  section: "Sound" | "Mix" | "Effects";
  /** The effect it belongs to: its id and its name in the list ("Tremolo 2"). */
  effect?: { id: string; name: string };
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
  for (const id of TRACK_MIX)
    out.push({
      target: `${t}:mix.${id}`,
      label: `${track.name} · ${mixDef(id).label}`,
      group: track.name,
      section: "Mix",
      name: mixDef(id).label,
      def: mixDef(id),
    });
  out.push(...fxKnobs(track.effects, t, track.name, track.name));
  return out;
}

/** Every knob for the picker (D208), grouped by track, then the buses and the master; the ones
 * that can't be automated have `why`. */
export function pickerKnobs(project: Project): AutomatableKnob[] {
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
  return pickerKnobs(project).filter((k) => !k.why);
}

/** The knob a target names, if it can be automated. */
export function knobFor(project: Project, target: string): AutomatableKnob | undefined {
  return automatableKnobs(project).find((k) => k.target === target);
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
