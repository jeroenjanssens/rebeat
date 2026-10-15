/**
 * Versioned project files. Every change to the saved shape bumps SCHEMA_VERSION and adds a
 * migration from the previous version, so old projects keep loading.
 */
import { defaultBuses, defaultMaster, defaultPerf } from "./effects";
import { uid } from "./id";
import { EFFECT_PARAMS, MIX_PARAMS, SOUND_PARAMS, defaultParams } from "./params";
import { emptyLane, type Project } from "./project";
import { steppedPoints } from "./steppedLanes";
import { sanitizeBend } from "./bend";
import { clampBpm } from "./tempoMap";
import { player } from "./tracks";
import {
  MAX_STEPS,
  emptyStep,
  type AutomationLane,
  type Effect,
  type Lane,
  type Sound,
  type Step,
  type Track,
} from "./types";
import { convertSynthKnobs, defaultSynth } from "../library/synthTrack";

export const SCHEMA_VERSION = 13;

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
  // 5 → 6: a synth track's SOUND knobs are its macros; moved ones become patch edits (D85)
  5: (p) => {
    const synths = new Set<string>();
    for (const t of (p.tracks as Json[]) ?? []) {
      const src = t.instrument as Json | undefined;
      if (!t.params || t.kind !== "instrument" || (src?.source ?? "synth") !== "synth") continue;
      synths.add(t.id as string);
      // the conversion works on step tracks (version 7), so these change shape now; the rest of
      // the project follows in 6 → 7. It reads the old knob names, so they aren't renamed.
      toStepTrack(t, false);
      convertSynthKnobs(t as unknown as Track);
    }
    // step locks on the old knobs (synths never played them)
    for (const pattern of Object.values((p.patterns as Record<string, Json>) ?? {}))
      for (const [id, lane] of Object.entries((pattern.lanes as Record<string, Json>) ?? {})) {
        if (!synths.has(id) || lane.kind !== "steps") continue;
        for (const s of lane.steps as Step[]) {
          if (!s.locks) continue;
          for (const k of Object.keys(s.locks)) if (k.startsWith("sound.")) delete s.locks[k];
          if (!Object.keys(s.locks).length) delete s.locks;
        }
      }
    return p;
  },
  // 6 → 7: step tracks (D93, D94). Track kinds become modes (drum → Hits, instrument → Notes,
  // audio → Clip), sample ids and instrument sources become the track's sound, every lane has
  // steps (clip lanes keep their settings beside them), and the ADSR decay of voices is renamed
  // (`sound.decay` is the decay of hits), in params, step locks and MIDI mappings
  6: (p) => {
    const renamed = new Set<string>();
    for (const t of (p.tracks as Json[]) ?? []) {
      if (t.kind === "instrument") renamed.add(t.id as string);
      if (t.kind) toStepTrack(t);
    }
    for (const pattern of Object.values((p.patterns as Record<string, Json>) ?? {}))
      for (const [id, raw] of Object.entries((pattern.lanes as Record<string, Json>) ?? {})) {
        const lane = raw as Json;
        if (lane.kind === "clip") {
          lane.clip = { active: lane.active, launchMode: lane.launchMode };
          lane.steps = Array.from({ length: MAX_STEPS }, emptyStep);
          delete lane.active;
          delete lane.launchMode;
        }
        delete lane.kind;
        if (renamed.has(id))
          for (const s of (lane.steps as Step[]) ?? []) if (s?.locks) renameDecay(s.locks);
      }
    for (const m of (p.midiMappings as { target: string }[]) ?? []) {
      const [, id, param] = m.target.split(":");
      if (m.target.startsWith("track:") && renamed.has(id) && param === "sound.decay")
        m.target = `track:${id}:sound.envDecay`;
    }
    return p;
  },
  // 7 → 8: MIDI mappings say how their control sends values (D120); the old ones were absolute
  7: (p) => {
    for (const m of (p.midiMappings as Json[]) ?? []) m.mode ??= "absolute";
    return p;
  },
  // 8 → 9: Note.offset (D128) — optional field added; no data to migrate
  8: (p) => p,
  // 9 → 10: section settings, tempo changes, automation and timeline audio (D182) — all optional
  9: (p) => p,
  // 10 → 11: eases per point (D196): a held point is an ease out of None
  10: (p) => {
    for (const lane of (p.automation as Json[] | undefined) ?? [])
      for (const pt of (lane.points as Json[] | undefined) ?? [])
        if ("hold" in pt) {
          if (pt.hold) pt.out = { type: "none" };
          delete pt.hold;
        }
    return p;
  },
  // 11 → 12: stepped lanes (D229, D230), bends per note (D224), folded lanes (D233); the bends
  // and folds are optional. Lanes on stepped knobs (an effect's On, Bits…) used to slope and
  // flip where they crossed a band: they keep that, as points on the bands.
  11: (p) => {
    const lanes = (p.automation as AutomationLane[] | undefined) ?? [];
    for (const lane of lanes) {
      const steps = fxSteps(p, lane.target);
      if (steps) lane.points = steppedPoints(p as unknown as Project, lane.points, steps);
    }
    return p;
  },
  // 12 → 13: synth patches version 3 (D257: wavetable oscillators, physical models); a track's
  // patch is upgraded when it's read (upgradePatch), so nothing moves here
  12: (p) => p,
};

/** The number of values of an effect knob a target names (0: smooth, or not an effect's). */
function fxSteps(p: Json, target: string): number {
  const m = /:fx:([^:]+):([^:]+)$/.exec(target);
  if (!m) return 0;
  const [, fxId, param] = m;
  if (param === "on") return 2;
  const chains = [
    ...((p.tracks as Track[] | undefined) ?? []).map((t) => t.effects),
    ...((p.buses as { effects: Effect[] }[] | undefined) ?? []).map((b) => b.effects),
    (p.master as { effects?: Effect[] } | undefined)?.effects,
  ];
  const fx = chains.flatMap((c) => c ?? []).find((e) => e.id === fxId);
  const steps = fx ? EFFECT_PARAMS[fx.name]?.find((d) => d.id === param)?.steps : 0;
  return steps && steps >= 2 ? steps : 0;
}

/** The ADSR decay of a voice's SOUND knobs, renamed in version 7. */
function renameDecay(values: Record<string, number>) {
  if (!("sound.decay" in values)) return;
  values["sound.envDecay"] = values["sound.decay"];
  delete values["sound.decay"];
}

/** A version 6 instrument source as a sound (D94): samplers become samples or multi-samples. */
export function soundFromV6(src: Json): Sound {
  const { source, ...rest } = src as unknown as Omit<Sound, "source"> & { source: string };
  if (source !== "sampler") return { source, ...rest } as Sound;
  const { name, from, zones, sampleId, rootNote } = rest;
  const extra = { ...(name ? { name } : {}), ...(from ? { from } : {}) };
  if (zones?.length) return { source: "multi", zones, ...(rootNote ? { rootNote } : {}), ...extra };
  return { source: "sample", sampleId, rootNote: rootNote ?? 60, ...extra };
}

/** A version 6 track (drum, instrument or audio) as a step track (version 7), in place. */
function toStepTrack(t: Json, rename = true) {
  const kind = t.kind;
  const sampleId = t.sampleId as string | undefined;
  const instrument = t.instrument as Json | undefined;
  delete t.kind;
  delete t.sampleId;
  delete t.instrument;
  if (kind === "instrument") {
    t.mode = "notes";
    // without a source, instrument tracks played a default synth (by category)
    t.sound = instrument
      ? soundFromV6(instrument)
      : defaultSynth({ category: t.category as Track["category"] });
    if (rename && t.params) renameDecay(t.params as Record<string, number>);
  } else {
    t.mode = kind === "audio" ? "clip" : "hits";
    if (sampleId) t.sound = { source: "sample", sampleId } satisfies Sound;
  }
}

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
    if (!["hits", "notes", "clip"].includes(t.mode)) t.mode = "hits";
    t.params = {
      ...Object.fromEntries(
        Object.entries(defaultParams(SOUND_PARAMS[player(t)])).map(([k, v]) => [`sound.${k}`, v]),
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
      if (!lane) {
        pattern.lanes[t.id] = emptyLane(t.mode);
        continue;
      }
      const steps: Step[] = lane.steps ?? [];
      for (let i = 0; i < MAX_STEPS; i++) {
        steps[i] = { ...emptyStep(), ...steps[i] };
        // strip the legacy locked flag (Q2: removed without a schema bump)
        delete (steps[i] as { locked?: unknown }).locked;
        // sanitize Note.offset: clamp to −0.5..0.5 and drop 0 (undefined = no offset)
        for (const n of steps[i].notes ?? []) {
          if (n.offset !== undefined) {
            n.offset = Math.max(-0.5, Math.min(0.5, n.offset));
            if (n.offset === 0) delete n.offset;
          }
          // a note's bend (D224): kept when it's one, else dropped
          if (n.bend !== undefined) {
            const bend = sanitizeBend(n.bend);
            if (bend) n.bend = bend;
            else delete n.bend;
          }
        }
      }
      steps.length = MAX_STEPS;
      lane.steps = steps;
    }
    for (const id of Object.keys(pattern.lanes))
      if (!p.tracks.some((t) => t.id === id)) delete pattern.lanes[id];
  }
  p.slots = p.slots.filter((s) => p.patterns[s.patternId]);
  if (p.slots.length === 0) {
    const first = Object.keys(p.patterns)[0];
    if (first) p.slots.push({ id: `slot-${first}`, patternId: first, repeats: 1 });
  }
  normalizeArrangement(p);
  return p;
}

/** Section settings in range; tempo changes, automation and regions without their section,
 * track or target dropped (D182). */
function normalizeArrangement(p: Project) {
  const trackIds = new Set(p.tracks.map((t) => t.id));
  const slotIds = new Set(p.slots.map((s) => s.id));
  for (const s of p.slots) {
    s.repeats = Math.max(1, Math.min(64, Math.round(s.repeats) || 1));
    if (s.mutes) {
      s.mutes = s.mutes.filter((id) => trackIds.has(id));
      if (!s.mutes.length) delete s.mutes;
    }
    if (s.transpose !== undefined) {
      s.transpose = Math.max(-12, Math.min(12, Math.round(s.transpose)));
      if (!s.transpose) delete s.transpose;
    }
    if (s.fill !== undefined && s.fill !== "last" && s.fill !== "all") delete s.fill;
    const n = p.patterns[s.patternId].stepCount;
    if (s.steps !== undefined) {
      s.steps = Math.max(1, Math.round(s.steps));
      if (s.steps >= n) delete s.steps;
    }
  }
  const anchored = (a: { slotId: string; at: number }) =>
    slotIds.has(a.slotId) && Number.isFinite(a.at) && a.at >= 0;
  if (p.tempo) {
    p.tempo = p.tempo.filter(anchored);
    for (const t of p.tempo) t.bpm = clampBpm(t.bpm);
    if (!p.tempo.length) delete p.tempo;
  }
  if (p.automation) {
    p.automation = p.automation.filter((l) => {
      const [kind, id] = l.target.split(":");
      return kind !== "track" || trackIds.has(id);
    });
    for (const l of p.automation) {
      l.id ??= uid("auto");
      l.on ??= true;
      l.points = (l.points ?? []).filter(anchored);
      for (const pt of l.points) pt.value = Math.max(0, Math.min(1, pt.value));
      if (l.folded !== true) delete l.folded;
    }
    if (!p.automation.length) delete p.automation;
  }
  if (p.timelineFolded !== undefined) {
    const list = Array.isArray(p.timelineFolded)
      ? p.timelineFolded.filter((o) => typeof o === "string")
      : [];
    if (list.length) p.timelineFolded = list;
    else delete p.timelineFolded;
  }
  if (p.regions) {
    p.regions = p.regions.filter(
      (r) => trackIds.has(r.trackId) && anchored(r.start) && r.length > 0 && r.sampleId,
    );
    for (const r of p.regions) r.offset = Math.max(0, r.offset || 0);
    if (!p.regions.length) delete p.regions;
  }
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
    for (const l of t.layers ?? []) ids.add(l.sampleId);
    // samples, and SoundFont files (sf2:…)
    if (t.sound?.sampleId) ids.add(t.sound.sampleId);
    for (const z of t.sound?.zones ?? []) ids.add(z.sampleId);
  }
  for (const r of p.regions ?? []) ids.add(r.sampleId);
  return [...ids];
}
