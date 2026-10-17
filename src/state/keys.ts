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
  setKeysChannelMix,
  disposeKeysChannel,
  getKeysChannel,
  holdNote,
  editorSynth,
  liveVoiceSynth,
  playKeysSample,
} from "../engine/engine";
import { noteName, type Key } from "../model/notes";
import { nextBarTime, playStartTime, tempoNow } from "../engine/transport";
import {
  progressionById,
  progressionChords,
  progressionIndex,
  progressionsFor,
  qualityOf,
  suggestNext,
  type Played,
  type Suggestion,
} from "../model/suggest";
import { keyModeChord, sameKey, stepKeyRoot, stepKeyScale } from "../model/keyMode";
import { BASS_OCTAVES, padChord, voiceChord, VOICING_RANGE } from "../model/padChords";
import {
  balanceFactors,
  bendFor,
  patternBeats,
  patternById,
  sanitizePlayStyle,
  slopFor,
  smoothVoicing,
  strumOffsets,
  type NoteRole,
  type PlayStyle,
} from "../model/perform";
import {
  onPerformPanic,
  playStyle,
  pokeRhythm,
  rhythmOn,
  schedule,
  setAhead,
  setRhythmPlayer,
  stopRhythm,
  strumDown,
  type Pool,
} from "./perform";
import type { NoteBend, Track } from "../model/types";
import { bendable, player } from "../model/tracks";
import { recordNoteOff, recordNoteOn, playedNotes, padInput, keyRoot } from "./input";
import { useSettings } from "./settings";
import { useStore } from "./store";

export type KeysTarget =
  | { kind: "selected" }
  | { kind: "track"; id: string }
  /** A library sound: a catalog entry ("catalog", its id) or a sample ("sample", its id). */
  | { kind: "sound"; source: "catalog" | "sample"; id: string; name: string };

/** Where a held note came from (for the monitor and the Keys panel). */
/** Where a key came from. The tracker's previews (D276) only play: they write nothing (the
 * tracker writes its own notes). */
export type KeysSource = "midi" | "screen" | "computer" | "piano-roll" | "auto" | "tracker";

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
  /** The keys that are down and the notes each one plays (for the Keys panel). */
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
  /** Auto (D162): running or armed, its next change (audio time) and the time between changes. */
  auto: {
    running: boolean;
    armed: boolean;
    nextAt: number | null;
    dur: number;
    /** The pad queued for the next change (D171), or null. */
    queued: number | null;
  };
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
  auto: { running: false, armed: false, nextAt: null, dur: 2, queued: null },
}));

/** The Keys strip follows its settings (D212): the mixer, MIDI and effect edits all set them. */
useSettings.subscribe((s, prev) => {
  if (s.keysMix !== prev.keysMix) setKeysChannelMix(s.keysMix);
});

/** Change the Keys strip: level, sends, pan, mute, effects. */
export function setKeysMix(patch: Partial<ReturnType<typeof useSettings.getState>["keysMix"]>) {
  const settings = useSettings.getState();
  settings.set({ keysMix: { ...settings.keysMix, ...patch } });
}

export function setKeysTarget(target: KeysTarget) {
  // picking a target is picking it instead of the synth editor
  if (useSettings.getState().keysFollowEditor)
    useSettings.getState().set({ keysFollowEditor: false });
  const prev = useKeys.getState().target;
  // leaving a sound target: dispose the Keys channel
  if (prev.kind === "sound" && target.kind !== "sound") disposeKeysChannel();
  useKeys.setState({ target, root: null });
  useSettings.getState().set({ keysTarget: target });
  if (target.kind === "sound") {
    // add to recent (dedupe by id, newest first, at most 8)
    const t = target;
    const prev = useKeys.getState().recent.filter((r) => r.id !== t.id);
    useKeys.setState({ recent: [t, ...prev].slice(0, 8) });
    void ensureKeysChannel(target);
  }
}

/**
 * What the keys played last time (D166; the Grand Piano at first): put back when the audio
 * starts, a library sound's channel made at once, so it's loading before the first key.
 */
export function restoreKeysTarget() {
  const target = useSettings.getState().keysTarget ?? { kind: "selected" };
  useKeys.setState({ target, root: null });
  if (target.kind === "sound") {
    useKeys.setState({
      recent: [target, ...useKeys.getState().recent.filter((r) => r.id !== target.id)].slice(0, 8),
    });
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

/** Whether what the keys play can bend per note (a synth or a sample, D225, D285): the Bend card
 * says so. */
export function keysPlaySynth(): boolean {
  if (keysEditor()) {
    const track = keysTrack();
    return !!track && bendable(track);
  }
  if (useKeys.getState().target.kind === "sound") {
    const track = getKeysChannel()?.track;
    return !!track && bendable(track);
  }
  const track = keysTrack();
  return !!track && bendable(track);
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
 * Keys panel lights its key then, so a strum, a slop, an arpeggio or a pattern shows as it
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
  /** On its musical grid (the rhythm's notes): recorded where it is, not snapped (D175). */
  onGrid?: boolean;
  /** Where it is in what's played, for the Bend card's Notes (D222); alone: everything. */
  role?: NoteRole;
}

const ALONE: NoteRole = { top: true, bass: true, last: true };

/** The key a Next bend counts in (D222): the edited section's pattern's, or the song's. */
function bendKey(): Key | null {
  const st = useStore.getState();
  const slot = st.project.slots?.find((x) => x.id === st.editSlotId) ?? st.project.slots?.[0];
  return (slot && st.project.patterns?.[slot.patternId]?.keyOverride) || st.project.key || null;
}

/** A note's bend from the Bend card (D222), for a sound that can bend (D225, D285). */
function bendOf(track: Track | undefined, pitch: number, velocity: number, t: NoteTiming) {
  if (!track || !bendable(track)) return undefined;
  return bendFor(playStyle(), t.role ?? ALONE, velocity, pitch, bendKey(), Math.random());
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
    case "keys": {
      const bend = bendOf(getKeysChannel()?.track, pitch, velocity, t);
      return { release: keysChannelNote(pitch, velocity, t.at, bend), recordId: null };
    }
    case "sample":
      return { release: playKeysSample(out.track, pitch, velocity, "track", t.at), recordId: null };
    case "voice": {
      const bend = bendOf(out.track, pitch, velocity, t);
      const release = bend
        ? holdNote(out.track, pitch, velocity, t.at, bend)
        : holdNote(out.track, pitch, velocity, t.at);
      const notes = out.track.mode === "notes" && (t.record ?? true);
      const timing = { at: t.hitAt ?? t.at, spread: t.spread, onGrid: t.onGrid, bend };
      return { release, recordId: notes ? recordNoteOn(out.track, pitch, velocity, timing) : null };
    }
  }
}

/** Start a note `delay` seconds from now (a strum's or a slop's), recorded at its time. */
function startNoteLater(
  out: Output,
  pitch: number,
  velocity: number,
  delay: number,
  hitAt = audioNow(),
  role?: NoteRole,
  writes = true,
): Voice {
  const v: Voice = { release: () => {}, recordId: null, pending: true };
  v.cancel = schedule(hitAt + delay, (at) => {
    const record = writes && useStore.getState().playing;
    Object.assign(v, startNote(out, pitch, velocity, { at, hitAt, spread: delay, record, role }), {
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
function keysChannelNote(
  pitch: number,
  velocity: number,
  at = audioNow(),
  bend?: NoteBend,
): (end?: number) => void {
  const kc = getKeysChannel();
  if (!kc) return () => {};
  // a library sample plays like a pad, to its end, at the key's pitch (D134)
  if (useKeys.getState().target.kind === "sound" && kc.track.sound?.source === "sample")
    return playKeysSample(kc.track, pitch, velocity, "keys", at);
  const release = kc.voice.hold?.(pitch, velocity, at, bend) ?? (() => {});
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
  melody = false,
): KeyChord {
  const s = useSettings.getState();
  const t = useKeys.getState().transpose;
  if (melody) {
    const n = key + t;
    return { notes: inMidi(n) ? [n] : [], chord: false, bass: [], voicing: null };
  }
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
  /** A melody note over Auto (D162): the key on its own, never a chord. */
  melody?: boolean;
  /** One of Auto's chords (no key is down for it). */
  auto?: boolean;
}

/** What a key that's down plays now. */
const chordOf = (p: Pressed) => notesOf(p.out, p.key, p.prev, p.forced, p.melody);
/** Whether a key that's down is a split's bass key (D154). */
const splitBass = (p: Pressed) => !p.forced && isSplitBass(p.key);

/** The keys that are down, oldest first. */
const down: Pressed[] = [];
/** Keys let go while Latch was on: what they play goes on (D151). */
let latched: Pressed[] = [];
/** The last chord the keys played, and when (Smooth voicing starts afresh after a pause). */
let lastChord: { notes: number[]; at: number } | null = null;

const active = () =>
  [...latched, ...down, ...(autoPress ? [autoPress] : [])].filter((p) => !p.ended);

/** Start a held note on the keys' target; the returned function releases it. */
export function noteOn(pitch: number, velocity: number, source: KeysSource): () => void {
  if (quickKeySelect(pitch)) return () => {};
  // while Auto plays the chords, the keys play a melody over them (D162)
  return press(pitch, velocity, source, null, { melody: auto.running });
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
  opts: { melody?: boolean; auto?: boolean; at?: number } = {},
): () => void {
  const out = output();
  if (!out) return () => {};
  const style = playStyle();
  const { melody = false, auto: isAuto = false, at } = opts;
  // Latch: a key after all were up starts a new set (keys while others are down add to it)
  if (style.latch && down.length === 0 && !melody && !isAuto) endLatched();
  // Split (D154): one bass note at a time, the last one wins
  if (!forced && !melody && isSplitBass(pitch)) for (const q of active()) if (splitBass(q)) end(q);
  const now = performance.now();
  const prev = lastChord && now - lastChord.at < 4000 ? lastChord.notes : null;
  const kc = notesOf(out, pitch, prev, forced, melody);
  // one chord at a time: a new key takes the chord over from the others (as on the Orchid);
  // Auto's next chord takes over at its change, a melody note over it never does
  if (kc.chord)
    for (const q of active()) if (!splitBass(q) && !q.melody) end(q, isAuto ? at : undefined);
  if (kc.chord) {
    lastChord = { notes: kc.notes.filter((n) => !kc.bass.includes(n)), at: now };
    useKeys.setState({ voicingUsed: kc.voicing });
    // what you played, for the next suggestions (D158): the chord as pressed, before transpose;
    // a passing chord over Auto doesn't move its progression on
    const raw = forced ?? padNotes(pitch);
    if (raw && !(auto.running && !isAuto)) remember(raw[0], raw);
  }
  if (!forced && !melody && !isSplitBass(pitch)) useKeys.setState({ lastKey: pitch });
  const p: Pressed = {
    key: pitch,
    velocity,
    source,
    out,
    voices: new Map(),
    ended: false,
    prev,
    forced,
    melody,
    auto: isAuto,
  };
  // a melody note is held as it is, whatever plays the chords
  if (melody) startVoices(p, kc, style, kc.notes);
  else if (rhythmOn(style)) {
    // the rhythm plays it; while stopped, step entry writes the chord as it is (D149)
    if (!isAuto && source !== "tracker") stepEntry(out, kc.notes, velocity);
  } else startVoices(p, kc, style, kc.notes, at);
  if (
    !isAuto &&
    source !== "tracker" &&
    (out.kind === "sample" || out.kind === "voice") &&
    out.track.mode !== "notes"
  )
    padInput(out.track, velocity);
  if (isAuto) {
    autoPress = p;
    publish();
    pokeRhythm();
    return () => end(p);
  }
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
function startVoices(p: Pressed, kc: KeyChord, style: PlayStyle, which: number[], at?: number) {
  // a start time ahead (Auto's change, D162): every note waits for it
  const ahead = at === undefined ? 0 : Math.max(0, at - audioNow());
  const hitAt = at ?? audioNow();
  const notes = [...which].sort((a, b) => a - b);
  const offs = style.strum.on ? strumOffsets(notes.length, style.strum.time, strumDown(style)) : [];
  const all = [...kc.notes].sort((a, b) => a - b);
  const bal = balanceFactors(all.length, style.balance);
  const bassOut = bassOutput();
  // the Bend card's Notes (D222): the top and the bass of the chord, and the note heard last
  const order = notes.map((n, i) => ({ n, at: offs[i] ?? 0 }));
  const lastNote = offs.length
    ? order.reduce((a, b) => (b.at >= a.at ? b : a)).n
    : notes[notes.length - 1];
  const roleOf = (n: number): NoteRole => ({
    top: n === all[all.length - 1],
    bass: kc.bass.includes(n) || n === all[0],
    last: n === lastNote,
  });
  notes.forEach((n, i) => {
    const slop = style.slop.on
      ? slopFor(style.slop.amount, Math.random(), Math.random())
      : { delay: 0, vel: 1 };
    const spread = (offs[i] ?? 0) + slop.delay;
    const delay = ahead + spread;
    const vel = Math.max(0.05, Math.min(1, p.velocity * bal[all.indexOf(n)] * slop.vel));
    const out = kc.bass.includes(n) && bassOut ? bassOut : p.out;
    // its time is the hit's (now, or Auto's change) plus its own spread (strum, slop)
    p.voices.set(
      n,
      delay > 0.0005
        ? startNoteLater(out, n, vel, spread, hitAt, roleOf(n), p.source !== "tracker")
        : startNote(out, n, vel, {
            role: roleOf(n),
            ...(p.source === "tracker" ? { record: false } : {}),
          }),
    );
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
function end(p: Pressed, at?: number) {
  if (p.ended) return;
  p.ended = true;
  latched = latched.filter((q) => q !== p);
  const voices = [...p.voices.values()];
  p.voices.clear();
  // Auto's chords end at their change (D162); a key's when it goes up (or the pedal does)
  if (at !== undefined) voices.forEach((v) => stopNote(v, at));
  else whenReleased(() => voices.forEach((v) => stopNote(v)));
}

/**
 * The pads, the pad mode, Key mode's key or the transpose changed: the keys that are down play
 * what they'd play now, at once (notes that stay keep sounding; new ones are strummed). When the
 * newest one makes a chord, it takes over from the others; without one, keys play as plain keys
 * again. With a rhythm on, the rhythm plays what they hold now.
 */
function revoice() {
  const newest = active()
    .filter((q) => !q.melody)
    .at(-1);
  if (newest && !splitBass(newest) && (newest.forced ?? padNotes(newest.key)))
    for (const q of active()) if (q !== newest && !splitBass(q) && !q.melody) end(q);
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
    sounding: [...down, ...latched, ...(autoPress ? [autoPress] : [])].map((p) => ({
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
  // Next mode (D161): a progression picked puts its next chord on pad 1; while Auto plays it,
  // the chord Auto plays next (its own count, D171)
  const prog = s.padMode === "next" ? progressionById(s.nextProgression) : null;
  const running = auto.running && prog && progressionsFor(suggestKey()).includes(prog);
  if (show && running) {
    const next = progressionChords(prog, suggestKey())[auto.index % prog.chords.length];
    const rest = suggestNext(
      history.map((h) => h.played),
      suggestKey(),
      level,
      9,
    ).filter((x) => x.roman !== next.roman);
    useKeys.setState({ suggestions: [next, ...rest].slice(0, 8) });
    return;
  }
  useKeys.setState({
    suggestions: show
      ? suggestNext(
          history.map((h) => h.played),
          suggestKey(),
          level,
          8,
          prog,
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
  const root = rootNear(sug.root);
  const chord = padChord(root, sug.pads);
  if (!chord) return () => {};
  if (auto.running) {
    // a pad during Auto comes in at the next change, in time (D171); again: no longer queued
    if (auto.queuedPad === i) {
      auto.queued = null;
      auto.queuedPad = null;
    } else {
      auto.queued = sug;
      auto.queuedPad = i;
    }
    publishAuto();
    return () => {};
  }
  return press(root, velocity, source, chord);
}

export function setSuggest(on: boolean) {
  useSettings.getState().set({ suggest: on });
  refreshSuggestions();
}

/** The chords played lately, for the progression strip (D161). */
export const chordHistory = (): Played[] => history.map((h) => h.played);

/** The key the suggestions are in now. */
export const suggestionKey = (): Key => suggestKey();

/** Pick a progression for pad 1 in Next mode (null: the best suggestion). */
export function setNextProgression(id: string | null) {
  useSettings.getState().set({ nextProgression: id });
  refreshSuggestions();
}

export function setSuggestAdventure(level: 0 | 1 | 2) {
  useSettings.getState().set({ suggestAdventure: level });
  refreshSuggestions();
}

// ---------- Auto: the progression plays itself (D162–D164) ----------

/** Auto's state: running, armed (it starts with Play), its next change, how many chords played,
 * passing chords held over it, and whether it started with the song (it waits again after). */
const auto = {
  running: false,
  armed: false,
  withSong: false,
  nextAt: 0,
  count: 0,
  /** Where it is in the progression (its own count: a queued chord takes a chord's place). */
  index: 0,
  /** A pad pressed during Auto: its chord comes in at the next change (D171), and which pad. */
  queued: null as Suggestion | null,
  queuedPad: null as number | null,
};
/** The chord Auto is playing (no key is down for it). */
let autoPress: Pressed | null = null;
/** How hard Auto plays its chords. */
const AUTO_VELOCITY = 0.8;
export const AUTO_EVERY = [1, 2, 3, 4, 6, 8] as const;
/** Faster than a bar (D218): changes every so many beats. */
export const AUTO_BEATS = [0.5, 1, 2] as const;

/** A unit Auto counts in, in beats (quarter notes): the pattern's length when one plays (any
 * division, D175), else a bar. */
export function autoUnit(): { beats: number; pattern: boolean } {
  const st = playStyle();
  if (st.pattern.on) return { beats: patternBeats(patternById(st.pattern.id)), pattern: true };
  const [beats, unit] = useStore.getState().project.timeSignature ?? [4, 4];
  return { beats: (beats * 4) / unit, pattern: false };
}

/** Beats between Auto's changes: every so many beats (D218), or units. */
export function autoBeatsPerChange(): number {
  const { autoBeats, autoEvery } = useSettings.getState();
  if (autoBeats) return autoBeats;
  return Math.max(1, autoEvery) * autoUnit().beats;
}

/** Seconds between Auto's chord changes. */
function changeDur(): number {
  return (autoBeatsPerChange() * 60) / tempoNow();
}

/** How often Auto can change (D218): ½, 1 or 2 beats (when shorter than its unit), then every
 * 1–8 units; one list for the stepper. */
export function autoSteps(): { beats: number | null; every: number; label: string }[] {
  const unit = autoUnit();
  const [beats, value] = useStore.getState().project.timeSignature ?? [4, 4];
  const barBeats = (beats * 4) / value;
  const name = (n: number) =>
    unit.pattern ? (n === 1 ? "pattern" : "patterns") : n === 1 ? "bar" : "bars";
  const short = AUTO_BEATS.filter((b) => b < unit.beats - 1e-9).map((b) => ({
    beats: b,
    every: 1,
    label:
      !unit.pattern && Math.abs(b * 2 - barBeats) < 1e-9
        ? "½ bar"
        : b === 0.5
          ? "½ beat"
          : `${b} beat${b === 1 ? "" : "s"}`,
  }));
  return [
    ...short,
    ...AUTO_EVERY.map((n) => ({ beats: null, every: n, label: `${n} ${name(n)}` })),
  ];
}

/** Where Auto's setting is in `autoSteps()`. */
export function autoStepIndex(): number {
  const { autoBeats, autoEvery } = useSettings.getState();
  const steps = autoSteps();
  const i = steps.findIndex((s) =>
    autoBeats ? s.beats === autoBeats : s.beats === null && s.every === autoEvery,
  );
  // a beat setting longer than this unit allows: the unit itself
  return i >= 0 ? i : steps.findIndex((s) => s.beats === null && s.every === 1);
}

/** Step how often Auto changes: −1 more often, +1 less often. */
export function stepAutoEvery(dir: -1 | 1) {
  const steps = autoSteps();
  const next = steps[Math.max(0, Math.min(steps.length - 1, autoStepIndex() + dir))];
  useSettings.getState().set({ autoBeats: next.beats, autoEvery: next.every });
}

/** A root note for a suggestion: its pitch class in the octave nearest the last key. */
function rootNear(pc: number): number {
  const near = useKeys.getState().lastKey ?? 60;
  return near - 6 + ((((pc - (near - 6)) % 12) + 12) % 12);
}

/** The progression Auto plays, if one is picked and fits the key. */
function autoProgression() {
  const prog = progressionById(useSettings.getState().nextProgression);
  return prog && progressionsFor(suggestKey()).includes(prog) ? prog : null;
}

/** The chord Auto plays at its next change: a queued one, else the progression's next (its own
 * count), else the best suggestion (Free). */
function autoNext(): Suggestion | undefined {
  if (auto.queued) return auto.queued;
  const prog = autoProgression();
  if (prog) return progressionChords(prog, suggestKey())[auto.index % prog.chords.length];
  return useKeys.getState().suggestions[0];
}

/** Auto's next chord, at `at`. */
function autoChord(at: number) {
  const s = useSettings.getState();
  const prog = autoProgression();
  // Loop off: after the progression's last chord, stop at what would be the next change
  if (!s.autoLoop && prog && auto.count >= prog.chords.length) return stopAuto(at);
  auto.count++;
  const sug = autoNext();
  // a queued chord takes the progression's next chord's place; the progression goes on after it
  if (prog) auto.index++;
  auto.queued = null;
  auto.queuedPad = null;
  if (!sug) return;
  const root = rootNear(sug.root);
  const chord = padChord(root, sug.pads);
  if (chord) press(root, AUTO_VELOCITY, "auto", chord, { auto: true, at });
  refreshSuggestions();
}

/** Whether Auto is placing a chord now: what that starts (the rhythm's first flush) mustn't
 * come back in and place the next one at the same time. */
let placing = false;

function aheadOfRhythm(_now: number, horizon: number): boolean {
  if (!auto.running) return false;
  if (placing) return true;
  placing = true;
  try {
    while (auto.running && auto.nextAt <= horizon) {
      // the next change moves on first: a chord that starts the rhythm flushes it at once
      const at = auto.nextAt;
      auto.nextAt += changeDur();
      autoChord(at);
    }
  } finally {
    placing = false;
  }
  publishAuto();
  return auto.running;
}

/** Auto's state for the panel, only when it changes (the scheduler calls this every tick). */
function publishAuto() {
  const next = {
    running: auto.running,
    armed: auto.armed,
    nextAt: auto.running ? auto.nextAt : null,
    dur: changeDur(),
    queued: auto.queuedPad,
  };
  const cur = useKeys.getState().auto;
  if (
    cur.running !== next.running ||
    cur.armed !== next.armed ||
    cur.queued !== next.queued ||
    cur.nextAt !== next.nextAt ||
    Math.abs(cur.dur - next.dur) > 1e-9
  )
    useKeys.setState({ auto: next });
}

/** Start Auto at `at`; from the progression's first chord (a take with the song) or pad 1's. */
function beginAuto(at: number, fromTop: boolean) {
  if (fromTop) forgetChords();
  const prog = autoProgression();
  auto.index = prog && !fromTop ? progressionIndex(prog, chordHistory(), suggestKey()) : 0;
  auto.running = true;
  auto.nextAt = at;
  auto.count = 0;
  auto.queued = null;
  auto.queuedPad = null;
  setAhead(aheadOfRhythm);
  publishAuto();
}

/**
 * ▶ Auto (D162, D163): while the song is stopped and "starts with Play" is on, Auto waits (armed)
 * and starts with the song, after the count-in, from the top; while the song plays, on its next
 * bar; else at once.
 */
export function startAuto() {
  if (auto.running) return;
  const playing = !!useStore.getState().playing;
  // Sync to song (D172): tied to the song: armed while it's stopped, from its next bar while it
  // plays, stopping with it; off: on its own, at once (on the song's next bar if it plays)
  const sync = useSettings.getState().autoSync;
  if (sync && !playing) {
    auto.armed = true;
    return publishAuto();
  }
  auto.withSong = sync;
  beginAuto(playing ? nextBar() : audioNow() + 0.02, false);
}

/** ■ Stop: Auto stops (its chord too, at `at` or now) and isn't armed any more. */
export function stopAuto(at?: number) {
  auto.armed = false;
  haltAuto(at);
}

function haltAuto(at?: number) {
  auto.running = false;
  if (autoPress) end(autoPress, at);
  autoPress = null;
  publish();
  pokeRhythm();
  publishAuto();
}

export function toggleAuto() {
  if (auto.running || auto.armed) stopAuto();
  else startAuto();
}

/** The audio time of the song's next bar (it plays). */
function nextBar(): number {
  const { project } = useStore.getState();
  const [beats, unit] = project.timeSignature ?? [4, 4];
  // every section starts a bar (D185): the transport knows where the next one is
  const next = nextBarTime();
  if (next !== null) return next;
  const bar = (beats * (4 / unit) * 60) / tempoNow();
  const start = playStartTime();
  return start + Math.max(0, Math.ceil((audioNow() + 0.01 - start) / bar)) * bar;
}

// the song starts: an armed Auto starts with it, on its first step after the count-in, from the
// top; the song stops: Auto stops, and an armed one waits for the next Play (take after take)
// (`?.` because keys.test.ts mocks the store without subscribe)
useStore.subscribe?.((s, prev) => {
  if (s.playing && !prev.playing && auto.armed && !auto.running)
    // the transport sets its first step's time right after it says it plays
    queueMicrotask(() => {
      auto.withSong = true;
      beginAuto(playStartTime(), true);
    });
  if (!s.playing && prev.playing && auto.running && auto.withSong) haltAuto();
});

// Opening a project: release everything held, reset per-session state. Voices from the old
// project's audio graph would error if released after a load. (Not on a forked example: its id
// changes too, while you may be holding a chord.)
useStore.subscribe?.((s, prev) => {
  if (s.loads === prev.loads) return;
  releaseAllKeys();
  // reset the chord pads, dial and suggestion history so the new project starts clean
  chordPads = [];
  useKeys.setState({ pads: [] });
  dialDown = false;
  dialUsed = false;
  history = [];
  auto.armed = false;
});

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
      if (p.melody) continue; // a melody over Auto plays on its own
      const kc = chordOf(p);
      for (const n of kc.notes)
        if (kc.bass.includes(n)) {
          if (!bass.includes(n)) bass.push(n);
        } else if (!chord.includes(n)) chord.push(n);
    }
    // the chord's root and tones, as built (before voicing): a chord's first note is its root;
    // plain keys, the lowest held (D176)
    const newest = keys.filter((p) => !p.melody).at(-1);
    const raw = newest ? (newest.forced ?? padNotes(newest.key)) : null;
    const t = useKeys.getState().transpose;
    const root = raw ? raw[0] + t : Math.min(...chord, ...bass);
    const tones = raw ? raw.map((n) => n - raw[0]) : undefined;
    return { chord, bass, velocity: keys.at(-1)!.velocity, root, tones };
  },
  play(n) {
    const newest = active()
      .filter((p) => !p.melody)
      .at(-1);
    const out = (n.bass && bassOutput()) || newest?.out;
    if (!out) return () => {};
    let v: Voice | null = null;
    const record = useStore.getState().playing;
    const off = () => {
      if (v) stopNote(v, Math.max(audioNow(), n.start));
      v = null;
    };
    const cancelStart = schedule(n.start, (at) => {
      v = startNote(out, n.pitch, n.velocity, {
        at,
        hitAt: n.hitAt,
        spread: n.spread,
        record,
        onGrid: n.onGrid,
        // a rhythm's note: the bass's, or the chord's (each is the newest as it starts)
        role: { top: !n.bass, bass: !!n.bass, last: true },
      });
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
  next() {
    if (!auto.running) return null;
    const n = autoNext();
    return n ? { root: n.root, at: auto.nextAt } : null;
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

// Stop (a panic, D99) lets go of every held and latched key, and every key goes dark
onPerformPanic(() => {
  for (const p of down.splice(0)) end(p);
  endLatched();
  if (auto.running) haltAuto();
  publish();
  light(null, false, audioNow());
});

/** Pitch bend, the mod wheel or aftertouch went to the keys' sound (the synth editor's wheels
 * follow them). */
export type KeysControlListener = (
  name: "modwheel" | "aftertouch" | "pitchbend",
  value: number,
) => void;
const controlListeners = new Set<KeysControlListener>();
export function onKeysControl(fn: KeysControlListener): () => void {
  controlListeners.add(fn);
  return () => void controlListeners.delete(fn);
}

/**
 * Whether the keys play into this synth editor now: its track (followed, selected or locked), or
 * its library sound (an editor the keys follow). Its piano lights what they play then.
 */
export function keysPlayInto(editor: { trackId?: string; panelId?: string }): boolean {
  const ed = keysEditor();
  if (ed && !ed.trackId) return ed.panelId === editor.panelId;
  if (!ed && useKeys.getState().target.kind === "sound") return false;
  return !!editor.trackId && keysTrack()?.id === editor.trackId;
}

export function keysControl(name: "modwheel" | "aftertouch" | "pitchbend", value: number) {
  for (const fn of controlListeners) fn(name, value);
  const target = useKeys.getState().target;
  const ed = keysEditor();
  // the Bend card's Strip on Newest note (D225): the strip bends the newest held note alone
  if (name === "pitchbend" && playStyle().bend.strip === "newest" && !ed) {
    const track = target.kind === "sound" ? getKeysChannel()?.track : keysTrack();
    const synth =
      target.kind === "sound"
        ? getKeysChannel()?.voice.synth
        : track
          ? liveVoiceSynth(track)
          : undefined;
    if (synth) return synth.bendNewest(value);
  }
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
