/** The audio context. Browsers only let it start after a user gesture. */
import * as Tone from "tone";
import { useShell } from "../app/shell";
import { useSettings } from "../state/settings";
import { initEngine } from "./engine";
import { renderKits } from "./kits";

let created = false;

/** Create the context with the user's latency setting (before any audio node exists). */
export function createAudioContext() {
  if (created) return;
  created = true;
  const { latencyMode } = useSettings.getState();
  // A native context: Tone's default wrapper (standardized-audio-context) checks the whole graph
  // for cycles on every connect, which gets very slow with a node per drum hit.
  const native = new AudioContext({ latencyHint: latencyMode });
  // our scheduler has its own lookahead; keep Tone's small so immediate changes feel instant
  Tone.setContext(new Tone.Context({ context: native, lookAhead: 0.01 }));
  void renderKits();
}

export function audioContext(): AudioContext {
  createAudioContext();
  return Tone.getContext().rawContext as AudioContext;
}

export async function setOutputDevice(deviceId: string) {
  const ctx = audioContext() as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  try {
    await ctx.setSinkId?.(deviceId);
  } catch (e) {
    console.warn("Could not switch the output device", e);
  }
}

export async function startAudio(): Promise<boolean> {
  const shell = useShell.getState();
  if (shell.audio === "running") return true;
  shell.set({ audio: "starting", audioError: "" });
  try {
    createAudioContext();
    await Tone.start();
    await renderKits();
    initEngine();
    const { outputDeviceId } = useSettings.getState();
    if (outputDeviceId) await setOutputDevice(outputDeviceId);
    shell.set({ audio: "running" });
    const ctx = audioContext();
    ctx.addEventListener("statechange", () =>
      useShell.getState().set({ audio: ctx.state === "running" ? "running" : "suspended" }),
    );
    return true;
  } catch (e) {
    shell.set({ audio: "error", audioError: String(e) });
    return false;
  }
}
