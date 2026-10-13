/**
 * The Sections row (D184): one block per section, as long as it plays. The song strip's
 * gestures: click to edit (queue while playing), drag to move, Alt+drag to copy, Alt+Shift+drag
 * to clone, the right edge for repeats (Alt: how many steps it plays), Shift+click a range.
 */
import { Link2 } from "lucide-react";
import { useRef, useState } from "react";
import { contextMenu } from "../../components/Menu";
import { layout, type Block } from "../../model/arrangement";
import { linkCount, type Project } from "../../model/project";
import { clipOf } from "../../model/types";
import { alpha, token } from "../../render/theme";
import { applyHeld } from "../../state/actions";
import { useStore } from "../../state/store";
import { moveSections, setRepeats, setSectionSteps } from "../../state/timelineActions";
import { SectionBadges } from "../drum-machine/SongStrip";
import { sectionMenu } from "../drum-machine/sectionMenu";
import { SECTIONS_H } from "./geometry";
import { ViewCanvas, type View } from "./ViewCanvas";

const LABEL_H = 17;

/** Every block's pattern in miniature, once per repeat, in one canvas for the visible part. */
function drawBlocks(
  ctx: CanvasRenderingContext2D,
  project: Project,
  ppq: number,
  from: number,
  to: number,
) {
  const top = LABEL_H + 2;
  const h = SECTIONS_H - top - 4;
  const tracks = project.tracks;
  for (const b of layout(project)) {
    const x0 = b.start * ppq;
    if (x0 > to || (b.start + b.span) * ppq < from) continue;
    const rw = b.length * ppq;
    for (let r = 0; r < b.repeats; r++) {
      const rx = x0 + r * rw;
      if (rx > to || rx + rw < from) continue;
      if (r > 0) {
        ctx.fillStyle = alpha(token("text-dim") || "#888888", 0.35);
        ctx.fillRect(rx, top, 1, h);
      }
      const rows = Math.max(1, tracks.length);
      const rh = h / rows;
      const cw = rw / b.steps;
      tracks.forEach((t, i) => {
        const lane = b.pattern.lanes[t.id];
        if (!lane) return;
        const y = top + i * rh;
        ctx.globalAlpha = b.section.mutes?.includes(t.id) ? 0.2 : 1;
        if (t.mode === "clip") {
          ctx.fillStyle = alpha(t.color, clipOf(lane).active ? 0.7 : 0.1);
          ctx.fillRect(rx + 2, y + rh * 0.2, rw - 4, Math.max(1, rh * 0.6));
        } else if (cw >= 1) {
          const len = lane.stepCountOverride ?? b.pattern.stepCount;
          for (let s = 0; s < b.steps; s++) {
            const st = lane.steps[s % len];
            if (!st.on) continue;
            ctx.fillStyle = alpha(t.color, 0.45 + st.velocity * 0.55);
            ctx.fillRect(
              rx + s * cw + 0.25,
              y + 0.25,
              Math.max(0.6, cw - 0.75),
              Math.max(0.6, rh - 0.75),
            );
          }
        }
        ctx.globalAlpha = 1;
      });
    }
  }
}

interface Drag {
  ids: string[];
  /** The pointer's x in the row. */
  x: number;
  /** The section index the drop goes before. */
  to: number;
}

export function SectionsRow({
  project,
  ppq,
  width,
  view,
  selected,
  setSelected,
}: {
  project: Project;
  ppq: number;
  width: number;
  view: View;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const { editSlotId, playSlotId, queuedSlotId, playing, setUi } = useStore();
  const playMode = useStore((s) => s.project.playMode);
  const row = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const anchor = useRef<string | null>(null);
  const blocks = layout(project);

  const rowX = (clientX: number) => clientX - row.current!.getBoundingClientRect().left;
  /** Where a drop at x goes: before the first block (other than the dragged) whose middle is
   * after x. */
  const dropIndex = (x: number, ids: string[]) => {
    for (const b of blocks) {
      if (ids.includes(b.section.id)) continue;
      if (x < (b.start + b.span / 2) * ppq) return b.index;
    }
    return project.slots.length;
  };

  const click = (b: Block, e: React.PointerEvent | PointerEvent) => {
    const id = b.section.id;
    if (e.shiftKey && anchor.current) {
      const a = project.slots.findIndex((s) => s.id === anchor.current);
      const [lo, hi] = [Math.min(a, b.index), Math.max(a, b.index)];
      setSelected(project.slots.slice(lo, hi + 1).map((s) => s.id));
      return;
    }
    anchor.current = id;
    setSelected([id]);
    if (applyHeld({ slotId: id })) return;
    setUi({ editSlotId: id, selectedSteps: {}, startAt: null });
    if (playing && id !== playSlotId) setUi({ queuedSlotId: id });
    else if (!playing) setUi({ playSlotId: id });
  };

  const onBlockDown = (b: Block, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const start = e.clientX;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const ids = selected.includes(b.section.id) ? selected : [b.section.id];
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientX - start) < 5) return;
      dragging = true;
      const x = rowX(ev.clientX);
      setDrag({ ids, x, to: dropIndex(x, ids) });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setDrag(null);
      if (!dragging) return click(b, ev);
      const to = dropIndex(rowX(ev.clientX), ids);
      const mode = ev.altKey ? (ev.shiftKey ? "clone" : "copy") : "move";
      const made = moveSections(ids, to, mode);
      if (made.length) setSelected(made);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  /** The right edge: repeats; with Alt, the steps it plays (snapped to beats). */
  const onEdgeDown = (b: Block, e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const steps = e.altKey;
    const perBeat = Math.max(1, Math.round(1 / b.stepQ));
    const move = (ev: PointerEvent) => {
      const dx = rowX(ev.clientX) - b.start * ppq;
      if (steps) {
        const n = Math.round(dx / b.repeats / (b.stepQ * ppq) / perBeat) * perBeat;
        setSectionSteps(b.section.id, Math.max(perBeat, Math.min(b.pattern.stepCount, n)));
      } else setRepeats(b.section.id, Math.max(1, Math.min(64, Math.round(dx / (b.length * ppq)))));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const dropX =
    drag &&
    (drag.to < blocks.length
      ? blocks[drag.to].start
      : blocks[blocks.length - 1].start + blocks[blocks.length - 1].span) * ppq;

  return (
    <div
      ref={row}
      className="relative"
      style={{ width, height: SECTIONS_H }}
      data-testid="timeline-sections"
    >
      <ViewCanvas
        view={view}
        height={SECTIONS_H}
        deps={[project.slots, project.patterns, project.tracks, ppq]}
        draw={(ctx, from, w) => drawBlocks(ctx, project, ppq, from, from + w)}
      />
      {blocks.map((b) => {
        const left = b.start * ppq;
        const w = Math.max(2, b.span * ppq);
        const linked = linkCount(project, b.section.patternId) > 1;
        const isEdit = b.section.id === editSlotId;
        const isSel = selected.includes(b.section.id);
        const dim = playMode === "loop" && !isEdit;
        const isDragged = drag?.ids.includes(b.section.id);
        return (
          <div
            key={b.section.id}
            className={`absolute top-0 cursor-pointer rounded-[5px] ${b.section.id === queuedSlotId ? "queued" : ""}`}
            style={{
              left,
              width: w,
              height: SECTIONS_H - 2,
              opacity: isDragged ? 0.5 : dim ? 0.45 : 1,
              background: alpha(b.pattern.linkColor, isEdit ? 0.16 : 0.07),
              boxShadow: isEdit
                ? "inset 0 0 0 1.5px var(--select)"
                : isSel
                  ? "inset 0 0 0 1.5px var(--accent)"
                  : linked
                    ? `inset 0 0 0 1.5px ${b.pattern.linkColor}`
                    : "inset 0 0 0 1px var(--border-strong)",
            }}
            data-hint="timeline.section"
            data-testid="timeline-block"
            data-slot={b.section.id}
            onPointerDown={(e) => onBlockDown(b, e)}
            onDoubleClick={() =>
              import("../../app/openers").then((m) => m.focusPanel("drum-machine"))
            }
            onContextMenu={(e) => contextMenu(e, sectionMenu(project, b.section, b.index))}
          >
            <div
              className="flex items-center gap-1 overflow-hidden whitespace-nowrap px-1.5 text-[10px]"
              style={{ height: LABEL_H }}
            >
              <span
                className="num font-semibold"
                style={{ color: linked ? b.pattern.linkColor : "var(--text-dim)" }}
              >
                {b.index + 1}
              </span>
              {w > 46 && (
                <span className="min-w-0 truncate font-semibold uppercase tracking-wider text-ink">
                  {b.pattern.name}
                </span>
              )}
              {b.repeats > 1 && <span className="num text-dim">×{b.repeats}</span>}
              {w > 70 && <SectionBadges project={project} slot={b.section} />}
              {linked && w > 30 && <Link2 size={10} style={{ color: b.pattern.linkColor }} />}
            </div>
            {b.section.steps && (
              <div
                className="absolute right-0 top-0 h-2 w-2"
                style={{ background: "linear-gradient(225deg, var(--lit) 50%, transparent 50%)" }}
                title={`Plays ${b.section.steps} of ${b.pattern.stepCount} steps`}
              />
            )}
            <div
              className="absolute -right-[3px] top-0 h-full w-[7px] cursor-ew-resize"
              data-hint="timeline.section-edge"
              data-testid="timeline-block-edge"
              onPointerDown={(e) => onEdgeDown(b, e)}
            />
          </div>
        );
      })}
      {drag && dropX !== null && (
        <div
          className="pointer-events-none absolute top-0 w-[2px] bg-accent"
          style={{ left: (dropX as number) - 1, height: SECTIONS_H }}
        />
      )}
    </div>
  );
}
