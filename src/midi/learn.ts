/** MIDI learn: the next incoming controller is mapped to a target (implemented in Phase 8). */
import { toast } from "../components/Toast";

export function startMidiLearn(_target: string, label: string) {
  toast(`MIDI learn for ${label} arrives with MIDI support`);
}
