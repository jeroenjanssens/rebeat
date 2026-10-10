/**
 * A controller's display (the MiniLab 3's screen): what Rebeat shows on it. `showOnDisplay` keeps
 * the text (the Controller panel mirrors it) and hands it to the drivers of connected devices
 * (`audio-io/controllers/minilab3.ts` registers one). Pure, no browser APIs.
 */
import { create } from "zustand";

export interface DisplayText {
  line1: string;
  line2: string;
  /** Shown for a moment (a knob turning), then the last lasting text comes back. */
  transient?: boolean;
}

export const useDisplay = create<{ text: DisplayText }>()(() => ({
  text: { line1: "Rebeat", line2: "" },
}));

type Writer = (text: DisplayText) => void;
const writers = new Set<Writer>();

/** A device driver that writes text to the device. */
export function onDisplayText(fn: Writer): () => void {
  writers.add(fn);
  return () => void writers.delete(fn);
}

export function showOnDisplay(text: DisplayText) {
  useDisplay.setState({ text });
  for (const fn of writers) fn(text);
}
