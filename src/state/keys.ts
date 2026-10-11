/**
 * The keys (D126): what MIDI keyboards, the on-screen keyboard, the computer keys and the piano
 * roll's key column play. Their target is the selected track (the default), one track you lock
 * them to, or a library sound that isn't on a track (it plays through the Keys strip). Every
 * held note goes through `noteOn`, which plays it on the target's own live voice (so it never
 * cuts what the sequencer plays on that track) and records it when recording. In the pads'
 * Chord mode (D137), the chord pads held make each key a chord, one at a time.
 */
import { create } from "zustand";
import {
  audioNow,
  createKeysChannel,
  disposeKeysChannel,
  getKeysChannel,
  holdNote,
  editorSynth,
  playKeysSample,
} from "../engine/engine";
import { noteName } from "../model/notes";
import { padChord } from "../model/padChords";
import type { Track } from "../model/types";
import { player } from "../model/tracks";
import { recordNoteOff, recordNoteOn, playedNotes, padInput, keyRoot } from "./input";
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
  /** The keys that are down and the notes each one plays (for the Controller panel). */
  sounding: KeyNotes[];
  /** The chord pads held (pad index 0..7, in the order pressed), D137. */
  pads: number[];
}

/** A key that's down and what it plays: itself, a chord, or nothing (another key took over). */
export interface KeyNotes {
  key: number;
  notes: number[];
  source: KeysSource;
}

export const useKeys = create<KeysState>()(() => ({
  target: { kind: "selected" },
  focused: null,
  editors: 0,
  root: null,
  status: "ready",
  recent: [],
  sounding: [],
  pads: [],
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
  // a Hits track plays too: a sample at the key's pitch, a synth's note (D134)
  const track = keysTrack();
  return !!track && track.mode !== "clip";
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

// ---------- sustain ----------

let sustainDown = false;
const sustainedReleases: (() => void)[] = [];

/** The sustain pedal for the keys. */
export function keysSustain(down: boolean) {
  sustainDown = down;
  if (!down) {
    for (const fn of sustainedReleases.splice(0)) fn();
  }
}

/** Stop now, or when the sustain pedal comes up. */
function whenReleased(stop: () => void) {
  if (sustainDown) sustainedReleases.push(stop);
  else stop();
}

// ---------- what plays a note ----------

/** Where the keys' notes go right now (resolved once per key press). */
type Output =
  /** a library sound's synth editor: its own voice (D91) */
  | { kind: "editor"; hold: (pitch: number, velocity: number) => () => void }
  /** a library sound: the Keys channel */
  | { kind: "keys" }
  /** hits of a sample: it plays at the key's pitch against its base key (D134) */
  | { kind: "sample"; track: Track }
  /** the track's live voice: Notes record each note (its length on release), Hits a hit */
  | { kind: "voice"; track: Track };

function output(): Output | null {
  const ed = keysEditor();
  if (ed && !ed.trackId) return ed.hold ? { kind: "editor", hold: ed.hold } : null;
  if (!ed && useKeys.getState().target.kind === "sound") return { kind: "keys" };
  const track = keysTrack();
  if (!track) return null;
  if (player(track) === "drum") return { kind: "sample", track };
  if (player(track) === "voice") return { kind: "voice", track };
  return null;
}

/** One sounding note: what stops it, and its recording (Notes tracks). */
interface Voice {
  release: () => void;
  recordId: number | null;
}

function startNote(out: Output, pitch: number, velocity: number): Voice {
  switch (out.kind) {
    case "editor":
      return { release: out.hold(pitch, velocity), recordId: null };
    case "keys":
      return { release: keysChannelNote(pitch, velocity), recordId: null };
    case "sample":
      return { release: playKeysSample(out.track, pitch, velocity), recordId: null };
    case "voice": {
      const release = holdNote(out.track, pitch, velocity);
      const notes = out.track.mode === "notes";
      return { release, recordId: notes ? recordNoteOn(out.track, pitch, velocity) : null };
    }
  }
}

function stopNote(v: Voice) {
  v.release();
  recordNoteOff(v.recordId);
}

/** Play a note through the Keys channel (library sound target). */
function keysChannelNote(pitch: number, velocity: number): () => void {
  const kc = getKeysChannel();
  if (!kc) return () => {};
  // a library sample plays like a pad, to its end, at the key's pitch (D134)
  if (useKeys.getState().target.kind === "sound" && kc.track.sound?.source === "sample")
    return playKeysSample(kc.track, pitch, velocity, "keys");
  const release = kc.voice.hold?.(pitch, velocity, audioNow()) ?? (() => {});
  return () => release(audioNow());
}

/** What a key plays without chord pads: on a track, snapped to the key and/or its in-key chord
 * (scale lock, chord mode); a library sound plays the key itself. */
function keyNotes(out: Output, key: number): number[] {
  return out.kind === "sample" || out.kind === "voice" ? playedNotes(key) : [key];
}

// ---------- chord pads (D137) ----------

let chordPads: number[] = [];

const chordMode = () => useSettings.getState().padMode === "chord";

/** The chord the pads held make on a key (its root snapped by scale lock), or null. */
function padChordOn(key: number): number[] | null {
  return chordMode() ? padChord(keyRoot(key), chordPads) : null;
}

/** A chord pad went down (pad index 0..7): the chord being held changes with it. */
export function chordPadDown(pad: number) {
  if (chordPads.includes(pad)) return;
  chordPads = [...chordPads, pad];
  useKeys.setState({ pads: chordPads });
  revoice();
}

export function chordPadUp(pad: number) {
  if (!chordPads.includes(pad)) return;
  chordPads = chordPads.filter((p) => p !== pad);
  useKeys.setState({ pads: chordPads });
  revoice();
}

/** Drum (pads 1–8 play tracks 1–8) or Chord (they're the chord pads), D137. */
export function setPadMode(mode: "drum" | "chord") {
  useSettings.getState().set({ padMode: mode });
  if (mode === "drum" && chordPads.length) {
    chordPads = [];
    useKeys.setState({ pads: [] });
    revoice();
  }
}

// ---------- note on / off ----------

/** A key that's down. `ended`: a newer key took over the chord, so it plays nothing now. */
interface Pressed {
  key: number;
  velocity: number;
  source: KeysSource;
  out: Output;
  voices: Map<number, Voice>;
  ended: boolean;
}

/** The keys that are down, oldest first. */
const down: Pressed[] = [];

/** Start a held note on the keys' target; the returned function releases it. */
export function noteOn(pitch: number, velocity: number, source: KeysSource): () => void {
  const out = output();
  if (!out) return () => {};
  const chord = padChordOn(pitch);
  // one chord at a time: a new key takes the chord over from the others (as on the Orchid)
  if (chord) for (const p of down) end(p);
  const p: Pressed = { key: pitch, velocity, source, out, voices: new Map(), ended: false };
  for (const n of chord ?? keyNotes(out, pitch)) p.voices.set(n, startNote(out, n, velocity));
  if ((out.kind === "sample" || out.kind === "voice") && out.track.mode !== "notes")
    padInput(out.track, velocity);
  down.push(p);
  publish();
  let up = false;
  return () => {
    if (up) return;
    up = true;
    down.splice(down.indexOf(p), 1);
    publish();
    if (!p.ended) end(p);
  };
}

/** Let go of every key that's down (a stuck key: its key-up never came). */
export function releaseAllKeys() {
  for (const p of down.splice(0)) end(p);
  publish();
}

/** Stop what a key plays (when the pedal comes up, if it's down). */
function end(p: Pressed) {
  if (p.ended) return;
  p.ended = true;
  const voices = [...p.voices.values()];
  p.voices.clear();
  whenReleased(() => voices.forEach(stopNote));
}

/** The chord pads changed: the newest key that still plays takes the new chord at once (notes
 * that stay keep sounding); without a chord type it plays as a plain key again. */
function revoice() {
  const p = down.findLast((q) => !q.ended);
  if (!p) return publish();
  const chord = padChordOn(p.key);
  if (chord) for (const q of down) if (q !== p) end(q);
  const want = chord ?? keyNotes(p.out, p.key);
  for (const [n, v] of p.voices)
    if (!want.includes(n)) {
      stopNote(v);
      p.voices.delete(n);
    }
  for (const n of want) if (!p.voices.has(n)) p.voices.set(n, startNote(p.out, n, p.velocity));
  publish();
}

function publish() {
  useKeys.setState({
    sounding: down.map((p) => ({
      key: p.key,
      notes: [...p.voices.keys()].sort((a, b) => a - b),
      source: p.source,
    })),
  });
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
