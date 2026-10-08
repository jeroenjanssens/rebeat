/**
 * Versioned project files. Every change to the saved shape bumps SCHEMA_VERSION and adds a
 * migration from the previous version, so old projects keep loading.
 */
import { defaultBuses, defaultMaster, defaultPerf } from "./effects";
import { uid } from "./id";
import { EFFECT_PARAMS, MIX_PARAMS, SOUND_PARAMS, defaultParams } from "./params";
import { emptyLane, type Project } from "./project";
import { MAX_STEPS, emptyStep, type Effect, type Lane, type Step } from "./types";

export const SCHEMA_VERSION = 5;

export interface SerializedProject {
  format: "rebeat-project";
  schemaVersion: number;
  project: Project;
}

type Json = Record<string, unknown>;
type Migration = (p: Json) => Json;

/** migrations[n] upgrades a version-n project to version n + 1. */
const migrations: Record<number, Migration> = {
  // 0: the Phase M mockup format (no time signature, global swing, metronome or count-in)
  0: (p) => ({
    timeSignature: [4, 4],
    swing: 0.5,
    metronome: false,
    countIn: false,
    ...p,
  }),
  // 1 → 2: send/return buses, the master chain, the project key, and ids on effects
  1: (p) => {
    const tracks = (p.tracks as { effects?: Json[] }[]) ?? [];
    for (const t of tracks) for (const fx of t.effects ?? []) fx.id ??= uid("fx");
    return {
      buses: defaultBuses(),
      master: defaultMaster(),
      key: { root: 0, scale: "minor" },
      ...p,
    };
  },
  // 2 → 3: notes get their own length and velocity (they used to share the step's)
  2: (p) => {
    for (const pattern of Object.values((p.patterns as Record<string, Json>) ?? {}))
      for (const lane of Object.values((pattern.lanes as Record<string, Json>) ?? {})) {
        if (lane.kind !== "steps") continue;
        for (const s of lane.steps as Json[]) {
          if (Array.isArray(s.notes) && typeof s.notes[0] === "number")
            s.notes = (s.notes as number[]).map((pitch) => ({
              pitch,
              length: (s.length as number) ?? 1,
              velocity: (s.velocity as number) ?? 0.8,
              ...(s.slide ? { slide: true } : {}),
            }));
          delete s.length;
          delete s.slide;
        }
      }
    return p;
  },
  // 3 → 4: MIDI mappings and the performance setup (mute groups, crossfader)
  3: (p) => ({ midiMappings: [], perf: defaultPerf(), ...p }),
  // 4 → 5: the play mode is saved with the project (it used to start as "loop")
  4: (p) => ({ playMode: "song", ...p }),
};

export function serializeProject(project: Project): SerializedProject {
  return { format: "rebeat-project", schemaVersion: SCHEMA_VERSION, project };
}

export function migrate(data: unknown): Json {
  const d = data as Json;
  let version = typeof d.schemaVersion === "number" ? d.schemaVersion : 0;
  let p = (d.format === "rebeat-project" ? d.project : d) as Json;
  if (version > SCHEMA_VERSION)
    throw new Error(`This project was saved by a newer version of Rebeat (schema ${version}).`);
  while (version < SCHEMA_VERSION) {
    p = migrations[version](structuredClone(p));
    version += 1;
  }
  return p;
}

/** Fill in anything missing or inconsistent so the rest of the app can trust the data. */
export function normalizeProject(p: Project): Project {
  p.name ||= "Untitled";
  p.bpm = Math.min(300, Math.max(20, Number(p.bpm) || 120));
  p.tracks ??= [];
  p.patterns ??= {};
  p.slots ??= [];
  for (const t of p.tracks) {
    t.params = {
      ...Object.fromEntries(
        Object.entries(defaultParams(SOUND_PARAMS[t.kind])).map(([k, v]) => [`sound.${k}`, v]),
      ),
      ...Object.fromEntries(
        Object.entries(defaultParams(MIX_PARAMS.filter((d) => d.id !== "volume"))).map(([k, v]) => [
          `mix.${k}`,
          v,
        ]),
      ),
      ...t.params,
    };
    t.effects ??= [];
    t.volume ??= 0.8;
    normalizeEffects(t.effects);
  }
  p.buses ??= defaultBuses();
  p.master ??= defaultMaster();
  p.key ??= { root: 0, scale: "minor" };
  p.midiMappings ??= [];
  p.perf ??= defaultPerf();
  p.perf.muteGroups ??= defaultPerf().muteGroups;
  p.perf.crossfade ??= {};
  for (const b of p.buses) normalizeEffects(b.effects);
  normalizeEffects(p.master.effects);
  for (const pattern of Object.values(p.patterns)) {
    pattern.lanes ??= {};
    for (const t of p.tracks) {
      const lane: Lane | undefined = pattern.lanes[t.id];
      const wantSteps = t.kind !== "audio";
      if (!lane || (lane.kind === "steps") !== wantSteps) {
        pattern.lanes[t.id] = emptyLane(t.kind);
        continue;
      }
      if (lane.kind === "steps") {
        const steps: Step[] = lane.steps ?? [];
        for (let i = 0; i < MAX_STEPS; i++) steps[i] = { ...emptyStep(), ...steps[i] };
        steps.length = MAX_STEPS;
        lane.steps = steps;
      }
    }
    for (const id of Object.keys(pattern.lanes))
      if (!p.tracks.some((t) => t.id === id)) delete pattern.lanes[id];
  }
  p.slots = p.slots.filter((s) => p.patterns[s.patternId]);
  if (p.slots.length === 0) {
    const first = Object.keys(p.patterns)[0];
    if (first) p.slots.push({ id: `slot-${first}`, patternId: first, repeats: 1 });
  }
  return p;
}

function normalizeEffects(list: Effect[]) {
  for (const fx of list) {
    fx.id ??= uid("fx");
    fx.params = { ...defaultParams(EFFECT_PARAMS[fx.name] ?? []), ...fx.params };
  }
}

export function deserializeProject(data: unknown): Project {
  return normalizeProject(migrate(data) as unknown as Project);
}

/** Sample ids a project uses (for export and "used in project"). */
export function projectSampleIds(p: Project): string[] {
  const ids = new Set<string>();
  for (const t of p.tracks) {
    if (t.sampleId) ids.add(t.sampleId);
    for (const l of t.layers ?? []) ids.add(l.sampleId);
    if (t.instrument?.sampleId) ids.add(t.instrument.sampleId);
    for (const z of t.instrument?.zones ?? []) ids.add(z.sampleId);
  }
  return [...ids];
}
