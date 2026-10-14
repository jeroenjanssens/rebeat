/**
 * A lane of points in song time (D186, D193), drawn as its curve: automation (eased between
 * points, D196) or tempo (jumps, or eased ramps from the change before, D198). Click on the line
 * to add a point on the curve, elsewhere to add one at that height (D203); drag to move (Shift:
 * free), double-click or Delete to remove, right-click for a point's menu. A stepped lane (D229)
 * draws its values as bands with their names, an on/off lane as bars, and every point lands on a
 * band.
 *
 * The selection spans lanes (D235): Shift+click adds a point, a rectangle drawn from empty space
 * selects in every lane it covers (Shift adds, Alt takes out, D236), and dragging a selected point
 * moves them all (Alt: one direction only, D237). The selection is the table's too (D200).
 */
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  countText,
  onlyIn,
  pointSelection,
  selectedIn,
  setPointSelection,
  toggled,
  useBox,
  withAdded,
  withRemoved,
  NO_POINTS,
} from "../../state/pointSelection";
import {
  clampGroupDq,
  deleteSelection,
  movePoints,
  selectionStarts,
  type PointStart,
} from "../../state/timelineActions";
import { useStore } from "../../state/store";

export interface LanePoint {
  /** Index in the saved list (the key for edits). */
  index: number;
  q: number;
  value: number;
  /** Off: skipped by the curve, drawn hollow (D196). */
  on: boolean;
  /** Eases other than Linear: a ring around the handle. */
  eased: boolean;
}

interface Props {
  /** The lane's id, or "tempo": the key of the shared selection. */
  laneKey: string;
  points: LanePoint[];
  /** The curve's value at song position q (null: nothing to draw). */
  curve: (q: number) => number | null;
  /** Pixels per quarter note, and the lane's width in pixels. */
  ppq: number;
  width: number;
  height: number;
  min: number;
  max: number;
  dimmed?: boolean;
  color: string;
  format: (v: number) => string;
  snap: (q: number, free: boolean) => number;
  /** A value from the lane's range, snapped (whole BPM for tempo). */
  round?: (v: number, free: boolean) => number;
  /** Add a point; `onCurve`: at the curve's value there (a click on the line). */
  onAdd: (q: number, value: number, onCurve: boolean) => number;
  onDelete: (indexes: number[]) => void;
  onMenu: (index: number, e: ReactMouseEvent) => void;
  testId?: string;
  hint?: string;
  /** A stepped lane (D229): its values' names, lowest first (2 or more). */
  steps?: string[];
  /** Folded (D233): the curve drawn small, no handles, nothing to click. */
  compact?: boolean;
}

/** Each drag is one undo step: its own merge key. */
let drags = 0;

/** How close (px) a click must be to the line to land on it (D203). */
const NEAR = 6;

/**
 * Every lane's range and steps, as last drawn: a group drag moves each point by the same share
 * of its own lane's range (D237).
 */
const ranges = new Map<string, { min: number; max: number; steps: number }>();

/** The points (lane, index) whose handles are inside a rectangle on the screen. */
function pointsIn(root: Element, r: { x0: number; y0: number; x1: number; y1: number }) {
  const [x0, x1] = [Math.min(r.x0, r.x1), Math.max(r.x0, r.x1)];
  const [y0, y1] = [Math.min(r.y0, r.y1), Math.max(r.y0, r.y1)];
  const out: Record<string, number[]> = {};
  for (const el of root.querySelectorAll<SVGElement>("[data-point-key]")) {
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
    const key = el.dataset.pointKey!;
    (out[key] ??= []).push(Number(el.dataset.index));
  }
  return out;
}

/** The timeline around a lane (where the rectangle looks for points), and its scroller. */
const timelineOf = (el: Element) => el.closest('[data-testid="timeline"]') ?? document.body;
const scrollerOf = (el: Element) => el.closest<HTMLElement>("[data-timeline-scroll]");

export function CurveLane(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const selection = useStore((s) => s.pointSelection);
  const selected = selectedIn(selection, p.laneKey);
  const boxInside = useBox((b) => b.inside[p.laneKey]);
  const boxMode = useBox((b) => b.mode);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  const pad = p.compact ? 2 : 4;
  const h = p.height - pad * 2;
  const y = (v: number) =>
    pad + h - ((Math.min(p.max, Math.max(p.min, v)) - p.min) / (p.max - p.min)) * h;
  const vAt = (py: number) => p.min + ((pad + h - py) / h) * (p.max - p.min);
  const x = (q: number) => q * p.ppq;
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };
  const n = p.steps && p.steps.length >= 2 ? p.steps.length : 0;
  ranges.set(p.laneKey, { min: p.min, max: p.max, steps: n });
  const round = (v: number, free: boolean) => {
    const r = Math.min(p.max, Math.max(p.min, p.round ? p.round(v, free) : v));
    // a stepped lane: always on a band, Shift or not
    return n
      ? p.min + (Math.round(((r - p.min) / (p.max - p.min)) * (n - 1)) / (n - 1)) * (p.max - p.min)
      : r;
  };
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  // the curve, sampled every few pixels and just before and at every point (so jumps are sharp)
  const path: [number, number][] = [];
  if (p.points.some((pt) => pt.on) || p.curve(0) !== null) {
    const qs = new Set<number>();
    for (let px = 0; px <= p.width; px += 3) qs.add(px / p.ppq);
    for (const pt of p.points)
      if (pt.on) {
        qs.add(Math.max(0, pt.q - 1e-6));
        qs.add(pt.q);
      }
    for (const q of [...qs].sort((a, b) => a - b)) {
      const v = p.curve(q);
      if (v !== null) path.push([x(q), y(v)]);
    }
  }

  /** Each lane's move for a share of a lane's range (a stepped lane: whole bands). */
  const valueMoves = (starts: PointStart[], share: number) => {
    const dv: Record<string, number> = {};
    for (const s of starts) {
      if (s.key in dv) continue;
      const r = ranges.get(s.key) ?? { min: 0, max: 1, steps: 0 };
      const span = r.max - r.min;
      dv[s.key] = r.steps
        ? (Math.round(share * (r.steps - 1)) / (r.steps - 1)) * span
        : share * span;
    }
    return dv;
  };

  const startDrag = (e: React.PointerEvent, pt: LanePoint) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    svg.current?.focus();
    const key = `lane-drag-${pt.index}-${++drags}`;
    if (e.shiftKey) {
      // Shift+click adds to the selection (in any lane)
      setPointSelection(toggled(pointSelection(), p.laneKey, pt.index));
      return;
    }
    let sel = pointSelection();
    if (!selected.includes(pt.index)) {
      sel = onlyIn(p.laneKey, [pt.index]);
      setPointSelection(sel);
    } else setPointSelection({ ...sel, last: p.laneKey });
    // the group, from where it is now
    const starts = selectionStarts(sel);
    const grabbed = starts.find((s) => s.key === p.laneKey && s.index === pt.index);
    if (!grabbed) return;
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const from = { x: e.clientX, y: e.clientY };
    let axis: "time" | "value" | null = null;
    const count = countText(sel);
    const move = (ev: PointerEvent) => {
      const { px, py } = local(ev);
      // Alt: only one direction, whichever moved first (D237)
      if (ev.altKey && !axis) {
        const dx = Math.abs(ev.clientX - from.x);
        const dy = Math.abs(ev.clientY - from.y);
        if (dx + dy > 4) axis = dx >= dy ? "time" : "value";
      }
      if (!ev.altKey) axis = null;
      const q = p.snap(Math.max(0, px / p.ppq), ev.shiftKey);
      const dq = axis === "value" ? 0 : clampGroupDq(starts, q - grabbed.q);
      const v = axis === "time" ? grabbed.value : round(vAt(py), ev.shiftKey);
      const share = (v - grabbed.value) / (p.max - p.min);
      movePoints(starts, dq, valueMoves(starts, share), key);
      const beats = dq / (4 / useStore.getState().project.timeSignature[1]);
      const moved =
        count &&
        `${count}: ${beats >= 0 ? "+" : ""}${Math.round(beats * 100) / 100} beats, ${share >= 0 ? "+" : ""}${Math.round(share * 100)}%`;
      setReadout({
        x: x(grabbed.q + dq),
        y: y(v),
        text: moved ? `${p.format(v)} (${moved})` : p.format(v),
      });
    };
    const up = () => {
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", up);
      setReadout(null);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    svg.current?.focus();
    const start = local(e);
    let moved = false;
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const root = timelineOf(el);
    const scroller = scrollerOf(el);
    // the rectangle's start, where it is in the scrolled content
    const origin = {
      x: e.clientX + (scroller?.scrollLeft ?? 0),
      y: e.clientY + (scroller?.scrollTop ?? 0),
    };
    const mode = e.shiftKey ? "add" : e.altKey ? "remove" : "replace";
    const rectAt = (ev: PointerEvent) => ({
      x0: origin.x - (scroller?.scrollLeft ?? 0),
      y0: origin.y - (scroller?.scrollTop ?? 0),
      x1: ev.clientX,
      y1: ev.clientY,
    });
    const move = (ev: PointerEvent) => {
      const at = local(ev);
      if (!moved && Math.abs(at.px - start.px) + Math.abs(at.py - start.py) < 5) return;
      moved = true;
      // at an edge, the timeline scrolls along
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (ev.clientX > r.right - 24) scroller.scrollLeft += 16;
        else if (ev.clientX < r.left + 152) scroller.scrollLeft -= 16;
        if (ev.clientY > r.bottom - 16) scroller.scrollTop += 12;
        else if (ev.clientY < r.top + 16) scroller.scrollTop -= 12;
      }
      const rect = rectAt(ev);
      useBox.setState({ rect, inside: pointsIn(root, rect), mode });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", up as EventListener);
      if (moved) {
        const inside = pointsIn(root, rectAt(ev));
        const now = pointSelection();
        setPointSelection(
          mode === "add"
            ? withAdded(now, inside)
            : mode === "remove"
              ? withRemoved(now, inside)
              : withAdded(NO_POINTS, inside),
        );
        useBox.setState({ rect: null, inside: {} });
        return;
      }
      // a click: on the line, a point on the curve; elsewhere, at the clicked height (D203)
      const q = p.snap(Math.max(0, start.px / p.ppq), ev.shiftKey);
      const there = p.curve(start.px / p.ppq);
      const onLine = there !== null && Math.abs(y(there) - start.py) <= NEAR;
      const index = p.onAdd(q, onLine ? there! : round(vAt(start.py), ev.shiftKey), onLine);
      setPointSelection(index >= 0 ? onlyIn(p.laneKey, [index]) : NO_POINTS);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up as EventListener);
  };

  /** The next grid line from q in a direction (the snap grid; fine: a 64th). */
  const gridStep = (q: number, dir: 1 | -1, fine: boolean) => {
    if (fine) return dir / 16;
    for (let d = 1 / 32; d <= 64; d *= 2) {
      const s = p.snap(Math.max(0, q + dir * d), false);
      if (dir * (s - q) > 1e-6) return s - q;
    }
    return dir / 4;
  };

  const onKey = (e: React.KeyboardEvent) => {
    const sel = pointSelection();
    const mod = e.metaKey || e.ctrlKey;
    const done = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (mod && e.key.toLowerCase() === "a") {
      done();
      // this lane's points, or (Shift) every visible lane's
      if (e.shiftKey)
        setPointSelection(
          withAdded(
            NO_POINTS,
            pointsIn(timelineOf(svg.current!), { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }),
          ),
        );
      else
        setPointSelection(
          onlyIn(
            p.laneKey,
            p.points.map((pt) => pt.index),
          ),
        );
      return;
    }
    if (e.key === "Escape" && Object.keys(sel.lanes).length) {
      done();
      setPointSelection(NO_POINTS);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && Object.keys(sel.lanes).length) {
      done();
      deleteSelection(sel);
      setPointSelection(NO_POINTS);
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const a = arrows[e.key];
    if (!a || !Object.keys(sel.lanes).length) return;
    done();
    const starts = selectionStarts(sel);
    if (!starts.length) return;
    const first = starts.reduce((m, s) => (s.q < m.q ? s : m));
    const dq = a[0] ? clampGroupDq(starts, gridStep(first.q, a[0] as 1 | -1, e.shiftKey)) : 0;
    // ↑ ↓: 1% of each lane (Shift: 10%), a band on a stepped lane
    const dv: Record<string, number> = {};
    if (a[1])
      for (const s of starts) {
        const r = ranges.get(s.key) ?? { min: 0, max: 1, steps: 0 };
        const span = r.max - r.min;
        dv[s.key] = a[1] * (r.steps ? span / (r.steps - 1) : span * (e.shiftKey ? 0.1 : 0.01));
      }
    movePoints(starts, dq, dv, `nudge-${++drags}`);
  };

  // a stepped lane: its values' heights, the names shown (at most about six), and for an on/off
  // lane the stretches where it's on, as bars
  const levels = n
    ? Array.from({ length: n }, (_, i) => p.min + (i / (n - 1)) * (p.max - p.min))
    : [];
  const every = Math.max(1, Math.ceil(n / 6));
  const bars: [number, number][] = [];
  if (n === 2 && path.length > 1) {
    const mid = y((p.min + p.max) / 2);
    let from: number | null = null;
    for (const [px, py] of path) {
      if (py < mid && from === null) from = px;
      else if (py >= mid && from !== null) {
        bars.push([from, px]);
        from = null;
      }
    }
    if (from !== null) bars.push([from, path[path.length - 1][0]]);
  }
  // while a rectangle is drawn, the points it would select
  const lit = (index: number) => {
    const inBox = !!boxInside?.includes(index);
    const sel = selected.includes(index);
    if (!boxInside) return sel;
    return boxMode === "remove" ? sel && !inBox : boxMode === "add" ? sel || inBox : inBox;
  };

  return (
    <svg
      ref={svg}
      width={p.width}
      height={p.height}
      className="block cursor-crosshair outline-none"
      style={{ opacity: p.dimmed ? 0.45 : 1 }}
      tabIndex={0}
      data-testid={p.testId}
      data-hint={p.hint}
      data-lane={p.laneKey}
      data-steps={n || undefined}
      data-compact={p.compact || undefined}
      pointerEvents={p.compact ? "none" : undefined}
      onPointerMove={(e) => {
        if (!n || e.buttons) return;
        const { px, py } = local(e);
        const v = round(vAt(py), false);
        const i = Math.round(((v - p.min) / (p.max - p.min)) * (n - 1));
        setHover({ x: px, y: y(v), text: p.steps![i] });
      }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={onBackgroundDown}
      onKeyDown={onKey}
    >
      {!p.compact &&
        levels.map((v, i) => (
          <g key={`lvl${i}`} pointerEvents="none">
            <line
              x1={0}
              x2={p.width}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            {i % every === 0 && (
              <text
                x={3}
                y={Math.min(p.height - 2, Math.max(8, y(v) + 3))}
                fontSize={8}
                fill="var(--text-faint)"
                data-testid="step-label"
              >
                {p.steps![i]}
              </text>
            )}
          </g>
        ))}
      {bars.map(([a, b], i) => (
        <rect
          key={`bar${i}`}
          x={a}
          y={y(p.max)}
          width={Math.max(1, b - a)}
          height={Math.max(2, y(p.min) - y(p.max))}
          fill={`color-mix(in oklab, ${p.color} 22%, transparent)`}
          pointerEvents="none"
          data-testid="on-bar"
        />
      ))}
      {path.length > 1 && (
        <polyline
          points={path.map(([a, b]) => `${a},${b}`).join(" ")}
          fill="none"
          stroke={p.color}
          strokeWidth={1.5}
          strokeDasharray={p.dimmed ? "4 3" : undefined}
          data-testid="lane-path"
        />
      )}
      {p.compact &&
        // a folded lane: small marks, so a rectangle still finds its points (selected ones lit)
        p.points.map((pt) => (
          <circle
            key={pt.index}
            cx={x(pt.q)}
            cy={y(pt.value)}
            r={lit(pt.index) ? 2.5 : 1.5}
            fill={lit(pt.index) ? "var(--select)" : p.color}
            data-point-key={p.laneKey}
            data-index={pt.index}
            data-selected={selected.includes(pt.index)}
            data-testid="lane-mark"
          />
        ))}
      {!p.compact &&
        p.points.map((pt) => {
          const sel = lit(pt.index);
          return (
            <g key={pt.index} opacity={pt.on ? 1 : 0.45}>
              {pt.eased && pt.on && !n && (
                <circle
                  cx={x(pt.q)}
                  cy={y(pt.value)}
                  r={7}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={1}
                  opacity={0.5}
                  pointerEvents="none"
                />
              )}
              <circle
                cx={x(pt.q)}
                cy={y(pt.value)}
                r={sel ? 5 : 4}
                fill={!pt.on ? "transparent" : sel ? "var(--select)" : "var(--panel)"}
                stroke={sel ? "var(--select)" : p.color}
                strokeWidth={1.5}
                strokeDasharray={pt.on ? undefined : "2 2"}
                className="cursor-grab"
                data-testid="lane-point"
                data-point-key={p.laneKey}
                data-index={pt.index}
                data-on={pt.on}
                data-selected={selected.includes(pt.index)}
                onPointerDown={(e) => startDrag(e, pt)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.onDelete([pt.index]);
                  setPointSelection(NO_POINTS);
                }}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  if (!selected.includes(pt.index))
                    setPointSelection(onlyIn(p.laneKey, [pt.index]));
                  p.onMenu(pt.index, e);
                }}
              >
                <title>{`${p.format(pt.value)}${pt.on ? "" : " (off)"}`}</title>
              </circle>
            </g>
          );
        })}
      {hover && !readout && (
        <text
          x={Math.min(p.width - 60, hover.x + 10)}
          y={Math.max(11, hover.y - 4)}
          fontSize={10}
          fill="var(--text-dim)"
          pointerEvents="none"
        >
          {hover.text}
        </text>
      )}
      {readout && (
        <text
          x={Math.min(p.width - 220, readout.x + 8)}
          y={Math.max(11, readout.y - 6)}
          fontSize={10}
          fill="var(--text)"
          className="num"
          data-testid="lane-readout"
        >
          {readout.text}
        </text>
      )}
    </svg>
  );
}

/**
 * The rectangle over the lanes while it's drawn (D236), and how many points it holds; the
 * Timeline renders it once, above every lane.
 */
export function SelectionBox() {
  const rect = useBox((b) => b.rect);
  const inside = useBox((b) => b.inside);
  if (!rect) return null;
  const count = Object.values(inside).reduce((n, l) => n + l.length, 0);
  const lanes = Object.values(inside).filter((l) => l.length).length;
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div
        className="absolute border border-accent"
        data-testid="selection-box"
        style={{
          left: Math.min(rect.x0, rect.x1),
          top: Math.min(rect.y0, rect.y1),
          width: Math.abs(rect.x1 - rect.x0),
          height: Math.abs(rect.y1 - rect.y0),
          background: "color-mix(in oklab, var(--accent) 12%, transparent)",
        }}
      />
      {count > 0 && (
        <div
          className="absolute rounded bg-panel px-1.5 py-0.5 text-[10px] text-ink shadow"
          style={{ left: rect.x1 + 12, top: rect.y1 + 12 }}
        >
          {lanes > 1 ? `${count} points in ${lanes} lanes` : `${count} points`}
        </div>
      )}
    </div>
  );
}
