/**
 * Synth tracks (§0.6e E): the patch a track plays, its macros as the SOUND knobs, editing the
 * track's copy of the patch, and the one-time conversion of the old SOUND knobs (D85).
 */
import { factorySynth, FACTORY_SYNTHS } from "./synths";
import { paramOf } from "../model/patchParams";
import { SOUND_PARAMS, type ParamDef } from "../model/params";
import { player } from "../model/tracks";
import {
  SOUND_KNOB_DEFAULTS,
  movedKnobs,
  setThroughMacros,
  upgradePatch,
  withKnobs,
  withMacroValues,
  type SynthPatch,
} from "../model/synth";
import type { Sound, Track } from "../model/types";

/** Patches are plain JSON; this also copies out of immer drafts. */
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The synth a voice plays when the track has no sound yet: a bass or a pad. */
export function defaultSynth(track: Pick<Track, "category">): Sound {
  return { source: "synth", preset: track.category === "bass" ? "acid" : "warm-pad" };
}

/** What a track's instrument voice plays (Notes, or Hits of a synth or sampled instrument). */
export const voiceSound = (t: Track): Sound => t.sound ?? defaultSynth(t);

/** The patch a synth plays: its own, or its factory synth's. */
export function patchOf(src: Sound): SynthPatch {
  // patches saved before version 2 are upgraded as they're read
  if (src.patch) return upgradePatch(src.patch);
  return factorySynth(src.preset ?? "")?.patch ?? FACTORY_SYNTHS[0].patch;
}

/** A track that plays a synth, in Notes or Hits mode (its SOUND knobs are the macros). */
export const isSynthTrack = (t: Track) => t.mode !== "clip" && voiceSound(t).source === "synth";

export const trackPatch = (t: Track) => patchOf(voiceSound(t));

export const macroKey = (i: number) => `sound.macro${i + 1}`;

/** Where the track's macros are: its SOUND knobs, else where the patch rests them. */
export const macroValues = (t: Track, patch = trackPatch(t)) =>
  patch.macros.map((m, i) => t.params[macroKey(i)] ?? m.value);

/** What the track plays: its patch with the macros at its SOUND knobs. */
export const effectivePatch = (t: Track, patch = trackPatch(t)) =>
  withMacroValues(patch, macroValues(t, patch));

/** The SOUND knobs of a track: a synth's 8 macros, else the knobs of what plays it (D94). */
export function soundDefs(t: Track): ParamDef[] {
  if (!isSynthTrack(t)) return SOUND_PARAMS[player(t)];
  return trackPatch(t).macros.map((m, i) => ({
    id: `macro${i + 1}`,
    label: m.name || `Macro ${i + 1}`,
    default: m.value,
    format: (v: number) => `${Math.round(v * 100)}%`,
  }));
}

/**
 * What happens around an edit, set by the app (userInstruments.ts): "fork" when an edit turns a
 * factory synth into the track's own named copy (in Your sounds), "edit" for edits after.
 */
/**
 * Tracks that aren't in the project: library sounds open in the synth editor (libraryEdit.ts),
 * by track id, so saving a copy can find them.
 */
export const detachedTracks = new Map<string, Track>();

type PatchHook = (t: Track, event: "fork" | "edit") => void;
let patchHook: PatchHook | null = null;
export const onPatchEdit = (fn: PatchHook) => void (patchHook = fn);

/**
 * Change a synth track's patch (in a store recipe). Factory synths never change: the first edit
 * makes the track's own copy of the patch (D90: with its own name, as one of Your sounds,
 * unless `fork` is false, as in the conversion of old projects). An older (version 1) patch is
 * upgraded.
 */
export function editPatch(t: Track, fn: (p: SynthPatch) => void, fork = true) {
  const src = voiceSound(t);
  if (src.source !== "synth") return;
  if (!t.sound) t.sound = { ...src };
  const factory = !t.sound.patch && !t.sound.from;
  if (t.sound.patch?.version !== 2) t.sound.patch = clone(patchOf(src));
  fn(t.sound.patch as SynthPatch);
  if (fork) patchHook?.(t, factory ? "fork" : "edit");
}

/** Set one patch value; macros that move it keep their place (setThroughMacros). */
export function setSynthParam(t: Track, path: string, v: unknown) {
  editPatch(t, (p) => {
    const d = paramOf(path);
    if (d && typeof v === "number") setThroughMacros(p, path, v, d.min, d.max, macroValues(t, p));
    else setValue(p, path, v);
  });
}

function setValue(p: SynthPatch, path: string, v: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;
  const obj = keys.reduce<Record<string, unknown>>(
    (o, k) => o[k] as Record<string, unknown>,
    p as unknown as Record<string, unknown>,
  );
  obj[last] = v;
}

/** A new sound on the track: its macros start where the new patch rests them. */
export function resetMacros(t: Track) {
  for (const k of Object.keys(t.params)) if (/^sound\.macro\d$/.test(k)) delete t.params[k];
}

const hz = (v: number) => 20 * Math.pow(1000, v);
const qOf = (v: number) => 0.3 + v * v * 18;

/**
 * The one-time conversion (D85): a synth track's moved SOUND knobs (envelope, glide, detune and
 * the filter on top) become edits of its patch, so it sounds the same now that the SOUND knobs
 * are the macros. Step locks on the old knobs, which synths never played, are dropped by the
 * caller. Returns whether anything changed.
 */
export function convertSynthKnobs(t: Track): boolean {
  if (!isSynthTrack(t)) return false;
  const p = t.params;
  const knobs = movedKnobs(p);
  const cutoff = (p["sound.cutoff"] ?? 1) < 0.995;
  if (!knobs.length && !cutoff) return false;
  editPatch(
    t,
    (patch) => {
      const next = withKnobs(patch, p);
      Object.assign(patch, next);
      if (cutoff && !patch.filters[1].on) {
        // the channel filter on top (12 dB low-pass) becomes filter 2; its Q is in dB
        const q = Math.max(0.5, Math.pow(10, qOf(p["sound.reso"] ?? 0.2) / 20));
        patch.filters[1] = {
          on: true,
          model: "svf",
          type: "lp",
          cutoff: Math.min(20000, hz(p["sound.cutoff"] ?? 1)),
          reso: Math.min(0.95, Math.max(0, (2 - 1 / q) / 1.96)),
          drive: 0,
          keytrack: 0,
          env: 0,
          velocity: 0,
        };
        patch.routing = "serial";
        p["sound.cutoff"] = 1;
        p["sound.reso"] = 0.2;
      }
    },
    false,
  );
  for (const k of knobs) p[k] = SOUND_KNOB_DEFAULTS[k];
  return true;
}

/** The explain-mode hint of a SOUND knob (a synth's macros share one). */
export const soundHint = (id: string) =>
  id.startsWith("macro") ? "param.sound.macro" : `param.sound.${id}`;
