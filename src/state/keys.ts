/**
 * The keys (D126): what MIDI keyboards, the on-screen keyboard, the computer keys and the piano
 * roll's key column play. Their target is the selected track (the default), one track you lock
 * them to, or a library sound that isn't on a track (it plays through the Keys strip). Every
 * held note goes through `noteOn`, which plays it on the target's own live voice (so it never
 * cuts what the sequencer plays on that track) and records it when recording.
 *
 * Phase 0 contract: the types and signatures are fixed; WS-A fills in the behavior.
 */
import { create } from "zustand";
import { holdNote } from "../engine/engine";
import type { Track } from "../model/types";
import { padInput } from "./input";
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
  useKeys.setState({ target });
}

/** The track the keys play, if they play a track (Notes or Hits of a voice). */
export function keysTrack(): Track | undefined {
  const s = useStore.getState();
  const t = useKeys.getState().target;
  const id = t.kind === "selected" ? s.selectedTrackId : t.kind === "track" ? t.id : null;
  return s.project.tracks.find((x) => x.id === id);
}

/** What the keys play, for the chip, the Controller panel and the MiniLab display. */
export function keysTargetName(): string {
  const t = useKeys.getState().target;
  if (t.kind === "sound") return t.name;
  return keysTrack()?.name ?? "Nothing";
}

/** Start a held note on the keys' target; the returned function releases it. */
export function noteOn(pitch: number, velocity: number, _source: KeysSource): () => void {
  const track = keysTrack();
  if (!track) return () => {};
  const release = holdNote(track, pitch, velocity);
  padInput(track, velocity, [pitch]);
  return release;
}

/** Pitch bend (−1..1), mod wheel and aftertouch (0..1) for the keys' voice. */
export function keysControl(_name: "modwheel" | "aftertouch" | "pitchbend", _value: number) {}

/** The sustain pedal for the keys. */
export function keysSustain(_down: boolean) {}

/** Make the library sound on the keys a Notes track; the keys then follow it. */
export function addKeysSoundAsTrack(): string | null {
  return null;
}
