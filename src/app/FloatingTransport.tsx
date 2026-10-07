import { useEffect, useRef, useState } from "react";
import { Minimize, Play, Square } from "lucide-react";
import { DragValue } from "../components/DragValue";
import * as clock from "../engine/transport";
import { platform } from "../platform";
import { useStore } from "../state/store";

/** A slim transport that auto-hides; shown in panel full screen. */
export function FloatingTransport() {
  const playing = useStore((s) => s.playing);
  const bpm = useStore((s) => s.project.bpm);
  const playMode = useStore((s) => s.playMode);
  const [visible, setVisible] = useState(true);
  const timer = useRef(0);
  const hovering = useRef(false);

  useEffect(() => {
    const show = (e: PointerEvent) => {
      if (e.clientY > 120 && !hovering.current) return;
      setVisible(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => !hovering.current && setVisible(false), 2200);
    };
    timer.current = window.setTimeout(() => setVisible(false), 2500);
    window.addEventListener("pointermove", show);
    return () => {
      window.removeEventListener("pointermove", show);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      className="absolute left-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-line-strong bg-raised/95 px-2 py-1.5 shadow-2xl transition-[opacity,transform] duration-150"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translate(-50%, ${visible ? 0 : -12}px)`,
        pointerEvents: visible ? "auto" : "none",
      }}
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => (hovering.current = false)}
      data-testid="floating-transport"
    >
      <button
        className="hw-btn !min-h-[26px] !flex-row gap-1.5"
        data-lit={playing}
        onClick={clock.toggle}
        data-hint="transport.play"
      >
        {playing ? (
          <Square size={11} fill="currentColor" />
        ) : (
          <Play size={11} fill="currentColor" />
        )}
        {playing ? "Stop" : "Play"}
      </button>
      <span data-hint="transport.bpm">
        <DragValue
          label="BPM"
          value={bpm}
          min={20}
          max={300}
          defaultValue={120}
          format={(v) => v.toFixed(0)}
          onChange={(v) => useStore.getState().commit((p) => void (p.bpm = v), "bpm")}
        />
      </span>
      <div className="segmented" data-hint="transport.playmode">
        <button
          data-active={playMode === "loop"}
          onClick={() => useStore.getState().setUi({ playMode: "loop" })}
        >
          Page
        </button>
        <button
          data-active={playMode === "song"}
          onClick={() => useStore.getState().setUi({ playMode: "song" })}
        >
          Song
        </button>
      </div>
      <button
        className="tool-btn"
        title="Leave full screen (Esc)"
        onClick={() => platform.fullscreen.exit()}
        data-hint="app.fullscreen"
      >
        <Minimize size={14} />
      </button>
    </div>
  );
}
