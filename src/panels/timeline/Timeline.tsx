/**
 * The Timeline panel (D184): the song's sections in song time, with a ruler (bars, and the time
 * through the tempo map), the Tempo lane (D193), the tracks in miniature (mutes per section),
 * automation lanes (D186) and audio on the timeline (D188).
 */
import { Circle, Minus, Plus, Repeat, Rows3, ScanLine } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DragValue } from "../../components/DragValue";
import { contextMenu, dropdown } from "../../components/Menu";
import * as transport from "../../engine/transport";
import { droppedSamples, isSampleDrag } from "../../library/drop";
import { bars, layout, songLength, toAnchor, toSong } from "../../model/arrangement";
import { secondsBetween, songSeconds, tempoAt } from "../../model/tempoMap";
import { TIME_SIGNATURES } from "../../model/tempo";
import { onFrame } from "../../render/raf";
import { alpha, token } from "../../render/theme";
import { backToAutomation, useOverrides } from "../../state/automationOverride";
import { useSettings, type TimelineSnap } from "../../state/settings";
import { useStore } from "../../state/store";
import {
  addAudioTrack,
  addTempoChange,
  deleteSections,
  deleteTempoChanges,
  insertTempoOnCurve,
  setTempoEase,
  setTempoOn,
  duplicateSections,
  moveTempoChange,
  setStartTempo,
  setTempoRamp,
} from "../../state/timelineActions";
import { CurveLane, type LanePoint } from "./CurveLane";
import { openInInspector, pointMenu } from "./pointMenu";
import { onReveal } from "./reveal";
import { TEMPO_TYPES } from "../../model/ease";
import {
  HEADER,
  MAX_ZOOM,
  MIN_ZOOM,
  RULER_H,
  TEMPO_FOLDED_H,
  TEMPO_OPEN_H,
  TRACK_H,
  clock,
  snapQ,
} from "./geometry";
import { SectionsRow } from "./SectionsRow";
import { Row, TrackRows, pickAutomation } from "./TrackRows";
import { ViewCanvas, type View } from "./ViewCanvas";

const SNAPS: { id: TimelineSnap; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "beat", label: "Beat" },
  { id: "16th", label: "16th" },
  { id: "off", label: "Off" },
];

function Ruler({ ppq, width, view }: { ppq: number; width: number; view: View }) {
  const project = useStore((s) => s.project);
  const { editSlotId, startAt, setUi, playing } = useStore();
  const playMode = project.playMode;
  const snap = useSettings((s) => s.timelineSnap);
  const lines = useMemo(() => bars(project), [project]);
  const start = useMemo(() => transport.startPosition(), [project, editSlotId, startAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = layout(project).find((b) => b.section.id === editSlotId);

  const at = (e: React.MouseEvent) =>
    Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / ppq);
  const place = (q: number) => {
    const s = snapQ(project, q, snap === "off" ? "off" : "bar");
    const a = toAnchor(project, Math.min(s, songLength(project) - 1e-6));
    setUi({ editSlotId: a.slotId, startAt: a, selectedSteps: {} });
    if (!playing) setUi({ playSlotId: a.slotId });
  };

  return (
    <div
      className="relative cursor-pointer"
      style={{ width, height: RULER_H }}
      data-hint="timeline.ruler"
      data-testid="timeline-ruler"
      onClick={(e) => place(at(e))}
      onContextMenu={(e) =>
        contextMenu(e, [
          { heading: "Time signature" },
          ...TIME_SIGNATURES.map(([b, u]) => ({
            label: `${b}/${u}`,
            checked: project.timeSignature[0] === b && project.timeSignature[1] === u,
            onSelect: () => useStore.getState().commit((p) => void (p.timeSignature = [b, u])),
          })),
        ])
      }
      onDoubleClick={(e) => {
        place(at(e));
        if (useStore.getState().playing) transport.stop();
        transport.play();
      }}
    >
      <ViewCanvas
        view={view}
        height={RULER_H}
        deps={[lines, ppq, project.tempo, project.bpm]}
        draw={(ctx, from, w) => {
          const dim = token("text-dim") || "#888888";
          const faint = token("text-faint") || "#555555";
          ctx.font = "10px 'JetBrains Mono Variable', monospace";
          ctx.textBaseline = "top";
          // label every bar, or every 2nd, 4th… when they're close together
          const barPx = (lines[1]?.q ?? 4) * ppq || 40;
          const every = barPx >= 30 ? 1 : barPx >= 15 ? 2 : barPx >= 7 ? 4 : barPx >= 3 ? 8 : 16;
          let lastTime = -Infinity;
          for (const l of lines) {
            const x = l.q * ppq;
            if (x < from - 60 || x > from + w + 10) continue;
            const major = (l.bar - 1) % every === 0;
            ctx.fillStyle = major ? dim : faint;
            ctx.fillRect(Math.round(x), major ? 0 : RULER_H - 8, 1, major ? RULER_H : 8);
            if (major) {
              ctx.fillText(String(l.bar), x + 3, 2);
              if (x - lastTime > 46) {
                ctx.fillStyle = faint;
                ctx.fillText(clock(secondsBetween(project, 0, l.q)), x + 3, 17);
                lastTime = x;
              }
            }
          }
        }}
      />
      {playMode === "loop" && edit && (
        <div
          className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-accent"
          style={{ left: edit.start * ppq, width: edit.span * ppq }}
          title="Loop: only this section plays"
        />
      )}
      <div
        className="pointer-events-none absolute top-0 text-[10px] leading-none text-lit"
        style={{ left: start * ppq - 4 }}
        data-testid="start-marker"
        title="Play starts here"
      >
        ▼
      </div>
    </div>
  );
}

function TempoLane({ ppq, width }: { ppq: number; width: number }) {
  const project = useStore((s) => s.project);
  const open = useSettings((s) => s.timelineTempoOpen);
  const snap = useSettings((s) => s.timelineSnap);
  const changes = project.tempo ?? [];
  const points: LanePoint[] = changes
    .map((t, i) => ({ t, i, q: toSong(project, t) }))
    .filter((x) => x.q !== null)
    .map((x) => ({
      index: x.i,
      q: x.q!,
      value: x.t.bpm,
      on: x.t.on !== false,
      eased: !!(x.t.in || x.t.out),
    }));
  const values = [project.bpm, ...changes.map((t) => t.bpm)];
  const min = Math.max(20, Math.floor((Math.min(...values) - 20) / 10) * 10);
  const max = Math.min(300, Math.ceil((Math.max(...values) + 20) / 10) * 10);
  const h = open ? TEMPO_OPEN_H : TEMPO_FOLDED_H;
  return (
    <Row
      height={h}
      header={
        <div className="flex h-full items-center gap-1 px-1.5">
          <button
            className="label flex-1 text-left"
            onDoubleClick={() => openInInspector({ kind: "tempo" })}
            title={
              open ? "Fold the Tempo lane" : "Open the Tempo lane: tempo changes over the song"
            }
            data-hint="timeline.tempo"
            data-testid="tempo-lane-toggle"
            onClick={() => useSettings.getState().set({ timelineTempoOpen: !open })}
          >
            {open ? "▾ Tempo" : `▸ Tempo${points.length ? ` · ${points.length}` : ""}`}
          </button>
          {open && (
            <DragValue
              value={project.bpm}
              min={20}
              max={300}
              step={1}
              defaultValue={120}
              className="!h-5 !px-1 text-[10px]"
              title="The start tempo · drag or scroll"
              format={(v) => `${Math.round(v)}`}
              onChange={setStartTempo}
            />
          )}
          {open && (
            <button
              className="tool-btn !h-5 !min-w-0 !px-1 text-[9px]"
              title="Tempo lane menu"
              data-hint="timeline.tempo.menu"
              data-testid="tempo-menu"
              onClick={(e) =>
                contextMenu(e, [
                  {
                    label: "Edit tempo changes in the Inspector",
                    onSelect: () => openInInspector({ kind: "tempo" }),
                  },
                ])
              }
            >
              ⋯
            </button>
          )}
        </div>
      }
    >
      {open ? (
        <CurveLane
          laneKey="tempo"
          points={points}
          curve={(q) => tempoAt(project, q)}
          ppq={ppq}
          width={width}
          height={h}
          min={min}
          max={max}
          color={token("lit") || "#ffb547"}
          format={(v) => `${Math.round(v * 10) / 10} BPM`}
          snap={(q, free) => snapQ(project, q, free ? "off" : snap === "bar" ? "beat" : snap)}
          round={(v, free) => (free ? Math.round(v * 10) / 10 : Math.round(v))}
          onAdd={(q, v, onCurve) => (onCurve ? insertTempoOnCurve(q) : addTempoChange(q, v))}
          onMove={(i, q, v, key) => moveTempoChange(i, q, v, key)}
          onDelete={deleteTempoChanges}
          onMenu={(i, e) => {
            const sel = useStore.getState().pointSelection;
            const ids = sel.lane === "tempo" && sel.indexes.includes(i) ? sel.indexes : [i];
            const t = changes[i];
            contextMenu(
              e,
              pointMenu({
                count: ids.length,
                easeIn: t?.in,
                easeOut: t?.out,
                inTypes: TEMPO_TYPES,
                outTypes: TEMPO_TYPES,
                on: t?.on !== false,
                setEase: (side, ease) => setTempoEase(ids, side, ease),
                setOn: (on) => setTempoOn(ids, on),
                remove: () => deleteTempoChanges(ids),
                inspect: { kind: "tempo" },
                ramp: { on: !!t?.ramp, set: (r) => ids.forEach((x) => setTempoRamp(x, r)) },
              }),
            );
          }}
          testId="tempo-lane"
          hint="timeline.tempo.lane"
        />
      ) : (
        <div style={{ width, height: h }} className="relative">
          {points.map((p) => (
            <span
              key={p.index}
              className="absolute top-[3px] h-2 w-[3px] rounded-sm bg-lit"
              style={{ left: p.q * ppq - 1 }}
              title={`${p.value} BPM`}
            />
          ))}
        </div>
      )}
    </Row>
  );
}

/** Set the zoom (pixels per quarter note), within its range; returns it. */
function zoomTo(z: number) {
  const v = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  useSettings.getState().set({ timelineZoom: Math.round(v * 100) / 100 });
  return v;
}

export function Timeline() {
  const project = useStore((s) => s.project);
  const { follow, songLoop, setUi, setPlayMode } = useStore();
  const recordAutomation = useStore((s) => s.recordAutomation);
  const settings = useSettings();
  const overridden = useOverrides((s) => s.overridden);
  const scroller = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ left: 0, width: 800 });
  const [selected, setSelected] = useState<string[]>([]);
  const [dropHint, setDropHint] = useState(false);
  const ppq = settings.timelineZoom;
  const total = songLength(project);
  const width = Math.max(view.width, total * ppq + 160);
  const startQ = transport.startPosition();

  // the visible part of the rows, for their canvases
  useLayoutEffect(() => {
    const el = scroller.current!;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setView({ left: Math.max(0, el.scrollLeft), width: Math.max(1, el.clientWidth - HEADER) }),
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // the playhead, and following it
  useEffect(
    () =>
      onFrame(() => {
        const el = playhead.current;
        const sc = scroller.current;
        if (!el || !sc) return;
        const q = transport.songPosition();
        if (q === null) {
          el.style.display = "none";
          return;
        }
        el.style.display = "block";
        const x = q * ppq;
        el.style.transform = `translateX(${x}px)`;
        if (useStore.getState().follow) {
          const visible = sc.clientWidth - HEADER;
          if (x < sc.scrollLeft || x > sc.scrollLeft + visible - 20)
            sc.scrollLeft = Math.max(0, x - visible / 3);
        }
      }),
    [ppq],
  );

  // a row clicked in the Inspector's table: show its point (D200)
  useEffect(
    () =>
      onReveal((q) => {
        const sc = scroller.current;
        if (!sc) return;
        const x = q * ppq;
        const visible = sc.clientWidth - HEADER;
        if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + visible - 20)
          sc.scrollTo({ left: Math.max(0, x - visible / 2), behavior: "smooth" });
      }),
    [ppq],
  );

  // ⌘+scroll zooms around the pointer
  useEffect(() => {
    const el = scroller.current!;
    const wheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      const x = e.clientX - el.getBoundingClientRect().left - HEADER + el.scrollLeft;
      const q = x / useSettings.getState().timelineZoom;
      const z = zoomTo(useSettings.getState().timelineZoom * Math.exp(-e.deltaY * 0.004));
      el.scrollLeft = Math.max(0, q * z - (x - el.scrollLeft));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const fit = () => zoomTo(Math.max(MIN_ZOOM, (view.width - 40) / Math.max(1, total)));

  const dropQ = (e: React.DragEvent) =>
    Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / ppq);

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, [contenteditable]")) return;
    const mod = e.metaKey || e.ctrlKey;
    if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
      e.preventDefault();
      e.stopPropagation();
      deleteSections(selected);
      setSelected([]);
    } else if (mod && e.key.toLowerCase() === "d" && selected.length) {
      e.preventDefault();
      e.stopPropagation();
      setSelected(duplicateSections(selected, e.shiftKey));
    } else if (e.key === "Escape" && selected.length) {
      e.stopPropagation();
      setSelected([]);
    }
  };

  const length = songSeconds(project);
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-panel outline-none"
      data-testid="timeline"
      tabIndex={-1}
      onKeyDown={onKey}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 py-1">
        <div className="segmented shrink-0" title="Playback mode" data-hint="dm.section.mode">
          <button data-active={project.playMode === "loop"} onClick={() => setPlayMode("loop")}>
            Loop
          </button>
          <button data-active={project.playMode === "song"} onClick={() => setPlayMode("song")}>
            Song
          </button>
        </div>
        {project.playMode === "song" && (
          <button
            className="tool-btn shrink-0"
            data-active={songLoop}
            title={
              songLoop
                ? "Song loops (click to stop at the end)"
                : "Song stops at the end (click to loop)"
            }
            data-hint="dm.section.song-loop"
            onClick={() => setUi({ songLoop: !songLoop })}
          >
            <Repeat size={13} />
          </button>
        )}
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          className="field"
          title="What drags snap to (Shift while dragging: free)"
          data-hint="timeline.snap"
          onClick={(e) =>
            dropdown(
              e.currentTarget,
              SNAPS.map((s) => ({
                label: s.label,
                checked: settings.timelineSnap === s.id,
                onSelect: () => settings.set({ timelineSnap: s.id }),
              })),
            )
          }
        >
          <span className="label">Snap</span>
          <span className="text-ink">
            {SNAPS.find((s) => s.id === settings.timelineSnap)?.label}
          </span>
        </button>
        <button
          className="field"
          title="Which tracks show"
          data-hint="timeline.tracks"
          onClick={(e) =>
            dropdown(e.currentTarget, [
              {
                label: "All tracks",
                checked: settings.timelineTracks === "all",
                onSelect: () => settings.set({ timelineTracks: "all" }),
              },
              {
                label: "Only with automation or audio",
                checked: settings.timelineTracks === "used",
                onSelect: () => settings.set({ timelineTracks: "used" }),
              },
              {
                label: "None",
                checked: settings.timelineTracks === "none",
                onSelect: () => settings.set({ timelineTracks: "none" }),
              },
            ])
          }
        >
          <Rows3 size={12} />
          <span className="text-ink">Tracks</span>
        </button>
        <button
          className="tool-btn"
          title="Automate a knob"
          data-hint="timeline.automate"
          data-testid="timeline-automate"
          onClick={(e) => pickAutomation(e.currentTarget, startQ)}
        >
          <Plus size={12} /> Automation
        </button>
        <button
          className="tool-btn"
          data-active={recordAutomation}
          aria-pressed={recordAutomation}
          title={
            recordAutomation
              ? "Automation armed: while recording in Song mode, knob turns become points (click to disarm)"
              : "Arm automation: while recording in Song mode, knob turns become points"
          }
          data-hint="timeline.arm-automation"
          data-testid="timeline-arm-automation"
          onClick={() => setUi({ recordAutomation: !recordAutomation })}
        >
          <Circle size={10} fill={recordAutomation ? "currentColor" : "none"} /> Arm
        </button>
        {Object.keys(overridden).length > 0 && (
          <button
            className="tool-btn !text-lit"
            data-active
            title="You turned automated knobs: bring their automation back"
            data-hint="timeline.back-to-automation"
            data-testid="back-to-automation"
            onClick={backToAutomation}
          >
            ⟲ Back to automation
          </button>
        )}
        <span className="flex-1" />
        <span
          className="num text-[10px] text-dim"
          title="The song's length (through the tempo changes)"
        >
          {clock(length)}
          {project.tempo?.length ? ` · ${Math.round(tempoAt(project, startQ))} BPM at ▼` : ""}
        </span>
        <button
          className="tool-btn"
          title="Zoom out"
          data-hint="timeline.zoom"
          onClick={() => zoomTo(ppq / 1.4)}
        >
          <Minus size={12} />
        </button>
        <button className="tool-btn" title="Fit the song" data-hint="timeline.zoom" onClick={fit}>
          <ScanLine size={12} />
        </button>
        <button
          className="tool-btn"
          title="Zoom in (⌘+scroll)"
          data-hint="timeline.zoom"
          onClick={() => zoomTo(ppq * 1.4)}
        >
          <Plus size={12} />
        </button>
        <button
          className="tool-btn"
          data-active={follow}
          title="Follow the playhead"
          data-hint="timeline.follow"
          onClick={() => setUi({ follow: !follow })}
        >
          Follow
        </button>
      </div>
      <div ref={scroller} className="scroll-thin relative min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: width + HEADER }}>
          <Row
            height={RULER_H}
            className="sticky top-0 z-20 bg-panel"
            header={<div className="label px-2 pt-2">Bars</div>}
          >
            <Ruler ppq={ppq} width={width} view={view} />
          </Row>
          <TempoLane ppq={ppq} width={width} />
          <Row
            height={60}
            header={
              <div className="flex h-full flex-col justify-center px-2">
                <span className="label">Sections</span>
                <span className="text-[9px] text-faint">{project.slots.length} in the song</span>
              </div>
            }
          >
            <SectionsRow
              project={project}
              ppq={ppq}
              width={width}
              view={view}
              selected={selected}
              setSelected={setSelected}
            />
          </Row>
          <TrackRows
            project={project}
            ppq={ppq}
            width={width}
            view={view}
            at={startQ}
            overridden={overridden}
          />
          <Row
            height={TRACK_H + 10}
            header={<div className="label px-2 pt-2 text-faint">Audio</div>}
          >
            <div
              className="flex items-center px-2 text-[10px] text-faint"
              style={{
                width,
                height: TRACK_H + 10,
                background: dropHint ? alpha(token("accent") || "#7dd3fc", 0.12) : undefined,
              }}
              data-hint="timeline.drop"
              data-testid="timeline-drop"
              onDragOver={(e) => {
                if (!isSampleDrag(e.dataTransfer)) return;
                e.preventDefault();
                setDropHint(true);
              }}
              onDragLeave={() => setDropHint(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDropHint(false);
                const q = snapQ(project, dropQ(e), e.shiftKey ? "off" : settings.timelineSnap);
                const { ids } = await droppedSamples(e.dataTransfer);
                if (ids[0]) addAudioTrack(ids[0], q);
              }}
            >
              Drop a sample here for a new audio track (it plays in song time, across sections)
            </div>
          </Row>
          <div
            ref={playhead}
            className="pointer-events-none absolute top-0 z-30 h-full w-px bg-lit"
            style={{ left: HEADER, display: "none" }}
            data-testid="timeline-playhead"
          />
        </div>
      </div>
    </div>
  );
}
