/**
 * What can be automated (D189): the knobs the engine can move at an audio time. A target is a
 * MIDI-learn target string (D186), so a lane names a knob the same way a mapping does.
 */
import { isSynthTrack, soundDefs } from "../library/synthTrack";
import { EFFECT_PARAMS, MIX_PARAMS, SOUND_PARAMS, type ParamDef } from "./params";
import type { Project } from "./project";
import type { Effect, Track } from "./types";

/** Effect parameters with an audio-time path (`FxNode.automate`). */
export const AUTOMATABLE_FX: Record<string, string[]> = {
  Filter: ["cutoff", "reso"],
  Delay: ["mix", "feedback"],
  Reverb: ["mix"],
  EQ3: ["low", "mid", "high"],
  Pump: ["depth"],
};

/** A track's automatable mix knobs (channel values). */
const TRACK_MIX = ["pan", "width", "sendA", "sendB", "low", "mid", "high"];

export interface AutomatableKnob {
  target: string;
  /** "Pad · Brightness" */
  label: string;
  /** The group in the picker: a track's name, "Master" or a bus. */
  group: string;
  def: ParamDef;
}

const VOLUME = MIX_PARAMS.find((d) => d.id === "volume")!;
const mixDef = (id: string) => MIX_PARAMS.find((d) => d.id === id)!;

function fxKnobs(fx: Effect[], prefix: string, group: string, owner: string): AutomatableKnob[] {
  const out: AutomatableKnob[] = [];
  for (const e of fx) {
    const defs = EFFECT_PARAMS[e.name] ?? [];
    // every effect's mix (its wet and dry gains), and the knobs with an audio-time path
    const ids = new Set([
      ...(defs.some((d) => d.id === "mix") ? ["mix"] : []),
      ...(AUTOMATABLE_FX[e.name] ?? []),
    ]);
    for (const id of ids) {
      const def = defs.find((d) => d.id === id);
      if (!def) continue;
      out.push({
        target: `${prefix}:fx:${e.id}:${id}`,
        label: `${owner} · ${e.name} ${def.label}`,
        group,
        def,
      });
    }
  }
  return out;
}

/** A track's automatable knobs: level, mix, its sound's filter (samples) or macros (synths). */
export function trackKnobs(track: Track): AutomatableKnob[] {
  const t = `track:${track.id}`;
  const out: AutomatableKnob[] = [
    { target: `${t}:volume`, label: `${track.name} · Level`, group: track.name, def: VOLUME },
  ];
  if (isSynthTrack(track))
    for (const def of soundDefs(track))
      out.push({
        target: `${t}:sound.${def.id}`,
        label: `${track.name} · ${def.label}`,
        group: track.name,
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
          def,
        });
    }
  for (const id of TRACK_MIX)
    out.push({
      target: `${t}:mix.${id}`,
      label: `${track.name} · ${mixDef(id).label}`,
      group: track.name,
      def: mixDef(id),
    });
  out.push(...fxKnobs(track.effects, t, track.name, track.name));
  return out;
}

/** Every automatable knob in a project, grouped by track, then the buses and the master. */
export function automatableKnobs(project: Project): AutomatableKnob[] {
  const out = project.tracks.flatMap(trackKnobs);
  for (const b of project.buses) {
    const name = `Bus ${b.name}`;
    out.push({ target: `bus:${b.id}`, label: `${name} · Level`, group: name, def: VOLUME });
    out.push(...fxKnobs(b.effects, `bus:${b.id}`, name, name));
  }
  out.push({ target: "master:volume", label: "Master · Level", group: "Master", def: VOLUME });
  out.push(...fxKnobs(project.master.effects, "master", "Master", "Master"));
  return out;
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
    return list.find((f) => f.id === fxId)?.params[param] ?? 0.5;
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
