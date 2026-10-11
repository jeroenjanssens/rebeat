import { useEffect, useRef, useState } from "react";
import {
  Circle,
  Command as CommandIcon,
  Expand,
  Keyboard,
  LayoutPanelLeft,
  Magnet,
  Minimize,
  Play,
  Settings,
  Square,
  Timer,
  CircleHelp,
  MessageSquareText,
} from "lucide-react";
import { DragValue } from "../components/DragValue";
import { LevelMeter } from "../components/LevelMeter";
import { contextMenu, dropdown, type MenuItem } from "../components/Menu";
import { startMidiLearn } from "../midi/learn";
import * as engine from "../engine/engine";
import * as clock from "../engine/transport";
import { TIME_SIGNATURES, createTapTempo } from "../model/tempo";
import { STEP_SIZE_QUARTERS } from "../model/types";
import { platform } from "../platform";
import { getLoad, startMainLoad } from "../engine/load";
import { useSettings } from "../state/settings";
import {
  addKeysSoundAsTrack,
  keysEditor,
  keysTargetName,
  setKeysTarget,
  useKeys,
} from "../state/keys";
import { useStore } from "../state/store";
import { isExampleId } from "../templates/examples";
import { LAYOUT_PRESETS, applyPreset, openPanel } from "./layouts";
import { openGuide } from "./openers";
import { PANELS } from "./panels";
import { dock, useShell } from "./shell";

const tap = createTapTempo();

export function tapTempo() {
  const bpm = tap(performance.now());
  if (bpm) useStore.getState().commit((p) => void (p.bpm = bpm), "bpm");
}

/** Right-click a transport button: MIDI learn its command, in every project (D122). */
const learnCommand = (id: string, title: string) => (e: React.MouseEvent) =>
  contextMenu(e, [
    {
      label: `MIDI learn: ${title} (every project)`,
      onSelect: () => startMidiLearn(`command:${id}`, title, "global"),
    },
  ]);

function Toggle({
  lit,
  onClick,
  title,
  hint,
  command,
  children,
}: {
  lit: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  /** The command it runs, for MIDI learn. */
  command?: { id: string; title: string };
  children: React.ReactNode;
}) {
  return (
    <button
      className="hw-btn !min-h-[26px] !flex-row gap-1"
      data-lit={lit}
      onClick={onClick}
      title={title}
      data-hint={hint}
      onContextMenu={command ? learnCommand(command.id, command.title) : undefined}
    >
      {children}
    </button>
  );
}

/** Bar.beat.step position of the playhead, updated on the frame loop (not React). */
function Position() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      clock.onStep((e) => {
        if (!ref.current) return;
        if (e.pageStep < 0) {
          ref.current.textContent = "1.1.1";
          return;
        }
        const p = useStore.getState().project;
        const pattern = p.patterns[e.patternId];
        const spb = Math.max(1, Math.round(1 / STEP_SIZE_QUARTERS[pattern.stepSize]));
        const beats = p.timeSignature[0];
        const bar = Math.floor(e.pageStep / (spb * beats)) + 1;
        const beat = (Math.floor(e.pageStep / spb) % beats) + 1;
        const step = (e.pageStep % spb) + 1;
        ref.current.textContent = `${bar}.${beat}.${step}`;
      }),
    [],
  );
  return (
    <span
      ref={ref}
      className="num w-[52px] rounded border border-line bg-display px-1.5 py-0.5 text-center text-[11px] text-lit"
      title="Bar . beat . step"
      data-hint="transport.position"
    >
      1.1.1
    </span>
  );
}

function SaveDot() {
  const status = useStore((s) => s.saveStatus);
  const color =
    status === "error" ? "#ef4444" : status === "saved" ? "transparent" : "var(--text-faint)";
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color }}
      title={
        status === "error" ? "Saving failed" : status === "saved" ? "Saved" : "Unsaved changes"
      }
      data-testid="save-status"
      data-status={status}
    />
  );
}

function CpuMeter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Start main-thread monitoring as soon as the bar mounts (idempotent).
    startMainLoad();

    const update = () => {
      const snap = getLoad();
      const f = Math.min(1, snap.fraction);
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${f})`;
        barRef.current.style.background =
          f > 0.8 ? "#ef4444" : f > 0.5 ? "#f59e0b" : "var(--accent)";
      }
      if (labelRef.current) labelRef.current.textContent = snap.label;
      if (containerRef.current) {
        const audioLine =
          snap.audioAvg >= 0
            ? `Audio avg ${Math.round(snap.audioAvg * 100)}%  peak ${Math.round(snap.audioPeak * 100)}%` +
              (snap.underruns > 0 ? `  dropouts ${snap.underruns}` : "")
            : "Audio: not available (no AudioRenderCapacity)";
        containerRef.current.title = [
          snap.label,
          audioLine,
          `Main busy ${Math.round(snap.mainBusy * 100)}%`,
          `Scheduler late ${snap.schedulerLateMs.toFixed(1)} ms`,
        ].join("\n");
      }
    };

    // Use setInterval so the meter keeps updating even when the rAF loop has no subscribers.
    const id = setInterval(update, 200);
    update();
    return () => clearInterval(id);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1.5"
      data-hint="transport.cpu"
      data-testid="cpu-meter"
    >
      <span className="label">CPU</span>
      <div className="h-[6px] w-10 overflow-hidden rounded-sm bg-pad">
        <div
          ref={barRef}
          className="h-full origin-left"
          style={{ transform: "scaleX(0)", background: "var(--accent)" }}
        />
      </div>
      <span ref={labelRef} className="num w-16 text-[10px] text-dim">
        Main 0%
      </span>
    </div>
  );
}

function AudioStatus() {
  const status = useShell((s) => s.audio);
  const error = useShell((s) => s.audioError);
  const color =
    status === "running"
      ? "#22c55e"
      : status === "error"
        ? "#ef4444"
        : status === "starting"
          ? "#eab308"
          : "var(--text-faint)";
  const text =
    status === "running"
      ? "Audio on"
      : status === "error"
        ? "Audio error"
        : status === "starting"
          ? "Starting…"
          : "Audio off";
  return (
    <span
      className="flex items-center gap-1.5"
      title={error || text}
      data-testid="audio-status"
      data-status={status}
      data-hint="transport.audiostatus"
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span className="label hidden @[1100px]:inline">{text}</span>
    </span>
  );
}

/** The keys chip: shows the current target and a menu to change it. */
function KeysChip() {
  const chipRef = useRef<HTMLButtonElement>(null);
  const keysTarget = useKeys((s) => s.target);
  const keysStatus = useKeys((s) => s.status);
  const recent = useKeys((s) => s.recent);
  // the chip's name follows the synth editor too (D132)
  useKeys((s) => s.editor);
  const followEditor = useSettings((s) => s.keysFollowEditor);
  const tracks = useStore((s) => s.project.tracks);
  const selectedTrackId = useStore((s) => s.selectedTrackId);

  const name = keysTargetName();
  const isSound = keysTarget.kind === "sound";
  const isLoading = keysStatus === "loading";

  const openMenu = () => {
    const notesTracks = tracks.filter((t) => t.mode === "notes");
    const items: import("../components/Menu").MenuItem[] = [
      {
        label: "Follow selected track",
        checked: keysTarget.kind === "selected",
        onSelect: () => setKeysTarget({ kind: "selected" }),
      },
      {
        label: "Follow the synth editor",
        checked: followEditor,
        onSelect: () => useSettings.getState().set({ keysFollowEditor: !followEditor }),
      },
    ];
    if (notesTracks.length > 0) {
      items.push({ separator: true });
      for (const t of notesTracks) {
        items.push({
          label: t.name,
          checked: keysTarget.kind === "track" && keysTarget.id === t.id,
          onSelect: () => setKeysTarget({ kind: "track", id: t.id }),
        });
      }
    }
    if (recent.length > 0) {
      items.push({ separator: true });
      for (const r of recent) {
        items.push({
          label: r.name,
          checked: keysTarget.kind === "sound" && keysTarget.id === r.id,
          onSelect: () => setKeysTarget(r),
        });
      }
    }
    if (isSound) {
      items.push({ separator: true });
      items.push({ label: "Add as a track", onSelect: () => addKeysSoundAsTrack() });
    }
    dropdown(chipRef.current!, items);
  };

  const selectedTrackName = tracks.find((t) => t.id === selectedTrackId)?.name;
  const label =
    keysTarget.kind === "selected" && !keysEditor() ? (selectedTrackName ?? "No track") : name;

  return (
    <button
      ref={chipRef}
      className="field hidden @[800px]:inline-flex"
      title="Keys target: what the keyboard, MIDI and pads play"
      data-hint="transport.keys"
      data-testid="keys-chip"
      onClick={openMenu}
    >
      <Keyboard size={11} />
      <span className="label">Keys</span>
      <span className="num max-w-[80px] truncate" style={{ opacity: isLoading ? 0.5 : 1 }}>
        {isLoading ? "Loading…" : label}
      </span>
    </button>
  );
}

export function TransportBar() {
  const playing = useStore((s) => s.playing);
  const project = useStore((s) => s.project);
  const playMode = useStore((s) => s.project.playMode);
  const projectId = useStore((s) => s.projectId);
  const quantize = useStore((s) => s.quantize);
  const recording = useStore((s) => s.recording);
  const loopBars = useStore((s) => s.loopBars);
  const loopRef = useRef<HTMLButtonElement>(null);
  const { commit, setUi } = useStore.getState();
  const fullscreen = useShell((s) => s.fullscreen);
  const set = useShell((s) => s.set);
  const explain = useSettings((s) => s.explain);
  const recordMode = useSettings((s) => s.recordMode);
  const snap = useSettings((s) => s.snap);
  const setSettings = useSettings((s) => s.set);
  const [tapFlash, setTapFlash] = useState(false);
  const layoutRef = useRef<HTMLButtonElement>(null);
  const sigRef = useRef<HTMLButtonElement>(null);
  const qRef = useRef<HTMLButtonElement>(null);

  const [beats, unit] = project.timeSignature;

  const layoutItems = (): MenuItem[] => [
    ...LAYOUT_PRESETS.map((l) => ({
      label: `Layout: ${l.label}`,
      onSelect: () => dock.api && applyPreset(dock.api, l.id),
    })),
    { separator: true },
    ...PANELS.map((p) => ({
      label: `Show ${p.title}`,
      icon: p.icon,
      checked: !!dock.api?.getPanel(p.id),
      onSelect: () => dock.api && openPanel(dock.api, p.id),
    })),
  ];

  return (
    <header
      className="@container flex h-11 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-line bg-panel px-3"
      data-testid="transport"
    >
      <span className="text-[15px] font-bold tracking-tight">
        re<span className="text-lit">beat</span>
      </span>
      <button
        className="hidden max-w-[180px] items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-[12px] text-dim hover:bg-surface hover:text-ink @[900px]:flex"
        title="Projects (Ctrl/Cmd+O)"
        onClick={() => set({ homeOpen: true })}
        data-testid="project-name"
        data-hint="transport.project"
      >
        <span className="truncate">{project.name}</span>
        {isExampleId(projectId) ? (
          <span
            className="label rounded border border-line px-1 !text-[8.5px]"
            title="An example: your first change makes a copy"
            data-testid="example-badge"
          >
            Example
          </span>
        ) : (
          <SaveDot />
        )}
      </button>
      <div className="mx-1 h-5 w-px bg-line" />

      <button
        className="hw-btn !min-h-[28px] !flex-row gap-1.5"
        data-lit={playing}
        onClick={clock.toggle}
        onContextMenu={learnCommand("transport.toggle", "Play / stop")}
        title="Play / stop (Space)"
        data-testid="play"
        data-hint="transport.play"
      >
        {playing ? (
          <Square size={12} fill="currentColor" />
        ) : (
          <Play size={12} fill="currentColor" />
        )}
        {playing ? "Stop" : "Play"}
      </button>
      <button
        className="hw-btn !min-h-[28px] !flex-row gap-1.5"
        data-lit={recording}
        style={recording ? { color: "#ef4444", borderColor: "#ef4444" } : undefined}
        onClick={() => setUi({ recording: !recording })}
        onContextMenu={learnCommand("transport.record", "Record")}
        title="Record (R): live pad recording and armed Clip tracks"
        data-hint="transport.record"
      >
        <Circle size={11} fill={recording ? "currentColor" : "none"} />
        <span className="hidden @[1000px]:inline">Rec</span>
      </button>
      <button
        className="hw-btn !min-h-[28px] hidden @[950px]:inline-flex"
        data-active={recordMode === "replace"}
        onClick={() =>
          setSettings({ recordMode: recordMode === "overdub" ? "replace" : "overdub" })
        }
        title={
          recordMode === "overdub"
            ? "Overdub: adds notes, keeps existing (click for Replace)"
            : "Replace: clears a step the first time you play it each loop (click for Overdub)"
        }
        data-hint="transport.recordMode"
      >
        {recordMode === "overdub" ? "Ovd" : "Rep"}
      </button>
      <button
        ref={loopRef}
        className="field hidden @[1050px]:inline-flex"
        title="Loop recording length"
        data-hint="transport.loop"
        onClick={() =>
          dropdown(
            loopRef.current!,
            [0, 1, 2, 4, 8].map((n) => ({
              label: n === 0 ? "Page length" : `${n} bar${n > 1 ? "s" : ""}`,
              checked: loopBars === n,
              onSelect: () => setUi({ loopBars: n }),
            })),
          )
        }
      >
        <span className="label">Loop</span>
        <span className="num">{loopBars ? `${loopBars} bar` : "Page"}</span>
      </button>
      <Position />

      <span data-hint="transport.bpm">
        <DragValue
          label="BPM"
          value={project.bpm}
          min={20}
          max={300}
          step={0.1}
          defaultValue={120}
          format={(v) => (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1))}
          onChange={(v) => commit((p) => void (p.bpm = Math.round(v * 10) / 10), "bpm")}
        />
      </span>
      <button
        className="hw-btn !min-h-[26px]"
        data-lit={tapFlash}
        title="Tap tempo (T)"
        data-hint="transport.tap"
        onContextMenu={learnCommand("transport.tap", "Tap tempo")}
        onClick={() => {
          tapTempo();
          setTapFlash(true);
          setTimeout(() => setTapFlash(false), 90);
        }}
      >
        Tap
      </button>
      <button
        ref={sigRef}
        className="field num"
        title="Time signature"
        data-hint="transport.timesig"
        onClick={() =>
          dropdown(
            sigRef.current!,
            TIME_SIGNATURES.map(([b, u]) => ({
              label: `${b}/${u}`,
              checked: b === beats && u === unit,
              onSelect: () => commit((p) => void (p.timeSignature = [b, u])),
            })),
          )
        }
      >
        {beats}/{unit}
      </button>
      <Toggle
        lit={project.metronome}
        onClick={() => commit((p) => void (p.metronome = !p.metronome))}
        title="Metronome (K)"
        hint="transport.metronome"
        command={{ id: "transport.metronome", title: "Metronome on/off" }}
      >
        <Timer size={12} />
        <span className="hidden @[1200px]:inline">Click</span>
      </Toggle>
      <Toggle
        lit={project.countIn}
        onClick={() => commit((p) => void (p.countIn = !p.countIn))}
        title="Count-in: one bar of clicks before playing/recording from a stop"
        hint="transport.countin"
      >
        <span>1234</span>
      </Toggle>
      <span className="hidden @[1150px]:inline-flex" data-hint="transport.swing">
        <DragValue
          label="Swing"
          value={Math.round(project.swing * 100)}
          min={50}
          max={75}
          defaultValue={50}
          format={(v) => `${v}%`}
          onChange={(v) => commit((p) => void (p.swing = v / 100), "gswing")}
          title="Global swing · drag or scroll · double-click = straight"
        />
      </span>
      <button
        className="hw-btn !min-h-[28px] hidden @[1200px]:inline-flex"
        data-active={snap}
        onClick={() => setSettings({ snap: !snap })}
        title={
          snap
            ? "Snap on: note starts snap to the Q grid (click to record free timing)"
            : "Snap off: exact timing recorded as sub-step offset (click to snap)"
        }
        data-hint="transport.snap"
      >
        <Magnet size={12} />
      </button>
      <button
        ref={qRef}
        className="field hidden @[1250px]:inline-flex"
        title="Quantize grid for live recording"
        data-hint="transport.quantize"
        onClick={() =>
          dropdown(
            qRef.current!,
            ["1/4", "1/8", "1/16", "1/32"].map((q) => ({
              label: q,
              checked: quantize === q,
              onSelect: () => setUi({ quantize: q }),
            })),
          )
        }
      >
        <span className="label">Q</span>
        <span className="num">{quantize}</span>
      </button>
      <div
        className="segmented"
        title="Playback mode (L)"
        data-hint="transport.playmode"
        onContextMenu={learnCommand("transport.mode", "Loop / song")}
      >
        <button
          data-active={playMode === "loop"}
          onClick={() => useStore.getState().setPlayMode("loop")}
        >
          Page
        </button>
        <button
          data-active={playMode === "song"}
          onClick={() => useStore.getState().setPlayMode("song")}
        >
          Song
        </button>
      </div>
      <KeysChip />

      <div className="flex-1" />

      <span className="hidden @[1300px]:flex">
        <CpuMeter />
      </span>
      <span data-hint="transport.masterlevel">
        <LevelMeter read={() => engine.masterLevel()} width={64} height={11} title="Master level" />
      </span>
      <AudioStatus />
      <div className="mx-1 h-5 w-px bg-line" />
      <button
        className="tool-btn"
        title="Command palette (Ctrl/Cmd+K)"
        onClick={() => set({ paletteOpen: true })}
        data-hint="app.palette"
      >
        <CommandIcon size={14} />
      </button>
      <button
        ref={layoutRef}
        className="tool-btn"
        title="Layouts and panels"
        onClick={() => dropdown(layoutRef.current!, layoutItems())}
        data-hint="app.layouts"
      >
        <LayoutPanelLeft size={14} />
      </button>
      <button
        className="tool-btn"
        title="Full screen (Ctrl/Cmd+Shift+F)"
        onClick={() => (fullscreen ? platform.fullscreen.exit() : platform.fullscreen.enter())}
        data-hint="app.fullscreen"
      >
        {fullscreen ? <Minimize size={14} /> : <Expand size={14} />}
      </button>
      <button
        className="tool-btn"
        title="Explain mode (Shift+F1)"
        data-hint="transport.explain"
        data-active={explain}
        aria-pressed={explain}
        onClick={() => useSettings.getState().set({ explain: !explain })}
        data-testid="toggle-explain"
      >
        <MessageSquareText size={14} />
      </button>
      <button
        className="tool-btn"
        title="Guide (F1)"
        onClick={() => openGuide()}
        data-testid="open-guide"
        data-hint="app.guide"
      >
        <CircleHelp size={14} />
      </button>
      <button
        className="tool-btn"
        title="Settings (Ctrl/Cmd+,)"
        onClick={() => set({ settingsOpen: true })}
        data-testid="open-settings"
        data-hint="app.settings"
      >
        <Settings size={14} />
      </button>
    </header>
  );
}
