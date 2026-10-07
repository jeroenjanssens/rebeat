/** Starting audio: browsers only allow it after a user gesture. */
import { useShell } from "../app/shell";
import { useSettings } from "../state/settings";

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  return ctx;
}

export async function startAudio(): Promise<boolean> {
  const shell = useShell.getState();
  if (shell.audio === "running") return true;
  shell.set({ audio: "starting", audioError: "" });
  try {
    if (!ctx) ctx = new AudioContext({ latencyHint: useSettings.getState().latencyMode });
    await ctx.resume();
    shell.set({ audio: "running" });
    return true;
  } catch (e) {
    shell.set({ audio: "error", audioError: String(e) });
    return false;
  }
}
