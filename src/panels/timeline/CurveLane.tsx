/**
 * A lane of points in song time (D186, D193), drawn as a curve: automation (linear or held to
 * the next point) or tempo (jumps, or ramps from the change before). Click to add, drag to move
 * (Shift: free), double-click or Delete to remove, a box drag selects, right-click for a menu.
 */
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

export interface LanePoint {
  /** Index in the saved list (the key for edits). */
  index: number;
  q: number;
  value: number;
  /** Automation: hold until the next point. Tempo: ramp from the change before. */
  flag: boolean;
}

interface Props {
  kind: "automation" | "tempo";
  points: LanePoint[];
  /** Pixels per quarter note, and the lane's width in pixels. */
  ppq: number;
  width: number;
  height: number;
  min: number;
  max: number;
  /** Tempo: the start tempo, before the first change. */
  base?: number;
  dimmed?: boolean;
  color: string;
  format: (v: number) => string;
  snap: (q: number, free: boolean) => number;
  /** A value from the lane's range, snapped (whole BPM for tempo). */
  round?: (v: number, free: boolean) => number;
  onAdd: (q: number, value: number) => number;
  onMove: (index: number, q: number, value: number, key: string) => void;
  onDelete: (indexes: number[]) => void;
  onMenu: (index: number, e: ReactMouseEvent) => void;
  testId?: string;
  hint?: string;
}

/** Each drag is one undo step: its own merge key. */
let drags = 0;

export function CurveLane(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [box, setBox] = useState<{ x0: number; x1: number; y0: number; y1: number } | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  const pad = 4;
  const h = p.height - pad * 2;
  const y = (v: number) =>
    pad + h - ((Math.min(p.max, Math.max(p.min, v)) - p.min) / (p.max - p.min)) * h;
  const vAt = (py: number) => p.min + ((pad + h - py) / h) * (p.max - p.min);
  const x = (q: number) => q * p.ppq;
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };
  const round = (v: number, free: boolean) =>
    Math.min(p.max, Math.max(p.min, p.round ? p.round(v, free) : v));

  // the curve as a polyline
  const pts = [...p.points].sort((a, b) => a.q - b.q);
  const path: [number, number][] = [];
  if (p.kind === "automation") {
    if (pts.length) {
      path.push([0, y(pts[0].value)]);
      pts.forEach((pt, i) => {
        path.push([x(pt.q), y(pt.value)]);
        const next = pts[i + 1];
        if (next && pt.flag) path.push([x(next.q), y(pt.value)]);
      });
      path.push([p.width, y(pts[pts.length - 1].value)]);
    }
  } else {
    let v = p.base ?? 120;
    let at = 0;
    path.push([0, y(v)]);
    for (const pt of pts) {
      if (!pt.flag) path.push([x(pt.q), y(v)]);
      path.push([x(pt.q), y(pt.value)]);
      v = pt.value;
      at = pt.q;
    }
    void at;
    path.push([p.width, y(v)]);
  }

  const startDrag = (e: React.PointerEvent, pt: LanePoint) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const key = `lane-drag-${pt.index}-${++drags}`;
    const ids = selected.includes(pt.index) ? selected : [pt.index];
    setSelected(ids);
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
      // a click: a new point there
      const q = p.snap(Math.max(0, start.px / p.ppq), ev.shiftKey);
      const index = p.onAdd(q, round(vAt(start.py), ev.shiftKey));
      setSelected(index >= 0 ? [index] : []);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up as EventListener);
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
      {path.length > 1 && (
        <polyline
          points={path.map(([a, b]) => `${a},${b}`).join(" ")}
          fill="none"
          stroke={p.color}
          strokeWidth={1.5}
          strokeDasharray={p.dimmed ? "4 3" : undefined}
        />
      )}
      {pts.map((pt) => (
        <circle
          key={pt.index}
          cx={x(pt.q)}
          cy={y(pt.value)}
          r={selected.includes(pt.index) ? 5 : 4}
          fill={selected.includes(pt.index) ? "var(--select)" : "var(--panel)"}
          stroke={p.color}
          strokeWidth={1.5}
          className="cursor-grab"
          data-testid="lane-point"
          onPointerDown={(e) => startDrag(e, pt)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            p.onDelete([pt.index]);
            setSelected([]);
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
            p.onMenu(pt.index, e);
          }}
        >
          <title>{p.format(pt.value)}</title>
        </circle>
      ))}
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
