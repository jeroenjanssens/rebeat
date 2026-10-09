import { useMemo, useRef, useState, type CSSProperties } from "react";
import { stepped } from "../../model/tracks";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "./dndModifiers";
import { addTrack, makeTrack } from "../../model/project";
import {
  setStepVelocity,
  stepVelocity,
  type SoundCategory,
  type TrackMode,
} from "../../model/types";
import { contextMenu } from "../../components/Menu";
import { applyHeld, editSteps, setStep, toggleSelected } from "../../state/actions";
import { stepMenu } from "./stepMenu";
import { stepKey, useStore } from "../../state/store";
import { KIT_MIME, addInstrumentTrack, addSampleTracks } from "../../state/trackActions";
import { droppedInstrument, droppedSamples } from "../../library/drop";
import type { Geometry } from "./layout";
import { ParamLane } from "./ParamLane";
import { TrackRow } from "./TrackRow";

type Gesture =
  | { kind: "paint"; on: boolean; key: string }
  | {
      kind: "rightErase";
      trackId: string;
      index: number;
      moved: boolean;
      key: string;
      x: number;
      y: number;
    }
  | { kind: "velocity"; trackId: string; index: number; y: number; v: number; key: string }
  | {
      kind: "marquee";
      x: number;
      y: number;
      moved: boolean;
      additive: boolean;
      start?: { trackId: string; index: number };
    };

function padAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-pad]");
  return el ? { trackId: el.dataset.track!, index: Number(el.dataset.i), el } : null;
}

export function TrackList({ geo }: { geo: Geometry }) {
  const project = useStore((s) => s.project);
  const editSlotId = useStore((s) => s.editSlotId);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const selectedSteps = useStore((s) => s.selectedSteps);
  const lanesVisible = useStore((s) => s.lanes);
  const tool = useStore((s) => s.tool);
  const commit = useStore((s) => s.commit);
  const setUi = useStore((s) => s.setUi);
  const gesture = useRef<Gesture | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const [dropHover, setDropHover] = useState(false);

  const slot = project.slots.find((s) => s.id === editSlotId)!;
  const pattern = project.patterns[slot.patternId];

  const selectedByTrack = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const k of Object.keys(selectedSteps)) {
      const [t, i] = k.split(":");
      if (!map.has(t)) map.set(t, new Set());
      map.get(t)!.add(Number(i));
    }
    return map;
  }, [selectedSteps]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    commit((p) => {
      const from = p.tracks.findIndex((t) => t.id === e.active.id);
      const to = p.tracks.findIndex((t) => t.id === e.over!.id);
      p.tracks = arrayMove(p.tracks, from, to);
    });
  };

  const stepOf = (trackId: string, index: number) => {
    const lane = pattern.lanes[trackId];
    return lane && stepped(project, trackId) ? lane.steps[index] : null;
  };
  const lengthOf = (trackId: string) => {
    const lane = pattern.lanes[trackId];
    return lane?.stepCountOverride ?? pattern.stepCount;
  };

  // ---------- pad gestures ----------

  const begin = (e: React.PointerEvent, g: Gesture) => {
    gesture.current = g;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) {
      // right-drag erases; a right-click without moving opens the step menu
      const hit = padAt(e.clientX, e.clientY);
      if (hit && hit.index < lengthOf(hit.trackId))
        begin(e, {
          kind: "rightErase",
          trackId: hit.trackId,
          index: hit.index,
          moved: false,
          key: `re-${performance.now()}`,
          x: e.clientX,
          y: e.clientY,
        });
      return;
    }
    if (e.button !== 0) return;
    const hit = padAt(e.clientX, e.clientY);
    if (!hit) {
      const target = e.target as HTMLElement;
      if (
        tool === "select" &&
        target.closest("[data-steps-zone]") &&
        !target.closest("button, canvas, svg, input, [data-lane-i]")
      ) {
        begin(e, {
          kind: "marquee",
          x: e.clientX,
          y: e.clientY,
          moved: false,
          additive: e.shiftKey,
        });
        if (!e.shiftKey) setUi({ selectedSteps: {} });
      }
      return;
    }
    const { trackId, index } = hit;
    if (index >= lengthOf(trackId)) return;
    if (applyHeld({ trackId, stepIndex: index })) return;
    if (selectedTrackId !== trackId) setUi({ selectedTrackId: trackId });

    if (e.altKey) {
      toggleSelected(trackId, index, false);
      return;
    }
    if (tool === "select") {
      begin(e, {
        kind: "marquee",
        x: e.clientX,
        y: e.clientY,
        moved: false,
        additive: e.shiftKey,
        start: { trackId, index },
      });
      return;
    }
    const step = stepOf(trackId, index)!;
    const key = `g-${performance.now()}`;
    if (e.shiftKey && tool === "draw") {
      if (!step.on) setStep(trackId, index, true, key);
      begin(e, { kind: "velocity", trackId, index, y: e.clientY, v: stepVelocity(step), key });
      return;
    }
    const on = tool === "erase" ? false : !step.on;
    setStep(trackId, index, on, key);
    begin(e, { kind: "paint", on, key });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "paint") {
      const hit = padAt(e.clientX, e.clientY);
      if (hit && hit.index < lengthOf(hit.trackId)) setStep(hit.trackId, hit.index, g.on, g.key);
    } else if (g.kind === "rightErase") {
      const hit = padAt(e.clientX, e.clientY);
      if (!hit || (hit.trackId === g.trackId && hit.index === g.index && !g.moved)) return;
      if (!g.moved) setStep(g.trackId, g.index, false, g.key);
      g.moved = true;
      if (hit.index < lengthOf(hit.trackId)) setStep(hit.trackId, hit.index, false, g.key);
    } else if (g.kind === "velocity") {
      const v = Math.min(1, Math.max(0.02, g.v + (g.y - e.clientY) / 90));
      editSteps([stepKey(g.trackId, g.index)], (s) => setStepVelocity(s, v), g.key);
    } else {
      const w = e.clientX - g.x;
      const h = e.clientY - g.y;
      if (!g.moved && Math.hypot(w, h) < 4) return;
      g.moved = true;
      const rect = {
        x: Math.min(g.x, e.clientX),
        y: Math.min(g.y, e.clientY),
        w: Math.abs(w),
        h: Math.abs(h),
      };
      setMarquee(rect);
      const sel: Record<string, true> = g.additive ? { ...useStore.getState().selectedSteps } : {};
      document.querySelectorAll<HTMLElement>("[data-pad]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (
          r.right < rect.x ||
          r.left > rect.x + rect.w ||
          r.bottom < rect.y ||
          r.top > rect.y + rect.h
        )
          return;
        const i = Number(el.dataset.i);
        if (i < lengthOf(el.dataset.track!)) sel[stepKey(el.dataset.track!, i)] = true;
      });
      setUi({ selectedSteps: sel, bank: "step" });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g?.kind === "rightErase" && !g.moved) {
      gesture.current = null;
      contextMenu(
        { clientX: e.clientX, clientY: e.clientY, preventDefault: () => {} },
        stepMenu(g.trackId, g.index),
      );
      return;
    }
    if (g?.kind === "marquee" && !g.moved && g.start)
      toggleSelected(g.start.trackId, g.start.index, g.additive);
    gesture.current = null;
    setMarquee(null);
  };

  // ---------- add tracks ----------

  const add = (
    mode: TrackMode,
    category: SoundCategory,
    name: string,
    source: string,
    sampleId?: string,
  ) => {
    const sound = sampleId ? ({ source: "sample", sampleId } as const) : undefined;
    const track = makeTrack(mode, category, name, source, [], sound);
    commit((p) => addTrack(p, track));
    setUi({ selectedTrackId: track.id });
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(false);
    const kit = e.dataTransfer.getData(KIT_MIME);
    if (kit) {
      const sounds = JSON.parse(kit) as { id: string; category: SoundCategory }[];
      addSampleTracks(
        sounds.map((s) => s.id),
        undefined,
        sounds.map((s) => s.category),
      );
      return;
    }
    const instrument = droppedInstrument(e.dataTransfer);
    if (instrument) return void addInstrumentTrack(instrument);
    const { ids, categories } = await droppedSamples(e.dataTransfer);
    if (ids.length) addSampleTracks(ids, undefined, categories);
  };

  const selected = project.tracks.find((t) => t.id === selectedTrackId);
  const selectedLane = selected ? pattern.lanes[selected.id] : undefined;

  const vars = {
    "--pad-w": `${geo.padW}px`,
    "--pad-h": `${geo.padH}px`,
    "--pad-r": `${geo.radius}px`,
    "--note-size": geo.sizeClass === "large" ? "11px" : geo.padW < 24 ? "7.5px" : "9px",
  } as CSSProperties;

  return (
    <div
      className="scroll-thin relative min-h-0 flex-1 overflow-auto"
      style={vars}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => (e.target as HTMLElement).closest("[data-pad]") && e.preventDefault()}
      onWheel={(e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        const z = useStore.getState().zoom;
        setUi({ zoom: Math.min(2.5, Math.max(0.6, z * (e.deltaY < 0 ? 1.1 : 0.9))) });
      }}
    >
      <div data-steps-zone className="flex min-w-max flex-col gap-px px-3 pb-2 pt-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={project.tracks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {project.tracks.map((track, i) => {
              const lane = pattern.lanes[track.id];
              if (!lane) return null;
              const isSel = track.id === selectedTrackId;
              return (
                <div key={track.id}>
                  <TrackRow
                    track={track}
                    index={i}
                    lane={lane}
                    pattern={pattern}
                    geo={geo}
                    selectedSteps={selectedByTrack.get(track.id) ?? EMPTY}
                    isSelected={isSel}
                  />
                  {isSel &&
                    selectedLane &&
                    selected?.mode !== "clip" &&
                    (["velocity", "probability", "nudge"] as const)
                      .filter((f) => lanesVisible[f])
                      .map((f) => (
                        <ParamLane
                          key={f}
                          track={track}
                          lane={selectedLane}
                          length={lengthOf(track.id)}
                          geo={geo}
                          field={f}
                        />
                      ))}
                </div>
              );
            })}
          </SortableContext>
        </DndContext>

        {/* drop zone */}
        <div
          className="mt-1.5 flex items-center justify-center gap-2 rounded-md border border-dashed py-2.5 text-[11px] text-dim transition-colors"
          style={{
            width: `max(100%, ${geo.headerW + geo.stepsW + geo.scopeW}px)`,
            borderColor: dropHover ? "var(--accent)" : "var(--border-strong)",
            background: dropHover
              ? "color-mix(in oklab, var(--accent) 10%, transparent)"
              : undefined,
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDropHover(true);
          }}
          onDragLeave={() => setDropHover(false)}
          onDrop={onDrop}
        >
          <span className="hidden @[600px]:inline">Drop samples here to add tracks ·</span>
          <button
            className="tool-btn border border-line"
            data-hint="dm.track.add-drum"
            onClick={() => add("hits", "perc", "Perc", "808 Cowbell", "kit:808:cowbell")}
          >
            + Drum
          </button>
          <button
            className="tool-btn border border-line"
            data-hint="dm.track.add-instrument"
            onClick={() => add("notes", "keys", "Keys", "Poly · Init")}
          >
            + Instrument
          </button>
          <button
            className="tool-btn border border-line"
            data-hint="dm.track.add-audio"
            onClick={() => add("clip", "vocal", "Audio", "No clip")}
          >
            + Audio
          </button>
        </div>
      </div>

      {marquee && (
        <div
          className="pointer-events-none fixed z-40 rounded-sm border border-accent"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            background: "color-mix(in oklab, var(--accent) 12%, transparent)",
          }}
        />
      )}
    </div>
  );
}

const EMPTY = new Set<number>();
