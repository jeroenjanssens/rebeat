/**
 * The synth editor's wavetable and physical model pictures (D247, §8.2): a table's frames
 * stacked in depth with a strip of the whole table under it, and a resonator with its exciter
 * and pickup markers. Drag them to scrub (the same values as the knobs), see where modulation
 * has them now, and hold a note while you do.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { onFrame } from "../../render/raf";
import { useAutomated } from "../../state/automationKnob";
import { builtTable, loadTable } from "../../engine/synth/tables";
import { frameOf, type MippedTable } from "../../model/wavetables";
import type { ResonatorModel } from "../../model/synth";

/** A table with its mip levels, loading it the first time (null until it's built). */
export function useTable(id: string): MippedTable | null {
  const [, built] = useState(0);
  useEffect(() => {
    let live = true;
    if (id && !builtTable(id)) void loadTable(id).then(() => live && built((n) => n + 1));
    return () => {
      live = false;
    };
  }, [id]);
  return id ? builtTable(id) : null;
}

const PW = 230;
const PH = 70;
const STRIP = 10;

/** A frame as an SVG path in a w × h box, read at a lower mip level (fewer points). */
function framePath(t: MippedTable, frame: number, w: number, h: number) {
  const f = frameOf(t, frame, 3);
  const n = 96;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const v = f[Math.min(f.length - 1, Math.floor((i / n) * f.length))];
    pts.push(`${((i / n) * w).toFixed(1)},${(h / 2 - v * (h / 2 - 2)).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

/**
 * Drag horizontally to scrub (Shift: finely); double-click resets; the wheel nudges. The
 * value is 0..1; `live` is where modulation or a lane has it now (a dot).
 */
function useScrub(
  value: number,
  onChange: (v: number) => void,
  onReset: () => void,
  width: number,
  absolute = false,
) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    onPointerDown: (e: React.PointerEvent<Element>) => {
      if (e.button !== 0) return;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const r = (e.currentTarget as Element).getBoundingClientRect();
      const at = clamp((e.clientX - r.left) / r.width);
      drag.current = { x: e.clientX, v: absolute ? at : value };
      if (absolute) onChange(at);
    },
    onPointerMove: (e: React.PointerEvent<Element>) => {
      const d = drag.current;
      if (!d || !e.buttons) return;
      const r = (e.currentTarget as Element).getBoundingClientRect();
      const scale = (e.shiftKey ? 0.15 : 1) / (r.width || width);
      onChange(clamp(d.v + (e.clientX - d.x) * scale));
    },
    onPointerUp: () => void (drag.current = null),
    onDoubleClick: onReset,
    onWheel: (e: React.WheelEvent) => {
      if (!e.deltaY) return;
      onChange(clamp(value + (e.deltaY < 0 ? 0.01 : -0.01)));
    },
  };
}

/** Where a value is now (live), redrawn on every frame only while it moves. */
function useLive(live: (() => number | null) | undefined) {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => (live ? onFrame(() => setV(live())) : undefined), [live]);
  return live ? v : null;
}

/** The Hold toggle: a note held while you scrub, so you hear it without a keyboard. */
export function HoldButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      className="tool-btn !h-5 border border-line !px-1.5 !text-[10px]"
      data-active={on}
      aria-pressed={on}
      onClick={onToggle}
      data-hint="synth.hold"
      data-testid="synth-hold"
      title="Hold a note while you scrub"
    >
      Hold
    </button>
  );
}

/** A wavetable: its frames stacked in depth around the position, and the whole table as a strip. */
export function TablePicture({
  table: given,
  tableId,
  name,
  position,
  live: liveProp,
  target,
  color,
  onChange,
  onReset,
  onMenu,
  onDropFile,
}: {
  /** A table to show as it is (the import dialog's preview), instead of `tableId`'s. */
  table?: MippedTable;
  tableId: string;
  name: string;
  position: number;
  live?: () => number | null;
  /** Its automation target: while a lane plays, the dot follows it. */
  target?: string;
  color: string;
  onChange: (v: number) => void;
  onReset: () => void;
  onMenu?: (e: React.MouseEvent) => void;
  onDropFile?: (f: File) => void;
}) {
  const loaded = useTable(given ? "" : tableId);
  const table = given ?? loaded;
  const auto = useAutomated(target);
  const now = useLive(liveProp ?? auto.live);
  const shown = now ?? position;
  const scrub = useScrub(position, onChange, onReset, PW);
  const strip = useScrub(position, onChange, onReset, PW, true);
  const frames = table?.frames ?? 1;
  const at = shown * (frames - 1);
  // a few frames behind and ahead, fading out, then the current one in front
  const depth = Math.min(6, frames - 1);
  const behind: number[] = [];
  for (let k = depth; k >= 1; k--) {
    const f = Math.round(at) + k * Math.max(1, Math.round(frames / 24));
    if (f < frames) behind.push(f);
  }
  return (
    <div
      className="flex flex-col gap-0.5"
      data-hint="synth.wt.picture"
      data-testid="wt-picture"
      data-position={position.toFixed(3)}
      onContextMenu={onMenu}
      onDragOver={(e) => onDropFile && e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        const f = e.dataTransfer.files[0];
        if (f && onDropFile) {
          e.preventDefault();
          onDropFile(f);
        }
      }}
    >
      <svg
        width="100%"
        viewBox={`0 0 ${PW} ${PH}`}
        className="cursor-ew-resize touch-none rounded bg-display"
        {...scrub}
      >
        {table ? (
          <>
            {behind.map((f, i) => {
              const k = behind.length - i;
              return (
                <path
                  key={f}
                  d={framePath(table, f, PW - 40, PH - 24)}
                  transform={`translate(${8 + k * 4},${10 - k * 1.5})`}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.08 + 0.3 * (1 - k / (depth + 1))}
                />
              );
            })}
            <path
              d={framePath(table, at, PW - 40, PH - 24)}
              transform="translate(8,14)"
              fill="none"
              stroke={color}
              strokeWidth={1.6}
            />
          </>
        ) : (
          <text
            x={PW / 2}
            y={PH / 2}
            textAnchor="middle"
            className="fill-[var(--faint)] text-[10px]"
          >
            {tableId.startsWith("user:") && name === "Missing table"
              ? "Table not found: plays Basic shapes"
              : "Loading…"}
          </text>
        )}
        <text x={PW - 4} y={PH - 4} textAnchor="end" className="fill-[var(--faint)] text-[9px]">
          {frames > 1 ? `frame ${Math.round(at) + 1} / ${frames}` : "1 frame"}
        </text>
      </svg>
      <svg
        width="100%"
        viewBox={`0 0 ${PW} ${STRIP}`}
        className="cursor-pointer touch-none rounded bg-display"
        data-hint="synth.wt.strip"
        data-testid="wt-strip"
        {...strip}
      >
        {Array.from({ length: Math.min(frames, 64) }, (_, i) => {
          const x = ((i + 0.5) / Math.min(frames, 64)) * PW;
          return <line key={i} x1={x} x2={x} y1={3} y2={STRIP - 3} stroke="var(--line)" />;
        })}
        <rect x={position * (PW - 4)} y={1} width={4} height={STRIP - 2} rx={1} fill={color} />
        {now !== null && Math.abs(now - position) > 0.002 && (
          <circle cx={2 + now * (PW - 4)} cy={STRIP / 2} r={2.5} fill="var(--lit)" />
        )}
      </svg>
    </div>
  );
}

/** A lane's knob position as a marker's value (2%..98%). */
const inRange = (live: (() => number | null) | undefined) =>
  live &&
  (() => {
    const k = live();
    return k === null ? null : 0.02 + k * 0.96;
  });

const RW = 230;
const RH = 58;

/** The resonator's shape: a string, a tube, a bar on two supports, a membrane, a bell, a plate. */
function ResonatorShape({ model, color }: { model: ResonatorModel; color: string }) {
  const y = RH / 2;
  const stroke = { stroke: color, fill: "none", strokeWidth: 1.4 };
  switch (model) {
    case "string":
      return (
        <>
          <line x1={10} x2={RW - 10} y1={y} y2={y} {...stroke} />
          <rect x={4} y={y - 8} width={6} height={16} fill="var(--line)" />
          <rect x={RW - 10} y={y - 8} width={6} height={16} fill="var(--line)" />
        </>
      );
    case "tube":
      return (
        <>
          <line x1={10} x2={RW - 10} y1={y - 9} y2={y - 9} {...stroke} />
          <line x1={10} x2={RW - 10} y1={y + 9} y2={y + 9} {...stroke} />
          <line x1={10} x2={10} y1={y - 9} y2={y + 9} {...stroke} />
        </>
      );
    case "bar":
      return (
        <>
          <rect x={10} y={y - 6} width={RW - 20} height={12} rx={2} {...stroke} />
          <path
            d={`M${RW * 0.224} ${y + 6} l-4 8 h8 z M${RW * 0.776} ${y + 6} l-4 8 h8 z`}
            fill="var(--line)"
          />
        </>
      );
    case "membrane":
      return <ellipse cx={RW / 2} cy={y} rx={RW / 2 - 12} ry={RH / 2 - 6} {...stroke} />;
    case "bell":
      // a bell's profile: a rounded crown, the waist, the flared lip
      return (
        <path
          d={`M${RW / 2 - 14} 8 Q${RW / 2} 2 ${RW / 2 + 14} 8 C${RW / 2 + 22} 16 ${RW / 2 + 20} ${RH - 22} ${RW / 2 + 34} ${RH - 10} Q${RW / 2 + 44} ${RH - 5} ${RW / 2 + 48} ${RH - 5} H${RW / 2 - 48} Q${RW / 2 - 44} ${RH - 5} ${RW / 2 - 34} ${RH - 10} C${RW / 2 - 20} ${RH - 22} ${RW / 2 - 22} 16 ${RW / 2 - 14} 8 Z`}
          {...stroke}
        />
      );
    case "plate":
      return <rect x={14} y={6} width={RW - 28} height={RH - 12} {...stroke} />;
    case "glass":
      return (
        <path
          d={`M${RW / 2 - 40} 6 Q${RW / 2 - 36} ${RH - 14} ${RW / 2} ${RH - 12} Q${RW / 2 + 36} ${RH - 14} ${RW / 2 + 40} 6`}
          {...stroke}
        />
      );
  }
}

/**
 * A physical model's resonator, with two markers you drag: where it's excited (Position) and
 * where it's heard (Pickup). Dots show where modulation has them now.
 */
export function ResonatorPicture({
  model,
  position,
  pickup,
  livePosition,
  livePickup,
  color,
  onPosition,
  onPickup,
  onResetPosition,
  onResetPickup,
  onMenu,
  targets,
}: {
  /** The two markers' automation targets (their lanes move the dots). */
  targets?: { position?: string; pickup?: string };
  model: ResonatorModel;
  position: number;
  pickup: number;
  livePosition?: () => number | null;
  livePickup?: () => number | null;
  color: string;
  onPosition: (v: number) => void;
  onPickup: (v: number) => void;
  onResetPosition: () => void;
  onResetPickup: () => void;
  onMenu?: (which: "position" | "pickup", e: React.MouseEvent) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<"position" | "pickup" | null>(null);
  const autoPos = useAutomated(targets?.position);
  const autoPick = useAutomated(targets?.pickup);
  // a lane's value is a knob position (0..1); the markers' range is 2%..98%
  const lanePos = useMemo(() => inRange(autoPos.live), [autoPos.live]);
  const lanePick = useMemo(() => inRange(autoPick.live), [autoPick.live]);
  const nowPos = useLive(livePosition ?? lanePos);
  const nowPick = useLive(livePickup ?? lanePick);
  const x = (v: number) => 10 + v * (RW - 20);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(
      0.98,
      Math.max(0.02, ((e.clientX - r.left) / r.width) * (RW / (RW - 20)) - 10 / (RW - 20)),
    );
  };
  const marker = (which: "position" | "pickup", v: number, live: number | null) => {
    const top = which === "position";
    return (
      <g
        className="cursor-ew-resize"
        data-marker={which}
        data-value={v.toFixed(3)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          ref.current?.setPointerCapture(e.pointerId);
          drag.current = which;
        }}
        onDoubleClick={() => (which === "position" ? onResetPosition() : onResetPickup())}
        onContextMenu={(e) => {
          e.stopPropagation();
          onMenu?.(which, e);
        }}
      >
        <line
          x1={x(v)}
          x2={x(v)}
          y1={top ? 2 : RH / 2}
          y2={top ? RH / 2 : RH - 2}
          stroke={top ? color : "var(--lit)"}
          strokeWidth={2}
        />
        <path
          d={top ? `M${x(v) - 5} 2 h10 l-5 6 z` : `M${x(v) - 5} ${RH - 2} h10 l-5 -6 z`}
          fill={top ? color : "var(--lit)"}
        />
        {/* a wider, invisible grip */}
        <rect x={x(v) - 7} y={top ? 0 : RH / 2} width={14} height={RH / 2} fill="transparent" />
        {live !== null && Math.abs(live - v) > 0.002 && (
          <circle cx={x(live)} cy={top ? 10 : RH - 10} r={2.5} fill={top ? color : "var(--lit)"} />
        )}
      </g>
    );
  };
  return (
    <svg
      ref={ref}
      width="100%"
      viewBox={`0 0 ${RW} ${RH}`}
      className="touch-none rounded bg-display"
      data-hint="synth.phys.picture"
      data-testid="phys-picture"
      onPointerMove={(e) => {
        if (!drag.current || !e.buttons) return;
        const v = at(e);
        if (drag.current === "position") onPosition(v);
        else onPickup(v);
      }}
      onPointerUp={() => void (drag.current = null)}
    >
      <ResonatorShape model={model} color={color} />
      {marker("position", position, nowPos)}
      {marker("pickup", pickup, nowPick)}
    </svg>
  );
}
