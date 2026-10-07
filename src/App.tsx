import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Play, Square } from "lucide-react";
import { DragValue } from "./components/DragValue";
import { MenuHost } from "./components/Menu";
import { DrumMachine } from "./drum-machine/DrumMachine";
import * as clock from "./mock/clock";
import { applyTheme } from "./render/theme";
import { clearSelection, fnClick, fnPress, fnRelease } from "./state/actions";
import { useStore, type SizeMode, type ThemeId } from "./state/store";

const THEMES: { id: ThemeId; label: string }[] = [
  { id: "studio-dark", label: "Studio Dark" },
  { id: "midnight", label: "Midnight" },
  { id: "paper", label: "Paper" },
];

const SIZES: { id: SizeMode; label: string; width: string }[] = [
  { id: "auto", label: "Auto", width: "100%" },
  { id: "compact", label: "Compact", width: "640px" },
  { id: "regular", label: "Regular", width: "1240px" },
  { id: "large", label: "Large", width: "100%" },
];

function useShortcuts() {
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement).closest("input, textarea");
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Shift") s.setUi({ shiftHeld: true });
      if (e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        clock.toggle();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === "c") fnClick("copy");
      else if (mod && e.key.toLowerCase() === "v") fnClick("paste");
      else if (mod) return;
      else if (e.key === "Backspace" || e.key === "Delete") fnClick("clear");
      else if (e.key === "Escape") clearSelection();
      else if (e.key === "d") s.setUi({ tool: "draw" });
      else if (e.key === "e") s.setUi({ tool: "erase" });
      else if (e.key === "s") s.setUi({ tool: "select" });
      else if (e.key === "v") s.setUi({ view: s.view === "grid" ? "pads" : "grid" });
      else if (e.key === "m") fnPress("mute");
    };
    const up = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.key === "Shift") s.setUi({ shiftHeld: false });
      if (e.key === "m" && s.held === "mute") fnRelease("mute");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
}

export function App() {
  const { theme, sizeMode, playing, setUi, commit } = useStore();
  const bpm = useStore((s) => s.project.bpm);
  const projectName = useStore((s) => s.project.name);
  const panelRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useShortcuts();

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else panelRef.current?.requestFullscreen();
  };

  const width = SIZES.find((s) => s.id === sizeMode)!.width;

  return (
    <div className="flex h-full flex-col">
      {/* mockup harness: stands in for the real transport bar (Phase 0) */}
      <header className="flex h-12 whitespace-nowrap shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-tight">
            re<span className="text-lit">beat</span>
          </span>
          <span className="label hidden whitespace-nowrap xl:inline">
            Phase M · drum machine mockup
          </span>
        </div>
        <span className="whitespace-nowrap text-[12px] text-dim">{projectName}</span>
        <div className="mx-2 h-5 w-px bg-line" />
        <button
          className="hw-btn !flex-row gap-1.5"
          data-lit={playing}
          onClick={clock.toggle}
          title="Play / stop (Space)"
        >
          {playing ? (
            <Square size={12} fill="currentColor" />
          ) : (
            <Play size={12} fill="currentColor" />
          )}
          {playing ? "Stop" : "Play"}
        </button>
        <DragValue
          label="BPM"
          value={bpm}
          min={40}
          max={240}
          defaultValue={120}
          format={(v) => v.toFixed(0)}
          onChange={(v) => commit((p) => void (p.bpm = v), "bpm")}
        />
        <span className="hidden truncate text-[11px] text-faint 2xl:inline">
          No audio in the mockup: scopes and flashes are simulated.
        </span>
        <div className="flex-1" />
        <span className="label">Theme</span>
        <div className="segmented">
          {THEMES.map((t) => (
            <button key={t.id} data-active={theme === t.id} onClick={() => setUi({ theme: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="label">Size</span>
        <div className="segmented">
          {SIZES.map((s) => (
            <button
              key={s.id}
              data-active={sizeMode === s.id}
              onClick={() => setUi({ sizeMode: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 justify-center overflow-auto bg-bg p-3">
        <div
          ref={panelRef}
          className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-xl"
          style={{ width, maxWidth: "100%" }}
        >
          {/* stands in for the Dockview tab (Phase 0) */}
          <div className="flex h-8 shrink-0 items-center border-b border-line bg-surface pl-3 pr-1.5">
            <span className="label !text-ink">Drum machine</span>
            <div className="flex-1" />
            <button
              className="tool-btn !h-6"
              onClick={toggleFullscreen}
              title="Panel full screen (Esc to leave)"
            >
              {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <DrumMachine />
          </div>
        </div>
      </main>
      <MenuHost />
    </div>
  );
}
