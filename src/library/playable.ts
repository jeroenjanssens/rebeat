/**
 * Playable (D126, WS-E): every sound the keys can play, in one list (synths, sampled instruments,
 * Your sounds, pitched samples), so the library's Playable view and a controller's encoder
 * browse the same list, also while the Library panel is closed.
 *
 * Phase 0 contract: the types and signatures are fixed; WS-E fills in the behavior.
 */
import type { KeysTarget } from "../state/keys";

export interface PlayableItem {
  /** The library item's id (a catalog id or a sample id). */
  id: string;
  name: string;
  family: "synth" | "instrument" | "sample";
  /** The section heading ("Synths", "Sampled instruments", "Your sounds", "Samples"). */
  section: string;
  target: Extract<KeysTarget, { kind: "sound" }>;
}

/** The list, in order. `allSamples` adds the drum samples too (the chip). */
export function playableList(_opts: { allSamples?: boolean } = {}): PlayableItem[] {
  return [];
}

/** Move the Playable selection by `delta` items (or sections with `bySection`) and put it on
 * the keys; returns the new item. */
export function browsePlayable(_delta: number, _bySection = false): PlayableItem | undefined {
  return undefined;
}
