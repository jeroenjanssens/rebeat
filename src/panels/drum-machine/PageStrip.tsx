import { useEffect, useRef } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link2, Plus, Repeat } from "lucide-react";
import { InlineEdit } from "../../components/InlineEdit";
import { contextMenu, type MenuItem } from "../../components/Menu";
import { position } from "../../engine/transport";
import {
  cloneSlot,
  copySlot,
  deleteSlot,
  linkCount,
  newSlot,
  unlinkSlot,
  type Project,
} from "../../model/project";
import { LINK_COLORS, TRACK_PALETTE } from "../../model/colors";
import {
  STEP_COUNT_PRESETS,
  STEP_SIZES,
  type PageSlot,
  type Pattern,
  type Track,
} from "../../model/types";
import { onFrame } from "../../render/raf";
import { alpha, token } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import { applyHeld } from "../../state/actions";
import { useStore } from "../../state/store";
import { restrictToHorizontalAxis } from "./dndModifiers";
import type { SizeClass } from "./layout";

function Thumbnail({ pattern, tracks }: { pattern: Pattern; tracks: Track[] }) {
  const { ref } = useCanvas(
    (ctx, { width: w, height: h }) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = token("scope-bg");
      ctx.fillRect(0, 0, w, h);
      const rows = tracks.length;
      const rh = (h - 4) / rows;
      const n = pattern.stepCount;
      const cw = (w - 4) / n;
      tracks.forEach((t, r) => {
        const lane = pattern.lanes[t.id];
        const y = 2 + r * rh;
        if (!lane) return;
        if (lane.kind === "clip") {
          ctx.fillStyle = lane.active ? alpha(t.color, 0.75) : alpha(t.color, 0.12);
          ctx.fillRect(2, y + rh * 0.2, w - 4, Math.max(1, rh * 0.6));
          return;
        }
        const len = lane.stepCountOverride ?? n;
        for (let i = 0; i < n; i++) {
          const s = lane.steps[i % len];
          ctx.fillStyle = s.on ? alpha(t.color, 0.4 + s.velocity * 0.6) : alpha(t.color, 0.1);
          ctx.fillRect(
            2 + i * cw + 0.25,
            y + 0.25,
            Math.max(0.6, cw - 0.75),
            Math.max(0.6, rh - 0.75),
          );
        }
      });
    },
    [pattern, tracks],
  );
  return <canvas ref={ref} className="block h-full w-full rounded-[3px]" />;
}

function pageChips(
  label: string,
  options: { label: string; active: boolean; onClick: () => void; color?: string }[],
): MenuItem {
  return {
    render: (close) => (
      <div className="px-2 py-1.5">
        <div className="label mb-1.5">{label}</div>
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {options.map((o) =>
            o.color ? (
              <button
                key={o.label}
                className="h-4 w-4 rounded-sm"
                style={{
                  background: o.color,
                  outline: o.active ? "2px solid var(--select)" : undefined,
                }}
                onClick={() => {
                  o.onClick();
                  close();
                }}
              />
            ) : (
              <button
                key={o.label}
                className="tool-btn !h-6 border border-line"
                data-active={o.active}
                onClick={() => {
                  o.onClick();
                  close();
                }}
              >
                {o.label}
              </button>
            ),
          )}
        </div>
      </div>
    ),
  };
}

function PageThumb({
  slot,
  index,
  project,
  size,
}: {
  slot: PageSlot;
  index: number;
  project: Project;
  size: SizeClass;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
  });
  const progress = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const { editSlotId, playSlotId, queuedSlotId, playing, setUi, commit } = useStore();
  const pattern = project.patterns[slot.patternId];
  const linked = linkCount(project, slot.patternId) > 1;
  const isEdit = slot.id === editSlotId;
  const isPlay = playing && slot.id === playSlotId;
  const isQueued = slot.id === queuedSlotId;
  const w = size === "large" ? 148 : size === "compact" ? 84 : 126;

  // the strip follows the playing page
  useEffect(() => {
    if (isPlay) thumbRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [isPlay]);

  useEffect(() => {
    if (!isPlay) return;
    return onFrame(() => {
      if (progress.current) progress.current.style.transform = `scaleX(${position().progress})`;
    });
  }, [isPlay]);

  const items = (): MenuItem[] => [
    { label: "New page", onSelect: () => commit((p) => void newSlot(p, slot.id)) },
    {
      label: "Copy page",
      shortcut: "⇧COPY",
      onSelect: () => commit((p) => void copySlot(p, slot.id)),
    },
    {
      label: "Clone page (linked)",
      shortcut: "⇧DUPL",
      onSelect: () => commit((p) => void cloneSlot(p, slot.id)),
    },
    { label: "Unlink", disabled: !linked, onSelect: () => commit((p) => unlinkSlot(p, slot.id)) },
    {
      label: "Delete",
      disabled: project.slots.length < 2,
      onSelect: () => {
        const next = project.slots[index === 0 ? 1 : index - 1].id;
        commit((p) => deleteSlot(p, slot.id));
        setUi({
          ...(isEdit ? { editSlotId: next } : {}),
          ...(slot.id === playSlotId ? { playSlotId: next } : {}),
        });
      },
    },
    { separator: true },
    pageChips(
      "Repeat",
      [1, 2, 3, 4, 6, 8, 12, 16].map((n) => ({
        label: `×${n}`,
        active: slot.repeats === n,
        onClick: () => commit((p) => void (p.slots.find((s) => s.id === slot.id)!.repeats = n)),
      })),
    ),
    pageChips(
      "Steps",
      STEP_COUNT_PRESETS.map((n) => ({
        label: String(n),
        active: pattern.stepCount === n,
        onClick: () => commit((p) => void (p.patterns[pattern.id].stepCount = n)),
      })),
    ),
    pageChips(
      "Step size",
      STEP_SIZES.map((sz) => ({
        label: sz,
        active: pattern.stepSize === sz,
        onClick: () => commit((p) => void (p.patterns[pattern.id].stepSize = sz)),
      })),
    ),
    pageChips(
      "Color",
      [...LINK_COLORS, ...TRACK_PALETTE.filter((_, i) => i % 3 === 0)].map((c) => ({
        label: c,
        color: c,
        active: pattern.linkColor === c,
        onClick: () => commit((p) => void (p.patterns[pattern.id].linkColor = c)),
      })),
    ),
  ];

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        thumbRef.current = el;
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        width: w,
      }}
      className={`page-thumb group relative shrink-0 cursor-pointer rounded-md p-1 ${isQueued ? "queued" : ""}`}
      data-hint="dm.page.thumb"
      {...attributes}
      {...listeners}
      onClick={() => {
        if (applyHeld({ slotId: slot.id })) return;
        setUi({ editSlotId: slot.id, selectedSteps: {} });
        if (playing && slot.id !== playSlotId) setUi({ queuedSlotId: slot.id });
        else if (!playing) setUi({ playSlotId: slot.id });
      }}
      onContextMenu={(e) => contextMenu(e, items())}
    >
      <div
        className="rounded-[5px] p-[3px]"
        style={{
          background: isEdit ? "var(--raised)" : "var(--surface)",
          boxShadow: isEdit
            ? `inset 0 0 0 1.5px var(--select)`
            : linked
              ? `inset 0 0 0 1.5px ${pattern.linkColor}`
              : "inset 0 0 0 1px var(--border)",
        }}
      >
        <div style={{ height: size === "large" ? 56 : size === "compact" ? 30 : 44 }}>
          <Thumbnail pattern={pattern} tracks={project.tracks} />
        </div>
        <div className="mt-1 flex items-center gap-1 px-0.5">
          <span
            className="num text-[10px] font-semibold"
            style={{ color: linked ? pattern.linkColor : "var(--text-dim)" }}
          >
            {index + 1}
          </span>
          {size !== "compact" && (
            <InlineEdit
              value={pattern.name}
              onCommit={(v) => commit((p) => void (p.patterns[pattern.id].name = v))}
              className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wider text-ink"
            />
          )}
          <span className="flex-1" />
          {slot.repeats > 1 && (
            <span
              className="num flex items-center gap-0.5 text-[9px] text-dim"
              title={`Repeats ×${slot.repeats}`}
            >
              <Repeat size={9} />
              {slot.repeats}
            </span>
          )}
          {linked && (
            <Link2 size={11} style={{ color: pattern.linkColor }} aria-label="Linked (clone)" />
          )}
        </div>
      </div>
      <div className="absolute inset-x-1.5 bottom-0 h-[2px] overflow-hidden rounded-full">
        {isPlay && (
          <div
            ref={progress}
            className="h-full origin-left bg-lit"
            style={{ transform: "scaleX(0)" }}
          />
        )}
      </div>
    </div>
  );
}

export function PageStrip({ sizeClass }: { sizeClass: SizeClass }) {
  const project = useStore((s) => s.project);
  const { playMode, songLoop, editSlotId, setUi, commit } = useStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const mods = useRef({ alt: false, shift: false });

  // Alt+drag = copy, Alt+Shift+drag = clone: read the modifiers at the moment of the drop
  useEffect(() => {
    const track = (e: PointerEvent | KeyboardEvent) =>
      (mods.current = { alt: e.altKey, shift: e.shiftKey });
    window.addEventListener("pointermove", track, true);
    window.addEventListener("keydown", track, true);
    window.addEventListener("keyup", track, true);
    return () => {
      window.removeEventListener("pointermove", track, true);
      window.removeEventListener("keydown", track, true);
      window.removeEventListener("keyup", track, true);
    };
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const { alt, shift } = mods.current;
    if (!alt && e.active.id === e.over.id) return;
    let newId = "";
    commit((p) => {
      let id = String(e.active.id);
      if (alt) id = newId = (shift ? cloneSlot : copySlot)(p, id);
      const from = p.slots.findIndex((s) => s.id === id);
      const to = p.slots.findIndex((s) => s.id === e.over!.id);
      p.slots = arrayMove(p.slots, from, to);
    });
    if (newId) setUi({ editSlotId: newId, selectedSteps: {} });
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
      <div className="scroll-thin flex min-w-0 flex-1 items-center overflow-x-auto pb-0.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          modifiers={[restrictToHorizontalAxis]}
        >
          <SortableContext
            items={project.slots.map((s) => s.id)}
            strategy={horizontalListSortingStrategy}
          >
            {project.slots.map((slot, i) => (
              <PageThumb key={slot.id} slot={slot} index={i} project={project} size={sizeClass} />
            ))}
          </SortableContext>
        </DndContext>
        <button
          className="tool-btn ml-1 shrink-0 self-stretch border border-dashed border-line-strong"
          title="New page"
          data-hint="dm.page.add"
          onClick={() => {
            let id = "";
            commit((p) => void (id = newSlot(p, editSlotId)));
            setUi({ editSlotId: id, selectedSteps: {} });
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      {playMode === "song" && (
        <button
          className="tool-btn shrink-0"
          data-active={songLoop}
          title={
            songLoop
              ? "Song loops (click to stop at the end)"
              : "Song stops at the end (click to loop)"
          }
          data-hint="dm.page.song-loop"
          onClick={() => setUi({ songLoop: !songLoop })}
        >
          <Repeat size={13} />
        </button>
      )}
      <div className="segmented shrink-0" title="Playback mode" data-hint="dm.page.mode">
        <button data-active={playMode === "loop"} onClick={() => setUi({ playMode: "loop" })}>
          Loop page
        </button>
        <button data-active={playMode === "song"} onClick={() => setUi({ playMode: "song" })}>
          Song
        </button>
      </div>
    </div>
  );
}
