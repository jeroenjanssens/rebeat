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
import type { Track } from "../model/types";
import { player } from "../model/tracks";
import { recordNoteOff, recordNoteOn, playedNotes, padInput } from "./input";
import { useStore } from "./store";

export type KeysTarget =
  | { kind: "selected" }
  | { kind: "track"; id: string }
  /** A library sound: a catalog entry ("catalog", its id) or a sample ("sample", its id). */
  | { kind: "sound"; source: "catalog" | "sample"; id: string; name: string };

/** Where a held note came from (for the monitor and the Controller panel). */
export type KeysSource = "midi" | "screen" | "computer" | "piano-roll";

interface KeysState {
  target: KeysTarget;
  /** "loading" while a library sound's voice gets its samples. */
  status: "ready" | "loading" | "error";
  /** Recent library sounds put on the keys (newest first, at most 8). */
  recent: Extract<KeysTarget, { kind: "sound" }>[];
}

export const useKeys = create<KeysState>()(() => ({
  target: { kind: "selected" },
  status: "ready",
  recent: [],
}));

export function setKeysTarget(target: KeysTarget) {
  const prev = useKeys.getState().target;
  // leaving a sound target: dispose the Keys channel
  if (prev.kind === "sound" && target.kind !== "sound") disposeKeysChannel();
  useKeys.setState({ target });
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
  const { trackForInstrument, trackForSample } = await import("../library/soundTrack");

  let track: Track;
  if (target.source === "catalog") {
    const entry = CATALOG.find((c) => c.id === target.id);
    if (!entry) return;
    track = trackForInstrument(entry);
  } else {
    track = trackForSample(target.id, target.name);
  }

  // Only proceed if the target is still ours
  if (useKeys.getState().target !== target) return;

  useKeys.setState({ status: "loading" });
  try {
    const { useSettings } = await import("./settings");
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

/** The track the keys play, if they play a track (Notes or Hits of a voice). */
export function keysTrack(): Track | undefined {
  const s = useStore.getState();
  const t = useKeys.getState().target;
  const id = t.kind === "selected" ? s.selectedTrackId : t.kind === "track" ? t.id : null;
  if (!id) return undefined;
  return s.project.tracks.find((x) => x.id === id);
}

/** What the keys play, for the chip, the Controller panel and the MiniLab display. */
export function keysTargetName(): string {
  const t = useKeys.getState().target;
  if (t.kind === "sound") return t.name;
  return keysTrack()?.name ?? "Nothing";
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

  if (target.kind === "sound") {
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
  if (target.kind === "sound") {
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
