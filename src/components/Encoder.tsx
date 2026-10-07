import { useEffect, useLayoutEffect, useRef } from "react";
import type { ParamDef } from "../model/params";
import { contextMenu } from "./Menu";

interface Props {
  def: ParamDef;
  value: number | null; // null = nothing to edit
  onChange: (v: number) => void;
  color?: string;
  size?: number;
}

const START = -135;
const END = 135;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  if (Math.abs(to - from) < 0.01) return "";
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A rotary encoder with an LED-style value ring. Drag vertically (Shift = fine), scroll,
 * double-click to reset, right-click for MIDI learn.
 */
export function Encoder({ def, value, onChange, color = "var(--accent)", size = 40 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);
  useLayoutEffect(() => {
    valueRef.current = value;
    changeRef.current = onChange;
  });

  const quantize = (v: number) =>
    def.steps ? Math.round(v * (def.steps - 1)) / (def.steps - 1) : v;

  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      if (valueRef.current === null) return;
      e.preventDefault();
      const unit = def.steps ? 1 / (def.steps - 1) : e.shiftKey ? 0.004 : 0.02;
      changeRef.current(quantize(clamp(valueRef.current - Math.sign(e.deltaY) * unit)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def]);

  const disabled = value === null;
  const v = value ?? def.default;
  const deg = START + v * (END - START);
  const origin = def.bipolar ? 0 : START;
  const r = size / 2 - 3;
  const c = size / 2;
  const [ix, iy] = polar(c, c, r - 7, deg);
  const [ox, oy] = polar(c, c, r - 13, deg);

  return (
    <div
      ref={ref}
      className="flex flex-col items-center gap-0.5"
      style={{ opacity: disabled ? 0.4 : 1, width: size + 18 }}
      title={`${def.label}: drag or scroll · Shift = fine · double-click = reset`}
    >
      <div className="label truncate max-w-full">{def.label}</div>
      <svg
        width={size}
        height={size}
        className="touch-none"
        style={{ cursor: disabled ? "default" : "ns-resize" }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const sens = e.shiftKey ? 0.0012 : 0.006;
          onChange(quantize(clamp(drag.current.v + (drag.current.y - e.clientY) * sens)));
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => !disabled && onChange(def.default)}
        onContextMenu={(e) =>
          contextMenu(e, [
            { label: "Reset to default", onSelect: () => onChange(def.default), disabled },
            { separator: true },
            { label: "MIDI learn (Phase 8)", disabled: true },
          ])
        }
      >
        <path
          d={arc(c, c, r, START, END)}
          stroke="var(--pad-bg)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
        {!disabled && (
          <path
            d={arc(c, c, r, Math.min(origin, deg), Math.max(origin, deg))}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 3px ${color})` }}
          />
        )}
        <circle cx={c} cy={c} r={r - 6} fill="var(--raised)" stroke="var(--border-strong)" />
        <line
          x1={ox}
          y1={oy}
          x2={ix}
          y2={iy}
          stroke="var(--text)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      <div className="num text-[10.5px] text-ink">{disabled ? "—" : def.format(v)}</div>
    </div>
  );
}
