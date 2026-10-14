/**
 * A lane of points in song time (D186, D193), drawn as its curve: automation (eased between
 * points, D196) or tempo (jumps, or eased ramps from the change before, D198). Click on the line
 * to add a point on the curve, elsewhere to add one at that height (D203); drag to move (Shift:
 * free), double-click or Delete to remove, a box drag selects, right-click for a point's menu.
 * The selection is the table's too (D200). A stepped lane (D229) draws its values as bands with
 * their names, an on/off lane as bars, and every point lands on a band.
 */
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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
  onMove: (index: number, q: number, value: number, key: string) => void;
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

export function CurveLane(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const selection = useStore((s) => s.pointSelection);
  const selected = selection.lane === p.laneKey ? selection.indexes : [];
  const setSelected = (indexes: number[]) =>
    useStore.getState().setUi({ pointSelection: { lane: p.laneKey, indexes } });
  const [box, setBox] = useState<{ x0: number; x1: number; y0: number; y1: number } | null>(null);
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

  const startDrag = (e: React.PointerEvent, pt: LanePoint) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const key = `lane-drag-${pt.index}-${++drags}`;
    if (e.shiftKey) {
      // Shift+click adds to the selection
      setSelected(
        selected.includes(pt.index)
          ? selected.filter((i) => i !== pt.index)
          : [...selected, pt.index],
      );
      return;
    }
    if (!selected.includes(pt.index)) setSelected([pt.index]);
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const { px, py } = local(ev);
      const q = p.snap(Math.max(0, px / p.ppq), ev.shiftKey);
      const v = round(vAt(py), ev.shiftKey);
      p.onMove(pt.index, q, v, key);
      setReadout({ x: x(q), y: y(v), text: p.format(v) });
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
    const start = local(e);
    let moved = false;
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const at = local(ev);
      if (!moved && Math.abs(at.px - start.px) + Math.abs(at.py - start.py) < 5) return;
      moved = true;
      setBox({ x0: start.px, y0: start.py, x1: at.px, y1: at.py });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", up as EventListener);
      if (moved) {
        const at = local(ev);
        const [x0, x1] = [Math.min(start.px, at.px), Math.max(start.px, at.px)];
        const [y0, y1] = [Math.min(start.py, at.py), Math.max(start.py, at.py)];
        setSelected(
          p.points
            .filter(
              (pt) => x(pt.q) >= x0 && x(pt.q) <= x1 && y(pt.value) >= y0 && y(pt.value) <= y1,
            )
            .map((pt) => pt.index),
        );
        setBox(null);
        return;
      }
      // a click: on the line, a point on the curve; elsewhere, at the clicked height (D203)
      const q = p.snap(Math.max(0, start.px / p.ppq), ev.shiftKey);
      const there = p.curve(start.px / p.ppq);
      const onLine = there !== null && Math.abs(y(there) - start.py) <= NEAR;
      const index = p.onAdd(q, onLine ? there! : round(vAt(start.py), ev.shiftKey), onLine);
      setSelected(index >= 0 ? [index] : []);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up as EventListener);
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
      onKeyDown={(e) => {
        if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
          e.preventDefault();
          e.stopPropagation();
          p.onDelete(selected);
          setSelected([]);
        }
      }}
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
      {!p.compact &&
        p.points.map((pt) => {
          const sel = selected.includes(pt.index);
          return (
            <g key={pt.index} opacity={pt.on ? 1 : 0.45}>
              {pt.eased && pt.on && (
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
                data-index={pt.index}
                data-on={pt.on}
                data-selected={sel}
                onPointerDown={(e) => startDrag(e, pt)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.onDelete([pt.index]);
                  setSelected([]);
                }}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  if (!sel) setSelected([pt.index]);
                  p.onMenu(pt.index, e);
                }}
              >
                <title>{`${p.format(pt.value)}${pt.on ? "" : " (off)"}`}</title>
              </circle>
            </g>
          );
        })}
      {box && (
        <rect
          x={Math.min(box.x0, box.x1)}
          y={Math.min(box.y0, box.y1)}
          width={Math.abs(box.x1 - box.x0)}
          height={Math.abs(box.y1 - box.y0)}
          fill="color-mix(in oklab, var(--accent) 15%, transparent)"
          stroke="var(--accent)"
          strokeWidth={1}
        />
      )}
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
          x={Math.min(p.width - 60, readout.x + 8)}
          y={Math.max(11, readout.y - 6)}
          fontSize={10}
          fill="var(--text)"
          className="num"
        >
          {readout.text}
        </text>
      )}
    </svg>
  );
}
