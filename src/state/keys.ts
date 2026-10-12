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
import { noteName, type Key } from "../model/notes";
import { qualityOf, suggestNext, type Played, type Suggestion } from "../model/suggest";
import { keyModeChord, sameKey, stepKeyRoot, stepKeyScale } from "../model/keyMode";
import { BASS_OCTAVES, padChord, voiceChord, VOICING_RANGE } from "../model/padChords";
import {
  balanceFactors,
  sanitizePlayStyle,
  slopFor,
  smoothVoicing,
  strumOffsets,
  type PlayStyle,
} from "../model/perform";
import {
  onPerformPanic,
  playStyle,
  pokeRhythm,
  rhythmOn,
  schedule,
  setRhythmPlayer,
  stopRhythm,
  strumDown,
  type Pool,
} from "./perform";
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
  /** Semitones added to everything the keys play (D138); not saved, 0 in every new session. */
  transpose: number;
  /** The key the Key dial picked, which a press selects (Key dial "On press", D138). */
  pendingKey: Key | null;
  /** The voicing of the last chord (Smooth picks it, D152), or null. */
  voicingUsed: number | null;
  /** Whether Latch holds something now (D151). */
  latched: boolean;
  /** The next chords to play (D158), best first; the last key played (to mark the nearest). */
  suggestions: Suggestion[];
  lastKey: number | null;
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
  transpose: 0,
  pendingKey: null,
  voicingUsed: null,
  latched: false,
  suggestions: [],
  lastKey: null,
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

/** One sounding note: what stops it, and its recording (Notes tracks). A note waiting for its
 * time (a strum's, a slop's) is `pending`, and `cancel` takes it off the schedule. */
interface Voice {
  release: (at?: number) => void;
  recordId: number | null;
  pending?: boolean;
  cancel?: () => void;
  /** The note it plays, how loud, and when it started sounding (for the lights). */
  pitch?: number;
  velocity?: number;
  startedAt?: number;
}

/**
 * A note the keys play started (`on`) or stopped sounding, at an audio time (D156): the
 * Controller panel lights its key then, so a strum, a slop, an arpeggio or a pattern shows as it
 * sounds. `pitch` null: everything stopped (Stop).
 */
export type KeysLight = (pitch: number | null, on: boolean, at: number, velocity: number) => void;
const lights = new Set<KeysLight>();

export function onKeysLight(fn: KeysLight): () => void {
  lights.add(fn);
  return () => void lights.delete(fn);
}

function light(pitch: number | null, on: boolean, at: number, velocity = 0) {
  for (const fn of lights) fn(pitch, on, at, velocity);
}

/**
 * When a note starts (D149): `at` (audio time; default now), its hit's time and its own delay
 * after it (for recording, `RecordTiming`), and whether it's recorded (live recording only for
 * notes the styles play; a key's own notes record as before).
 */
interface NoteTiming {
  at?: number;
  hitAt?: number;
  spread?: number;
  record?: boolean;
}

function startNote(out: Output, pitch: number, velocity: number, t: NoteTiming = {}): Voice {
  const at = t.at ?? audioNow();
  light(pitch, true, at, velocity);
  return { ...voiceFor(out, pitch, velocity, t), pitch, velocity, startedAt: at };
}

function voiceFor(out: Output, pitch: number, velocity: number, t: NoteTiming): Voice {
  switch (out.kind) {
    case "editor":
      return { release: out.hold(pitch, velocity), recordId: null };
    case "keys":
      return { release: keysChannelNote(pitch, velocity, t.at), recordId: null };
    case "sample":
      return { release: playKeysSample(out.track, pitch, velocity, "track", t.at), recordId: null };
    case "voice": {
      const release = holdNote(out.track, pitch, velocity, t.at);
      const notes = out.track.mode === "notes" && (t.record ?? true);
      const timing = { at: t.hitAt ?? t.at, spread: t.spread };
      return { release, recordId: notes ? recordNoteOn(out.track, pitch, velocity, timing) : null };
    }
  }
}

/** Start a note `delay` seconds from now (a strum's or a slop's), recorded at its time. */
function startNoteLater(out: Output, pitch: number, velocity: number, delay: number): Voice {
  const hitAt = audioNow();
  const v: Voice = { release: () => {}, recordId: null, pending: true };
  v.cancel = schedule(hitAt + delay, (at) => {
    const record = useStore.getState().playing;
    Object.assign(v, startNote(out, pitch, velocity, { at, hitAt, spread: delay, record }), {
      pending: false,
    });
  });
  return v;
}

function stopNote(v: Voice, at?: number) {
  if (v.pending) {
    v.cancel?.();
    v.pending = false;
    return;
  }
  v.release(at);
  recordNoteOff(v.recordId, at);
  if (v.pitch !== undefined)
    light(v.pitch, false, Math.max(at ?? audioNow(), v.startedAt ?? 0), v.velocity);
}

/** Play a note through the Keys channel (library sound target). */
function keysChannelNote(pitch: number, velocity: number, at = audioNow()): (end?: number) => void {
  const kc = getKeysChannel();
  if (!kc) return () => {};
  // a library sample plays like a pad, to its end, at the key's pitch (D134)
  if (useKeys.getState().target.kind === "sound" && kc.track.sound?.source === "sample")
    return playKeysSample(kc.track, pitch, velocity, "keys", at);
  const release = kc.voice.hold?.(pitch, velocity, at) ?? (() => {});
  return (end = audioNow()) => release(Math.max(end, at));
}

/** The bass's own track (D154), if one is set and plays notes. */
function bassOutput(): Output | null {
  const id = useSettings.getState().bassTrack;
  const track = id ? useStore.getState().project.tracks.find((t) => t.id === id) : undefined;
  return track && player(track) === "voice" ? { kind: "voice", track } : null;
}

/** What a key plays without chord pads: on a track, snapped to the key and/or its in-key chord
 * (scale lock, chord mode); a library sound plays the key itself. */
function keyNotes(out: Output, key: number): number[] {
  return out.kind === "sample" || out.kind === "voice" ? playedNotes(key) : [key];
}

// ---------- chord pads (D137) and Key mode (D138) ----------

let chordPads: number[] = [];

/**
 * The chord a key plays in the pads' mode, or null (it plays as a plain key): in Chord mode with
 * a chord type held (its root moved into the page's key by scale lock), in Key mode always.
 */
function padNotes(key: number): number[] | null {
  const s = useSettings.getState();
  if (s.padMode === "chord") return padChord(keyRoot(key), chordPads);
  if (s.padMode === "key") return keyModeChord(key, s.keyModeKey, chordPads);
  // Next mode (D159): the keys play Key mode's chords, the pads are the suggestions
  if (s.padMode === "next") return keyModeChord(key, s.keyModeKey, []);
  return null;
}

/** The lowest a bass note goes (C1): an octave lower is felt more than heard. */
const BASS_FLOOR = 24;

/** What a key plays: all its notes (low to high), whether they're a chord, which are the bass,
 * and the voicing used (Smooth picks it, D152). */
interface KeyChord {
  notes: number[];
  chord: boolean;
  bass: number[];
  voicing: number | null;
}

const inMidi = (n: number) => n >= 0 && n <= 127;

/**
 * What a key plays now: its chord or itself, transposed (D138); a chord in its voicing (D140; with
 * Smooth, the one closest to `prev`, the chord before, D152), with its bass (D139): the root,
 * octaves down, below the chord's lowest note, not below C1. In split mode (D154) a key below the
 * split is the bass alone, and chords get no bass of their own.
 */
function notesOf(
  out: Output,
  key: number,
  prev: number[] | null = null,
  forced: number[] | null = null,
): KeyChord {
  const s = useSettings.getState();
  const t = useKeys.getState().transpose;
  if (!forced && isSplitBass(key)) {
    const n = key + t;
    return { notes: inMidi(n) ? [n] : [], chord: false, bass: inMidi(n) ? [n] : [], voicing: null };
  }
  // a suggestion (D159) plays its own chord; a key its pads' chord, or itself
  const chord = forced ?? padNotes(key);
  let notes = (chord ?? keyNotes(out, key)).map((n) => n + t);
  const bass: number[] = [];
  let voicing: number | null = null;
  if (chord) {
    const root = notes[0]; // chords are built up from their root
    voicing = s.smoothVoicing ? smoothVoicing(prev, notes, s.chordVoicing) : s.chordVoicing;
    notes = voiceChord(notes, voicing);
    if (s.bassOctaves > 0 && s.bassMode !== "split") {
      const low = notes[0];
      let b = root - 12 * s.bassOctaves;
      while (b >= low) b -= 12;
      while (b < BASS_FLOOR) b += 12;
      if (b < low) {
        notes.unshift(b);
        bass.push(b);
      }
    }
  }
  return {
    notes: [...new Set(notes.filter(inMidi))],
    chord: !!chord,
    bass: bass.filter(inMidi),
    voicing,
  };
}

/** Split mode (D154): the keys below the split play the bass alone. */
function isSplitBass(key: number): boolean {
  const s = useSettings.getState();
  return s.bassMode === "split" && key < s.bassSplit;
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

/** Drum (pads 1–8 play tracks 1–8), Chord (the chord pads, D137) or Key (Key mode, D138). */
export function setPadMode(mode: "drum" | "chord" | "key" | "next") {
  useSettings.getState().set({ padMode: mode });
  if (mode === "drum") {
    chordPads = [];
    useKeys.setState({ pads: [] });
  }
  if (mode !== "key" && mode !== "next") useKeys.setState({ pendingKey: null });
  revoice();
  refreshSuggestions();
}

// ---------- Key mode's key, transpose and the Key dial (D138) ----------

/** Key mode's own key (saved in the settings, not the project's). */
export function setKeyModeKey(key: Key) {
  useSettings.getState().set({ keyModeKey: { root: key.root, scale: key.scale } });
  useKeys.setState({ pendingKey: null });
  revoice();
  refreshSuggestions();
}

/** Transpose what the keys play, −12..12 semitones (for this session). */
export function setTranspose(semitones: number) {
  const t = Math.max(-12, Math.min(12, Math.round(semitones)));
  if (t === useKeys.getState().transpose) return;
  useKeys.setState({ transpose: t });
  revoice();
  refreshSuggestions();
}

/** Bass voicing (D139): the chord's root this many octaves below it (0 = off). */
export function setBassOctaves(octaves: number) {
  const b = Math.max(0, Math.min(BASS_OCTAVES, Math.round(octaves)));
  useSettings.getState().set({ bassOctaves: b });
  revoice();
}

/** Chord voicing (D140): inversions of every chord the pads make, −8..8. */
export function setChordVoicing(steps: number) {
  const v = Math.max(-VOICING_RANGE, Math.min(VOICING_RANGE, Math.round(steps)));
  if (v === useSettings.getState().chordVoicing) return;
  useSettings.getState().set({ chordVoicing: v });
  revoice();
}

/** At once: a turn of the Key dial changes the key; On press: it picks one a press selects. */
export function setKeyDial(mode: "instant" | "press") {
  useSettings.getState().set({ keyDial: mode });
  useKeys.setState({ pendingKey: null });
}

/** Select the key the Key dial picked (On press). */
export function selectPendingKey() {
  const k = useKeys.getState().pendingKey;
  if (k) setKeyModeKey(k);
}

let dialDown = false;
/** Whether the Key dial turned, or a key was played, while it was pressed (so it isn't a click). */
let dialUsed = false;

/** The Key dial turned a step: the root, or the scale with Shift; while pressed, the transpose. */
export function keyDialTurn(step: number, scale: boolean) {
  if (dialDown) {
    dialUsed = true;
    return setTranspose(useKeys.getState().transpose + step);
  }
  const s = useSettings.getState();
  const from =
    s.keyDial === "press" ? (useKeys.getState().pendingKey ?? s.keyModeKey) : s.keyModeKey;
  const next = scale ? stepKeyScale(from, step) : stepKeyRoot(from, step);
  if (s.keyDial === "instant") return setKeyModeKey(next);
  useKeys.setState({ pendingKey: sameKey(next, s.keyModeKey) ? null : next });
}

/** The Key dial went down or up. A click (no turn and no key while down) selects the key it
 * picked, or else brings the transpose back to 0. */
export function keyDialPress(isDown: boolean) {
  if (isDown) {
    dialDown = true;
    dialUsed = false;
    return;
  }
  if (!dialDown) return;
  dialDown = false;
  if (dialUsed) return;
  if (useKeys.getState().pendingKey) selectPendingKey();
  else setTranspose(0);
}

/** Quick key select: a key played while the Key dial is down becomes Key mode's root (with Min
 * held: minor, with Maj: major), as on the Orchid. */
function quickKeySelect(pitch: number): boolean {
  if (!dialDown || useSettings.getState().padMode !== "key") return false;
  dialUsed = true;
  const k = useSettings.getState().keyModeKey;
  const scale = chordPads.includes(1) ? "minor" : chordPads.includes(2) ? "major" : k.scale;
  setKeyModeKey({ root: ((pitch % 12) + 12) % 12, scale });
  return true;
}

// ---------- note on / off ----------

/** A key that's down (or latched). `ended`: a newer key took over the chord, so it plays
 * nothing now. */
interface Pressed {
  key: number;
  velocity: number;
  source: KeysSource;
  out: Output;
  voices: Map<number, Voice>;
  ended: boolean;
  /** The chord sounding before this key (for Smooth voicing, D152). */
  prev: number[] | null;
  /** A suggestion's chord (D159): what it plays instead of the key's own. */
  forced: number[] | null;
}

/** What a key that's down plays now. */
const chordOf = (p: Pressed) => notesOf(p.out, p.key, p.prev, p.forced);
/** Whether a key that's down is a split's bass key (D154). */
const splitBass = (p: Pressed) => !p.forced && isSplitBass(p.key);

/** The keys that are down, oldest first. */
const down: Pressed[] = [];
/** Keys let go while Latch was on: what they play goes on (D151). */
let latched: Pressed[] = [];
/** The last chord the keys played, and when (Smooth voicing starts afresh after a pause). */
let lastChord: { notes: number[]; at: number } | null = null;

const active = () => [...latched, ...down].filter((p) => !p.ended);

/** Start a held note on the keys' target; the returned function releases it. */
export function noteOn(pitch: number, velocity: number, source: KeysSource): () => void {
  if (quickKeySelect(pitch)) return () => {};
  return press(pitch, velocity, source, null);
}

/**
 * A key down, or a suggestion played (`forced`: its chord, D159): what it plays goes through the
 * chord stage (transpose, voicing, Smooth, bass), the play styles, the voices and recording.
 */
function press(
  pitch: number,
  velocity: number,
  source: KeysSource,
  forced: number[] | null,
): () => void {
  const out = output();
  if (!out) return () => {};
  const style = playStyle();
  // Latch: a key after all were up starts a new set (keys while others are down add to it)
  if (style.latch && down.length === 0) endLatched();
  // Split (D154): one bass note at a time, the last one wins
  if (!forced && isSplitBass(pitch)) for (const q of active()) if (splitBass(q)) end(q);
  const now = performance.now();
  const prev = lastChord && now - lastChord.at < 4000 ? lastChord.notes : null;
  const kc = notesOf(out, pitch, prev, forced);
  // one chord at a time: a new key takes the chord over from the others (as on the Orchid)
  if (kc.chord) for (const q of active()) if (!splitBass(q)) end(q);
  if (kc.chord) {
    lastChord = { notes: kc.notes.filter((n) => !kc.bass.includes(n)), at: now };
    useKeys.setState({ voicingUsed: kc.voicing });
    // what you played, for the next suggestions (D158): the chord as pressed, before transpose
    const raw = forced ?? padNotes(pitch);
    if (raw) remember(raw[0], raw);
  }
  if (!forced && !isSplitBass(pitch)) useKeys.setState({ lastKey: pitch });
  const p: Pressed = {
    key: pitch,
    velocity,
    source,
    out,
    voices: new Map(),
    ended: false,
    prev,
    forced,
  };
  if (rhythmOn(style)) {
    // the rhythm plays it; while stopped, step entry writes the chord as it is (D149)
    stepEntry(out, kc.notes, velocity);
  } else startVoices(p, kc, style, kc.notes);
  if ((out.kind === "sample" || out.kind === "voice") && out.track.mode !== "notes")
    padInput(out.track, velocity);
  down.push(p);
  publish();
  pokeRhythm();
  let up = false;
  return () => {
    if (up) return;
    up = true;
    down.splice(down.indexOf(p), 1);
    if (!p.ended) {
      if (playStyle().latch) latched.push(p);
      else end(p);
    }
    publish();
    pokeRhythm();
  };
}

/**
 * Start some of a key's notes (`which`, of `kc.notes`) as held notes, through the styles that
 * don't need a grid (D150): Strum spreads them, Slop moves them later and varies them, Balance
 * shapes their velocities. Bass notes play on the bass's track when it has one (D154).
 */
function startVoices(p: Pressed, kc: KeyChord, style: PlayStyle, which: number[]) {
  const notes = [...which].sort((a, b) => a - b);
  const offs = style.strum.on ? strumOffsets(notes.length, style.strum.time, strumDown(style)) : [];
  const all = [...kc.notes].sort((a, b) => a - b);
  const bal = balanceFactors(all.length, style.balance);
  const bassOut = bassOutput();
  notes.forEach((n, i) => {
    const slop = style.slop.on
      ? slopFor(style.slop.amount, Math.random(), Math.random())
      : { delay: 0, vel: 1 };
    const delay = (offs[i] ?? 0) + slop.delay;
    const vel = Math.max(0.05, Math.min(1, p.velocity * bal[all.indexOf(n)] * slop.vel));
    const out = kc.bass.includes(n) && bassOut ? bassOut : p.out;
    p.voices.set(n, delay > 0.0005 ? startNoteLater(out, n, vel, delay) : startNote(out, n, vel));
  });
}

/** While stopped, a key writes its notes as they are on the cursor's step (step entry); the
 * styles are a performance, recorded when playing (D149). */
function stepEntry(out: Output, notes: number[], velocity: number) {
  if (useStore.getState().playing) return;
  if (out.kind === "voice" && out.track.mode === "notes")
    for (const n of notes) recordNoteOn(out.track, n, velocity);
}

/** Let go of every key that's down (a stuck key: its key-up never came). */
export function releaseAllKeys() {
  for (const p of down.splice(0)) end(p);
  endLatched();
  publish();
  pokeRhythm();
}

/** Let go of what's latched. */
function endLatched() {
  for (const p of latched.splice(0)) end(p);
}

/** Stop what a key plays (when the pedal comes up, if it's down). */
function end(p: Pressed) {
  if (p.ended) return;
  p.ended = true;
  latched = latched.filter((q) => q !== p);
  const voices = [...p.voices.values()];
  p.voices.clear();
  whenReleased(() => voices.forEach((v) => stopNote(v)));
}

/**
 * The pads, the pad mode, Key mode's key or the transpose changed: the keys that are down play
 * what they'd play now, at once (notes that stay keep sounding; new ones are strummed). When the
 * newest one makes a chord, it takes over from the others; without one, keys play as plain keys
 * again. With a rhythm on, the rhythm plays what they hold now.
 */
function revoice() {
  const newest = active().at(-1);
  if (newest && !splitBass(newest) && (newest.forced ?? padNotes(newest.key)))
    for (const q of active()) if (q !== newest && !splitBass(q)) end(q);
  const style = playStyle();
  for (const p of active()) {
    const kc = chordOf(p);
    if (rhythmOn(style)) continue;
    for (const [n, v] of p.voices)
      if (!kc.notes.includes(n)) {
        stopNote(v);
        p.voices.delete(n);
      }
    startVoices(
      p,
      kc,
      style,
      kc.notes.filter((n) => !p.voices.has(n)),
    );
  }
  publish();
  pokeRhythm();
}

function publish() {
  const rhythm = rhythmOn();
  useKeys.setState({
    sounding: [...down, ...latched].map((p) => ({
      key: p.key,
      // with a rhythm on, what the key holds (the rhythm plays it)
      notes: p.ended ? [] : rhythm ? chordOf(p).notes : [...p.voices.keys()].sort((a, b) => a - b),
      source: p.source,
    })),
    latched: latched.some((p) => !p.ended),
  });
}

// ---------- suggestions (D158, D159) ----------

/** The chords played lately (the last four, forgotten after 30 s of nothing). */
let history: { played: Played; at: number }[] = [];

/** The key suggestions are in: Key mode's own in Key and Next mode, the page's in Chord mode
 * (moved by the transpose, so the keys to press are right). */
function suggestKey(): Key {
  const s = useSettings.getState();
  if (s.padMode === "key" || s.padMode === "next") return s.keyModeKey;
  const st = useStore.getState();
  const slot = st.project.slots?.find((x) => x.id === st.editSlotId) ?? st.project.slots?.[0];
  const key = (slot && st.project.patterns?.[slot.patternId]?.keyOverride) || st.project.key;
  const t = useKeys.getState().transpose;
  return key
    ? { root: (((key.root - t) % 12) + 12) % 12, scale: key.scale }
    : { root: 0, scale: "major" };
}

/** Work out the suggestions again (a chord was played; the key, the mode or a setting changed). */
export function refreshSuggestions() {
  const s = useSettings.getState();
  const now = performance.now();
  history = history.filter((h) => now - h.at < 30_000).slice(-4);
  const show = s.padMode === "next" || (s.suggest && s.padMode !== "drum");
  const level = Math.max(0, Math.min(2, s.suggestAdventure)) as 0 | 1 | 2;
  useKeys.setState({
    suggestions: show
      ? suggestNext(
          history.map((h) => h.played),
          suggestKey(),
          level,
          8,
        )
      : [],
  });
}

/** Forget the chords played (start over: the next suggestions are the key's home chords). */
export function forgetChords() {
  history = [];
  refreshSuggestions();
}

function remember(root: number, notes: number[]) {
  const quality = qualityOf(root, notes);
  if (!quality) return;
  history.push({ played: { root: ((root % 12) + 12) % 12, quality }, at: performance.now() });
  refreshSuggestions();
}

/**
 * Play suggestion `i` (a Next pad, D159): its chord, rooted in the octave nearest the last key
 * played, through the same pipeline as a key. Returns its release.
 */
export function playSuggestion(i: number, velocity: number, source: KeysSource): () => void {
  const sug = useKeys.getState().suggestions[i];
  if (!sug) return () => {};
  const near = useKeys.getState().lastKey ?? 60;
  const root = near - 6 + ((((sug.root - (near - 6)) % 12) + 12) % 12);
  const chord = padChord(root, sug.pads);
  if (!chord) return () => {};
  return press(root, velocity, source, chord);
}

export function setSuggest(on: boolean) {
  useSettings.getState().set({ suggest: on });
  refreshSuggestions();
}

export function setSuggestAdventure(level: 0 | 1 | 2) {
  useSettings.getState().set({ suggestAdventure: level });
  refreshSuggestions();
}

// ---------- play styles (D149–D154) ----------

/** Change how the keys play; what's held plays the new way at once. */
export function setPlayStyle(patch: {
  [K in keyof PlayStyle]?: Partial<PlayStyle[K]> | PlayStyle[K];
}) {
  const cur = playStyle();
  const next = { ...cur } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch))
    next[k] =
      v !== null && typeof v === "object"
        ? { ...(cur[k as keyof PlayStyle] as object), ...(v as object) }
        : v;
  const wasRhythm = rhythmOn(cur);
  useSettings.getState().set({ playStyle: sanitizePlayStyle(next) });
  const style = playStyle();
  if (!style.latch && cur.latch) endLatched();
  if (rhythmOn(style) !== wasRhythm) {
    // from held notes to a rhythm, or back: what's held starts over the new way
    if (rhythmOn(style))
      for (const p of active()) {
        for (const v of p.voices.values()) stopNote(v);
        p.voices.clear();
      }
    else stopRhythm();
  }
  revoice();
}

/** Latch on or off (the command `keys.latch`, the panel's toggle). */
export function toggleLatch() {
  setPlayStyle({ latch: !playStyle().latch });
}

export function setSmoothVoicing(on: boolean) {
  useSettings.getState().set({ smoothVoicing: on });
  revoice();
}

export function setBassTrack(id: string | null) {
  useSettings.getState().set({ bassTrack: id });
  revoice();
}

export function setBassMode(mode: "auto" | "split", split?: number) {
  useSettings
    .getState()
    .set({ bassMode: mode, ...(split !== undefined ? { bassSplit: split } : {}) });
  revoice();
}

// The rhythm engine (state/perform.ts) asks the keys what they hold and plays it through them
setRhythmPlayer({
  pool(): Pool | null {
    const keys = active();
    if (!keys.length) return null;
    const chord: number[] = [];
    const bass: number[] = [];
    for (const p of keys) {
      const kc = chordOf(p);
      for (const n of kc.notes)
        if (kc.bass.includes(n)) {
          if (!bass.includes(n)) bass.push(n);
        } else if (!chord.includes(n)) chord.push(n);
    }
    return { chord, bass, velocity: keys.at(-1)!.velocity };
  },
  play(n) {
    const newest = active().at(-1);
    const out = (n.bass && bassOutput()) || newest?.out;
    if (!out) return () => {};
    let v: Voice | null = null;
    const record = useStore.getState().playing;
    const off = () => {
      if (v) stopNote(v, Math.max(audioNow(), n.start));
      v = null;
    };
    const cancelStart = schedule(n.start, (at) => {
      v = startNote(out, n.pitch, n.velocity, { at, hitAt: n.hitAt, spread: n.spread, record });
    });
    const cancelEnd = schedule(n.end, (at) => {
      if (v) stopNote(v, at);
      v = null;
    });
    return () => {
      cancelStart();
      cancelEnd();
      off();
    };
  },
  hold(pitch, velocity, at) {
    const out = bassOutput() || active().at(-1)?.out;
    if (!out) return () => {};
    let v: Voice | null = null;
    const record = useStore.getState().playing;
    const cancel = schedule(at, (t) => {
      v = startNote(out, pitch, velocity, { at: t, record });
    });
    return () => {
      cancel();
      if (v) stopNote(v);
      v = null;
    };
  },
});

// Stop (a panic, D99) lets go of what's latched too, and every key goes dark
onPerformPanic(() => {
  endLatched();
  publish();
  light(null, false, audioNow());
});

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
