/** Monitoring: armed audio tracks hear the microphone through their own effects (D47). */
import { micSource, onMicOpen, openMic } from "../audio-io/mic";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { getChannel } from "./engine";

const connected = new Map<string, AudioNode>();

function sync() {
  const { project } = useStore.getState();
  const monitor = useSettings.getState().monitorWhileArmed;
  const armed = monitor ? project.tracks.filter((t) => t.mode === "clip" && t.arm) : [];
  const want = new Set(armed.map((t) => t.id));
  const src = micSource();
  for (const [id, node] of connected)
    if (!want.has(id) || node !== src) {
      try {
        src?.disconnect(getChannel(id)!.input.input as unknown as AudioNode);
      } catch {
        // already gone
      }
      connected.delete(id);
    }
  if (!armed.length) return;
  if (!src) {
    // arming is the user's "record/monitor" action: ask for the mic now
    void openMic().then(sync, () => {});
    return;
  }
  for (const t of armed) {
    const ch = getChannel(t.id);
    if (!ch || connected.has(t.id)) continue;
    src.connect(ch.input.input as unknown as AudioNode);
    connected.set(t.id, src);
  }
}

let started = false;

export function startLiveInput() {
  if (started) return;
  started = true;
  let last = useStore.getState().project.tracks;
  useStore.subscribe((s) => {
    if (s.project.tracks === last) return;
    last = s.project.tracks;
    sync();
  });
  useSettings.subscribe((s, p) => s.monitorWhileArmed !== p.monitorWhileArmed && sync());
  onMicOpen(() => sync());
}
