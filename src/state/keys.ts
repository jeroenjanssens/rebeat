/**
 * The keys (D126): what MIDI keyboards, the on-screen keyboard, the computer keys and the piano
 * roll's key column play. Their target is the selected track (the default), one track you lock
 * them to, or a library sound that isn't on a track (it plays through the Keys strip). Every
 * held note goes through `noteOn`, which plays it on the target's own live voice (so it never
 * cuts what the sequencer plays on that track) and records it when recording.
 */
import { create } from "zustand";
import {
  audioNow,
  createKeysChannel,
  disposeKeysChannel,
  getKeysChannel,
  holdNote,
  editorSynth,
  trigger,
} from "../engine/engine";
import { noteName } from "../model/notes";
import type { Track } from "../model/types";
import { player } from "../model/tracks";
import { recordNoteOff, recordNoteOn, playedNotes, padInput } from "./input";
import { useSettings } from "./settings";
import { useStore } from "./store";

export type KeysTarget =
  | { kind: "selected" }
  | { kind: "track"; id: string }
  /** A library sound: a catalog entry ("catalog", its id) or a sample ("sample", its id). */
  | { kind: "sound"; source: "catalog" | "sample"; id: string; name: string };

/** Where a held note came from (for the monitor and the Controller panel). */
export type KeysSource = "midi" | "screen" | "computer" | "piano-roll";

/**
 * A synth editor the keys can follow (D132): its track, or a library sound's own voice (D91).
 * Editors register while they're open; the one in focus (the synth editor panel activated
 * last, while it's open) is the one followed.
 */
export interface KeysEditor {
  panelId: string;
  /** The sound's name (a library synth's; a track's comes from the track). */
  name: string;
  trackId?: string;
  hold?: (pitch: number, velocity: number) => () => void;
  control?: (name: "modwheel" | "aftertouch" | "pitchbend", value: number) => void;
}

const editors = new Map<string, KeysEditor>();

interface KeysState {
  target: KeysTarget;
  /** The synth editor panel in focus (activated last, still open), and a counter that moves
   * when editors register or change, so what shows the keys' name redraws. */
  focused: string | null;
  editors: number;
  /** A sample on the keys: the key that plays it as it is (D133). */
  root: number | null;
  /** "loading" while a library sound's voice gets its samples. */
  status: "ready" | "loading" | "error";
  /** Recent library sounds put on the keys (newest first, at most 8). */
  recent: Extract<KeysTarget, { kind: "sound" }>[];
}

export const useKeys = create<KeysState>()(() => ({
  target: { kind: "selected" },
  focused: null,
  editors: 0,
  root: null,
  status: "ready",
  recent: [],
}));

export function setKeysTarget(target: KeysTarget) {
  // picking a target is picking it instead of the synth editor
  if (useSettings.getState().keysFollowEditor)
    useSettings.getState().set({ keysFollowEditor: false });
  const prev = useKeys.getState().target;
  // leaving a sound target: dispose the Keys channel
  if (prev.kind === "sound" && target.kind !== "sound") disposeKeysChannel();
  useKeys.setState({ target, root: null });
  if (target.kind === "sound") {
    // add to recent (dedupe by id, newest first, at most 8)
    const t = target;
    const prev = useKeys.getState().recent.filter((r) => r.id !== t.id);
    useKeys.setState({ recent: [t, ...prev].slice(0, 8) });
    void ensureKeysChannel(target);
  }
}

/**
 * Create (or reuse) the Keys channel for a library sound. Updates the loading status.
 * Safe to call from browser context only; returns undefined in unit tests.
 */
async function ensureKeysChannel(target: Extract<KeysTarget, { kind: "sound" }>) {
  // Lazily import the library helpers to keep this module importable in Node tests.
  const { CATALOG } = await import("../library/instruments");
  const { trackForInstrument, trackForSample, sampleRoot } = await import("../library/soundTrack");

  let track: Track;
  if (target.source === "catalog") {
    const entry = CATALOG.find((c) => c.id === target.id);
    if (!entry) return;
    track = trackForInstrument(entry);
  } else {
    // any sample plays as it is on its base key (its pitch, else C4), D133
    const { loadSample } = await import("../library/library");
    const root = sampleRoot(await loadSample(target.id));
    if (useKeys.getState().target !== target) return;
    useKeys.setState({ root });
    track = trackForSample(target.id, target.name, root);
  }

  // Only proceed if the target is still ours
  if (useKeys.getState().target !== target) return;

  useKeys.setState({ status: "loading" });
  try {
    const { voice } = createKeysChannel(track, useSettings.getState().keysMix);
    // wait until the voice's samples are loaded (up to 30 s)
    const deadline = performance.now() + 30_000;
    while (voice.state() === "loading" && performance.now() < deadline)
      await new Promise((r) => setTimeout(r, 100));
    if (useKeys.getState().target !== target) return; // target changed while loading
    useKeys.setState({ status: voice.state() === "error" ? "error" : "ready" });
  } catch {
    if (useKeys.getState().target === target) useKeys.setState({ status: "error" });
  }
}

/** A synth editor that's open: it registers (and again when what it edits changes). */
export function registerKeysEditor(e: KeysEditor): () => void {
  editors.set(e.panelId, e);
  useKeys.setState((k) => ({ editors: k.editors + 1 }));
  return () => {
    if (editors.get(e.panelId) !== e) return;
    editors.delete(e.panelId);
    useKeys.setState((k) => ({ editors: k.editors + 1 }));
  };
}

/** A synth editor panel came into focus (the dock's active panel). */
export function focusKeysEditor(panelId: string) {
  if (useKeys.getState().focused !== panelId) useKeys.setState({ focused: panelId });
}

/** A panel was closed: if it was the editor in focus, none is. */
export function forgetKeysEditor(panelId: string) {
  if (useKeys.getState().focused === panelId) useKeys.setState({ focused: null });
}

/** The synth editor the keys play now, if they follow one. */
export function keysEditor(): KeysEditor | undefined {
  const k = useKeys.getState();
  if (!useSettings.getState().keysFollowEditor || !k.focused) return undefined;
  return editors.get(k.focused);
}

/** Whether notes from a keyboard go to the keys (and not to the pads by position). */
export function keysTakeNotes(): boolean {
  if (useKeys.getState().target.kind === "sound" || keysEditor()) return true;
  return keysTrack()?.mode === "notes";
}

/** The track the keys play, if they play a track (Notes or Hits of a voice). */
export function keysTrack(): Track | undefined {
  const s = useStore.getState();
  const ed = keysEditor();
  if (ed) return ed.trackId ? s.project.tracks.find((x) => x.id === ed.trackId) : undefined;
  const t = useKeys.getState().target;
  const id = t.kind === "selected" ? s.selectedTrackId : t.kind === "track" ? t.id : null;
  if (!id) return undefined;
  return s.project.tracks.find((x) => x.id === id);
}

/**
 * What the keys play, for the chip, its menu and the device display: the exact sound, and where
 * it comes from ("Synth editor · BASS", "Track BASS", "Library").
 */
export function keysDescription(): { name: string; from: string; editor: boolean } {
  const ed = keysEditor();
  if (ed) {
    const track = ed.trackId ? keysTrack() : undefined;
    return track
      ? { name: track.source || track.name, from: `Synth editor · ${track.name}`, editor: true }
      : { name: ed.name, from: "Synth editor · library", editor: true };
  }
  const t = useKeys.getState().target;
  if (t.kind === "sound") {
    const root = useKeys.getState().root;
    const at = t.source === "sample" && root !== null ? ` · as is on ${noteName(root)}` : "";
    return { name: t.name, from: `Library${at}`, editor: false };
  }
  const track = keysTrack();
  if (!track) return { name: "Nothing", from: "", editor: false };
  return { name: track.source || track.name, from: `Track ${track.name}`, editor: false };
}

/** What the keys play, in one line ("Acid Bass · Synth editor · BASS"). */
export function keysTargetName(): string {
  const d = keysDescription();
  return d.from ? `${d.name} · ${d.from}` : d.name;
}

// ---------- sustain and held notes ----------

/** Each held note: what releases it, and whether it's live or sustained. */
interface HeldNote {
  pitch: number;
  recordId: number | null;
  release: () => void;
}

const heldNotes: HeldNote[] = [];
let sustainDown = false;
const sustainedReleases: (() => void)[] = [];

/** The sustain pedal for the keys. */
export function keysSustain(down: boolean) {
  sustainDown = down;
  if (!down) {
    for (const fn of sustainedReleases.splice(0)) fn();
  }
}

// ---------- note on / off ----------

/** Start a held note on the keys' target; the returned function releases it. */
export function noteOn(pitch: number, velocity: number, _source: KeysSource): () => void {
  const target = useKeys.getState().target;
  const ed = keysEditor();
  // a library sound's editor plays its own voice (D91)
  if (ed && !ed.trackId) return ed.hold ? sustained(ed.hold(pitch, velocity)) : () => {};

  if (!ed && target.kind === "sound") {
    // Library sound: play through the Keys channel
    return noteOnKeys(pitch, velocity);
  }

  const track = keysTrack();
  if (!track) return () => {};
  if (player(track) === "drum") {
    // hits of a sample: a pad hit, recorded as one
    trigger(track, velocity, { stepDur: 0.12 });
    padInput(track, velocity);
    return () => {};
  }
  if (player(track) !== "voice") return () => {};

  // the live voice plays it; Notes record each note (its length on release), Hits a hit
  const notes = playedNotes(pitch);
  const releases = notes.map((p) => holdNote(track, p, velocity));
  const recordIds: (number | null)[] =
    track.mode === "notes" ? notes.map((p) => recordNoteOn(track, p, velocity)) : [];
  if (track.mode !== "notes") padInput(track, velocity);

  const doRelease = () => {
    for (let i = 0; i < releases.length; i++) {
      releases[i]();
      recordNoteOff(recordIds[i]);
    }
    // remove from held
    for (let i = heldNotes.length - 1; i >= 0; i--) {
      if (notes.includes(heldNotes[i].pitch)) heldNotes.splice(i, 1);
    }
  };

  heldNotes.push(
    ...notes.map((p, i) => ({ pitch: p, recordId: recordIds[i], release: releases[i] })),
  );

  return () => {
    if (sustainDown) {
      sustainedReleases.push(doRelease);
    } else {
      doRelease();
    }
  };
}

/** A release that waits for the sustain pedal. */
function sustained(release: () => void): () => void {
  return () => {
    if (sustainDown) sustainedReleases.push(release);
    else release();
  };
}

/** Play a note through the Keys channel (library sound target). */
function noteOnKeys(pitch: number, velocity: number): () => void {
  const kc = getKeysChannel();
  if (!kc) return () => {};
  const { voice } = kc;
  const t = audioNow();
  const release = voice.hold?.(pitch, velocity, t) ?? (() => {});

  return () => {
    if (sustainDown) {
      sustainedReleases.push(() => release(audioNow()));
    } else {
      release(audioNow());
    }
  };
}

/** Pitch bend (−1..1), mod wheel and aftertouch (0..1) for the keys' voice. */
export function keysControl(name: "modwheel" | "aftertouch" | "pitchbend", value: number) {
  const target = useKeys.getState().target;
  const ed = keysEditor();
  if (ed && !ed.trackId) return ed.control?.(name, value);
  if (!ed && target.kind === "sound") {
    getKeysChannel()?.voice.synth?.control(name, value);
    return;
  }
  const track = keysTrack();
  // the track's sound bends as a whole, as before the live voices: both of its voices
  if (track) editorSynth(track)?.control(name, value);
}

/** Make the library sound on the keys a Notes track; the keys then follow it. */
export function addKeysSoundAsTrack(): string | null {
  const target = useKeys.getState().target;
  if (target.kind !== "sound") return null;

  // We do the actual track creation lazily so this works in the browser
  void (async () => {
    const { CATALOG } = await import("../library/instruments");
    const { addInstrumentTrack, addSampleTracks } = await import("./trackActions");

    if (target.source === "catalog") {
      const entry = CATALOG.find((c) => c.id === target.id);
      if (!entry) return;
      const id = addInstrumentTrack(entry);
      setKeysTarget({ kind: "track", id });
    } else {
      const ids = addSampleTracks([target.id]);
      if (ids[0]) setKeysTarget({ kind: "track", id: ids[0] });
    }
  })();

  return null; // track id is available asynchronously
}
