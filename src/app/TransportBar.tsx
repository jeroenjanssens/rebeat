import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Circle,
  Command as CommandIcon,
  Expand,
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
import { contextMenu, dropdown, useMenu, type MenuItem } from "../components/Menu";
import { startMidiLearn } from "../midi/learn";
import * as engine from "../engine/engine";
import * as clock from "../engine/transport";
import { TIME_SIGNATURES, createTapTempo } from "../model/tempo";
import { hasTempoChanges } from "../model/tempoMap";
import { onFrame } from "../render/raf";
import { backToAutomation, overrideTempo, useOverrides } from "../state/automationOverride";
import { STEP_SIZE_QUARTERS } from "../model/types";
import { platform } from "../platform";
import { getLoad, startMainLoad } from "../engine/load";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { isExampleId } from "../templates/examples";
import { KeysChip } from "./KeysChip";
import { LAYOUT_PRESETS, applyPreset, openPanel } from "./layouts";
import { openGuide } from "./openers";
import { PANELS } from "./panels";
import { dock, useShell } from "./shell";

const tap = createTapTempo();

export function tapTempo() {
  const bpm = tap(performance.now());
  if (bpm) setTempo(bpm);
}

/**
 * Set the tempo from the transport: the project's, or, when the song has tempo changes, one
 * tempo over them until Back to automation (D193; the start tempo is in the Tempo lane).
 */
export function setTempo(bpm: number) {
  const { project, commit } = useStore.getState();
  if (hasTempoChanges(project)) overrideTempo(bpm);
  else commit((p) => void (p.bpm = Math.round(bpm * 10) / 10), "bpm");
}

/** The tempo to show: the project's, or with tempo changes, the tempo now (it moves). */
function useShownTempo(): number {
  const project = useStore((s) => s.project);
  const typed = useOverrides((s) => s.tempo);
  const changes = hasTempoChanges(project);
  const [now, setNow] = useState(project.bpm);
  useEffect(() => {
    if (!changes) return;
    return onFrame(() => {
      const t = Math.round(tempoNow() * 10) / 10;
      setNow((x) => (x === t ? x : t));
    });
  }, [changes]);
  if (!changes) return project.bpm;
  return typed ?? now;
}

const tempoNow = () => clock.tempoNow();

/** Right-click a transport button: MIDI learn its command, in every project (D122). */
const learnCommand = (id: string, title: string) => (e: React.MouseEvent) =>
  contextMenu(e, [
    {
      label: `MIDI learn: ${title} (every project)`,
      onSelect: () => startMidiLearn(`command:${id}`, title, "global"),
    },
  ]);

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
    </span>
  );
}

/** A popover under an element: live content that stays open while you use it. */
function popover(el: HTMLElement, content: (close: () => void) => React.ReactNode) {
  const r = el.getBoundingClientRect();
  useMenu.getState().show(r.left, r.bottom + 4, [{ render: content }]);
}

/** A row in a top-bar popover: a label and its control. */
function PopRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[28px] items-center gap-2">
      <span className="label w-[86px] shrink-0">{label}</span>
      {children}
    </div>
  );
}

/** Rec ▾ (D215): how recording works. Automation, Overdub or Replace, Snap and the grid, and
 * the Clip tracks' recording length. */
function RecordingPopover() {
  const recordAutomation = useStore((s) => s.recordAutomation);
  const quantize = useStore((s) => s.quantize);
  const loopBars = useStore((s) => s.loopBars);
  const recordMode = useSettings((s) => s.recordMode);
  const snap = useSettings((s) => s.snap);
  const { setUi } = useStore.getState();
  const setSettings = useSettings.getState().set;
  return (
    <div className="flex w-[300px] flex-col gap-1 p-2" data-testid="recording-popover">
      <div className="label mb-1 !text-ink">Recording</div>
      <PopRow label="Automation">
        <button
          className="hw-btn !min-h-[24px]"
          data-lit={recordAutomation}
          onClick={() => setUi({ recordAutomation: !recordAutomation })}
          data-hint="transport.record-automation"
          data-testid="record-automation"
        >
          {recordAutomation ? "Armed" : "Off"}
        </button>
        <span className="text-[10.5px] text-faint">knob turns become points</span>
      </PopRow>
      <PopRow label="Notes">
        <div className="segmented" data-hint="transport.recordMode">
          <button
            data-active={recordMode === "overdub"}
            onClick={() => setSettings({ recordMode: "overdub" })}
          >
            Overdub
          </button>
          <button
            data-active={recordMode === "replace"}
            onClick={() => setSettings({ recordMode: "replace" })}
          >
            Replace
          </button>
        </div>
      </PopRow>
      <PopRow label="Timing">
        <button
          className="hw-btn !min-h-[24px] !flex-row gap-1"
          data-active={snap}
          onClick={() => setSettings({ snap: !snap })}
          data-hint="transport.snap"
        >
          <Magnet size={11} /> {snap ? "Snap" : "Free"}
        </button>
        <div className="segmented" data-hint="transport.quantize">
          {["1/4", "1/8", "1/16", "1/32"].map((q) => (
            <button key={q} data-active={quantize === q} onClick={() => setUi({ quantize: q })}>
              {q}
            </button>
          ))}
        </div>
      </PopRow>
      <PopRow label="Clip length">
        <LoopBars value={loopBars} onChange={(n) => setUi({ loopBars: n })} />
      </PopRow>
    </div>
  );
}

/** How long a Clip track records (the looper): the pattern, or 1–8 bars. */
export function LoopBars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="segmented" data-hint="transport.loop">
      {[0, 1, 2, 4, 8].map((n) => (
        <button key={n} data-active={value === n} onClick={() => onChange(n)}>
          {n === 0 ? "Pattern" : n}
        </button>
      ))}
    </div>
  );
}

/** BPM ▾ (D215): tap, the time signature and the song's swing. */
function TempoPopover() {
  const project = useStore((s) => s.project);
  const [beats, unit] = project.timeSignature;
  const { commit } = useStore.getState();
  const [flash, setFlash] = useState(false);
  return (
    <div className="flex w-[290px] flex-col gap-1 p-2" data-testid="tempo-popover">
      <div className="label mb-1 !text-ink">Tempo & groove</div>
      <PopRow label="Tap">
        <button
          className="hw-btn !min-h-[28px] flex-1"
          data-lit={flash}
          title="Tap tempo (T)"
          data-hint="transport.tap"
          onContextMenu={learnCommand("transport.tap", "Tap tempo")}
          onClick={() => {
            tapTempo();
            setFlash(true);
            setTimeout(() => setFlash(false), 90);
          }}
        >
          Tap
        </button>
      </PopRow>
      <PopRow label="Time signature">
        <div className="flex flex-wrap gap-1" data-hint="transport.timesig">
          {TIME_SIGNATURES.map(([b, u]) => (
            <button
              key={`${b}/${u}`}
              className="tool-btn num !h-6 border border-line"
              data-active={b === beats && u === unit}
              onClick={() => commit((p) => void (p.timeSignature = [b, u]))}
            >
              {b}/{u}
            </button>
          ))}
        </div>
      </PopRow>
      <PopRow label="Song swing">
        <span data-hint="transport.swing">
          <DragValue
            label="Swing"
            value={Math.round(project.swing * 100)}
            min={50}
            max={75}
            defaultValue={50}
            format={(v) => `${v}%`}
            onChange={(v) => commit((p) => void (p.swing = v / 100), "gswing")}
            title="The song's swing (patterns can have their own) · drag or scroll · double-click = straight"
          />
        </span>
      </PopRow>
      {hasTempoChanges(project) && (
        <p className="text-[10.5px] text-faint">
          The song has tempo changes: they're in the Timeline's Tempo lane.
        </p>
      )}
    </div>
  );
}

/** Click ▾ (D215): the metronome, and the count-in with it. */
function ClickPopover() {
  const project = useStore((s) => s.project);
  const { commit } = useStore.getState();
  return (
    <div className="flex w-[240px] flex-col gap-1 p-2" data-testid="click-popover">
      <PopRow label="Metronome">
        <button
          className="hw-btn !min-h-[24px]"
          data-lit={project.metronome}
          onClick={() => commit((p) => void (p.metronome = !p.metronome))}
          data-hint="transport.metronome"
        >
          {project.metronome ? "On" : "Off"}
        </button>
      </PopRow>
      <PopRow label="Count-in">
        <button
          className="hw-btn !min-h-[24px]"
          data-lit={project.countIn}
          onClick={() => commit((p) => void (p.countIn = !p.countIn))}
          data-hint="transport.countin"
          data-testid="count-in"
        >
          {project.countIn ? "1 bar" : "Off"}
        </button>
      </PopRow>
    </div>
  );
}

/** A button with a ▾ beside it for its options (the two halves of one control). */
function Split({
  children,
  onMenu,
  menuTitle,
  menuHint,
  testId,
}: {
  children: React.ReactNode;
  onMenu: (el: HTMLElement) => void;
  menuTitle: string;
  menuHint: string;
  testId?: string;
}) {
  return (
    <span className="inline-flex items-stretch">
      {children}
      <button
        className="hw-btn !min-h-[28px] !min-w-0 !rounded-l-none !border-l-0 !px-1"
        title={menuTitle}
        data-hint={menuHint}
        data-testid={testId}
        onClick={(e) => onMenu(e.currentTarget.parentElement!)}
      >
        <ChevronDown size={11} />
      </button>
    </span>
  );
}

export function TransportBar() {
  const playing = useStore((s) => s.playing);
  const project = useStore((s) => s.project);
  const shownTempo = useShownTempo();
  const tempoChanges = hasTempoChanges(project);
  const overridden = useOverrides((s) => s.overridden);
  const playMode = useStore((s) => s.project.playMode);
  const projectId = useStore((s) => s.projectId);
  const recording = useStore((s) => s.recording);
  const recordAutomation = useStore((s) => s.recordAutomation);
  const { commit, setUi } = useStore.getState();
  const fullscreen = useShell((s) => s.fullscreen);
  const set = useShell((s) => s.set);
  const explain = useSettings((s) => s.explain);
  const layoutRef = useRef<HTMLButtonElement>(null);
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
        className="hidden max-w-[220px] items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-[12px] text-dim hover:bg-surface hover:text-ink @[700px]:flex"
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
      <Split
        onMenu={(el) => popover(el, () => <RecordingPopover />)}
        menuTitle="Recording: automation, overdub or replace, snap, the grid, Clip length"
        menuHint="transport.record.menu"
        testId="record-menu"
      >
        <button
          className="hw-btn relative !min-h-[28px] !flex-row gap-1.5 !rounded-r-none"
          data-lit={recording}
          style={recording ? { color: "#ef4444", borderColor: "#ef4444" } : undefined}
          onClick={() => setUi({ recording: !recording })}
          onContextMenu={learnCommand("transport.record", "Record")}
          title={
            recordAutomation
              ? "Record (R), with automation armed: knob turns become points"
              : "Record (R): live pad recording and armed Clip tracks"
          }
          data-hint="transport.record"
        >
          <Circle size={11} fill={recording ? "currentColor" : "none"} />
          Rec
          {recordAutomation && (
            <span
              className="num rounded-sm bg-accent px-[3px] text-[8.5px] leading-[12px] text-black"
              data-testid="record-automation-badge"
            >
              A
            </span>
          )}
        </button>
      </Split>
      <Position />
      <Split
        onMenu={(el) => popover(el, () => <TempoPopover />)}
        menuTitle="Tempo & groove: tap, time signature, swing"
        menuHint="transport.tempo.menu"
        testId="tempo-menu"
      >
        <span className="inline-flex items-center gap-1" data-hint="transport.bpm">
          <DragValue
            label={tempoChanges ? "BPM ∿" : "BPM"}
            value={shownTempo}
            min={20}
            max={300}
            step={0.1}
            defaultValue={120}
            title={
              tempoChanges
                ? "The tempo now (the song has tempo changes) · dragging overrides them until Back to automation"
                : undefined
            }
            format={(v) => (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1))}
            onChange={setTempo}
          />
          {(beats !== 4 || unit !== 4) && (
            <span className="num pr-1.5 text-[10.5px] text-dim">
              {beats}/{unit}
            </span>
          )}
        </span>
      </Split>
      <Split
        onMenu={(el) => popover(el, () => <ClickPopover />)}
        menuTitle="Metronome and count-in"
        menuHint="transport.click.menu"
        testId="click-menu"
      >
        <button
          className="hw-btn !min-h-[28px] !flex-row gap-1 !rounded-r-none"
          data-lit={project.metronome}
          onClick={() => commit((p) => void (p.metronome = !p.metronome))}
          onContextMenu={learnCommand("transport.metronome", "Metronome on/off")}
          title={`Metronome (K)${project.countIn ? " · count-in on" : ""}`}
          data-hint="transport.metronome"
        >
          <Timer size={12} />
          {project.countIn && <span className="num text-[9px] text-dim">1234</span>}
        </button>
      </Split>
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
          Loop
        </button>
        <button
          data-active={playMode === "song"}
          onClick={() => useStore.getState().setPlayMode("song")}
        >
          Song
        </button>
      </div>
      {Object.keys(overridden).length > 0 && (
        <button
          className="hw-btn !min-h-[26px] !text-lit"
          title="You turned automated knobs or typed a tempo: bring their automation back"
          data-hint="timeline.back-to-automation"
          data-testid="transport-back-to-automation"
          onClick={backToAutomation}
        >
          ⟲ Auto
        </button>
      )}

      <div className="flex-1" />

      <KeysChip className="hidden @[760px]:inline-flex" />
      <span className="hidden @[1100px]:flex">
        <CpuMeter />
      </span>
      <span className="hidden @[960px]:inline" data-hint="transport.masterlevel">
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
