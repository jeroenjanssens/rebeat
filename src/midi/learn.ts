/** MIDI learn: the next controller you move is mapped to a target. */
import { startLearn } from "../audio-io/midi";

/** Learn a mapping for this project (a track's knob) or for every project (a role, D121). */
export function startMidiLearn(
  target: string,
  label: string,
  scope: "project" | "global" = "project",
  slot?: string,
) {
  startLearn(target, label, scope, slot);
}
