import { Power } from "lucide-react";
import { startAudio } from "../engine/context";
import { useShell } from "./shell";

/** One-time "click to start audio" overlay (browsers need a user gesture before audio). */
export function AudioStartOverlay() {
  const status = useShell((s) => s.audio);
  if (status === "running") return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
      onPointerDown={() => startAudio()}
      data-testid="audio-overlay"
    >
      <button className="flex flex-col items-center gap-3 rounded-xl border border-line-strong bg-raised px-10 py-8 shadow-2xl">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line-strong bg-surface text-lit">
          <Power size={24} />
        </span>
        <span className="text-[15px] font-semibold">Click to start audio</span>
        <span className="text-[12px] text-dim">
          {status === "error"
            ? "Audio could not start. Click to try again."
            : "Browsers need a click before playing sound."}
        </span>
      </button>
    </div>
  );
}
