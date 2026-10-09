/**
 * Editing a library synth without a track (D91): double-click a synth in the library and the
 * synth editor works on the sound itself. A synth of yours is saved as you go; a factory synth
 * becomes your own copy on the first change (as on tracks, D90). It plays through the library's
 * preview output; edits have their own undo.
 */
import * as Tone from "tone";
import { produce } from "immer";
import { create } from "zustand";
import { createInstrument, type InstrumentVoice } from "../engine/instruments";
import { makeTrack, prefixed } from "../model/project";
import { uid } from "../model/id";
import { SOUND_PARAMS, defaultParams } from "../model/params";
import type { Track } from "../model/types";
import { useStore } from "../state/store";
import { previewInput } from "./audition";
import type { CatalogInstrument } from "./instruments";
import { convertSynthKnobs, detachedTracks, editPatch } from "./synthTrack";
import { saveSoundSoon } from "./userInstruments";

interface Entry {
  track: Track;
  /** Undo/redo: earlier and later versions; edits with the same key in a row merge. */
  past: Track[];
  future: Track[];
  lastKey?: string;
  lastAt: number;
}

export const useLibraryEdits = create<{ entries: Record<string, Entry> }>()(() => ({
  entries: {},
}));

const voices = new Map<string, { voice: InstrumentVoice; out: Tone.Gain }>();

/** The library sound (catalog id) as a track that isn't in the project. */
function trackOf(c: CatalogInstrument): Track {
  const t = makeTrack("instrument", c.low ? "bass" : "keys", c.name, c.name);
  t.instrument = JSON.parse(JSON.stringify(c.source));
  for (const k of Object.keys(t.params)) if (k.startsWith("sound.")) delete t.params[k];
  Object.assign(
    t.params,
    prefixed("sound", defaultParams(SOUND_PARAMS.instrument)),
    c.params ?? {},
  );
  t.effects = JSON.parse(JSON.stringify(c.effects ?? []));
  convertSynthKnobs(t);
  return t;
}

/**
 * Start editing a library synth, or carry on where you were; returns its key. Yours are found by
 * the entry they save to; a factory synth by its id, until its first change makes it a copy
 * (then it's that copy, and the factory synth opens fresh).
 */
export function startLibraryEdit(c: CatalogInstrument): string {
  const entries = useLibraryEdits.getState().entries;
  const found = Object.entries(entries).find(([, e]) => {
    const i = e.track.instrument;
    return c.id.startsWith("user:") ? i?.from === c.id : !i?.from && i?.preset === c.source.preset;
  });
  if (found) return found[0];
  const key = uid("lib");
  const track = trackOf(c);
  detachedTracks.set(track.id, track);
  useLibraryEdits.setState((s) => ({
    entries: { ...s.entries, [key]: { track, past: [], future: [], lastAt: 0 } },
  }));
  return key;
}

function set(key: string, entry: Entry) {
  detachedTracks.set(entry.track.id, entry.track);
  useLibraryEdits.setState((s) => ({ entries: { ...s.entries, [key]: entry } }));
  voices.get(key)?.voice.update(entry.track, useStore.getState().project.bpm);
}

/** Change the sound. A factory synth's first change makes your copy; yours are saved. */
export function updateLibrarySound(key: string, fn: (t: Track) => void, undoKey?: string) {
  const e = useLibraryEdits.getState().entries[key];
  if (!e) return;
  const next = produce(e.track, (t) => {
    fn(t as Track);
    // any change to a factory synth (also just its macros) makes it yours
    if (!t.instrument?.from) editPatch(t as Track, () => {});
  });
  if (next === e.track) return;
  const now = performance.now();
  const merge = undoKey !== undefined && undoKey === e.lastKey && now - e.lastAt < 600;
  set(key, {
    track: next,
    past: merge ? e.past : [...e.past, e.track].slice(-100),
    future: [],
    lastKey: undoKey,
    lastAt: now,
  });
  save(next);
}

function save(t: Track) {
  const from = t.instrument?.from;
  if (from?.startsWith("user:")) saveSoundSoon(from.slice(5), t.id, 600);
}

export function undoLibrarySound(key: string, redo = false) {
  const e = useLibraryEdits.getState().entries[key];
  if (!e) return;
  const stack = redo ? e.future : e.past;
  const prev = stack.at(-1);
  if (!prev) return;
  // the copy made by the first change stays: undo doesn't turn it back into the factory synth
  const now = e.track.instrument;
  const track: Track =
    prev.instrument?.from || !now?.from
      ? prev
      : { ...prev, instrument: { ...prev.instrument!, from: now.from, name: now.name } };
  set(key, {
    track,
    past: redo ? [...e.past, e.track] : e.past.slice(0, -1),
    future: redo ? e.future.slice(0, -1) : [...e.future, e.track],
    lastAt: 0,
  });
  save(track);
}

/** The voice it plays through (the library's preview output). */
export function librarySoundVoice(key: string): InstrumentVoice | undefined {
  const e = useLibraryEdits.getState().entries[key];
  if (!e) return;
  let v = voices.get(key);
  if (!v) {
    const out = previewInput();
    const voice = createInstrument(e.track, out);
    voice.update(e.track, useStore.getState().project.bpm);
    v = { voice, out };
    voices.set(key, v);
  }
  return v.voice;
}

/** Stop editing (the editor tab closed): let its voice go. */
export function endLibraryEdit(key: string) {
  const v = voices.get(key);
  if (!v) return;
  voices.delete(key);
  v.voice.releaseAll(Tone.now());
  setTimeout(() => {
    v.voice.dispose();
    v.out.dispose();
  }, 3000);
}
