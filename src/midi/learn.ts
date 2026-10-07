/** MIDI learn: the next controller you move is mapped to a target. */
import { startLearn } from "../audio-io/midi";

export function startMidiLearn(target: string, label: string) {
  startLearn(target, label);
}
