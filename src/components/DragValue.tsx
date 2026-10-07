import { useRef } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  label?: string;
  className?: string;
}

/** A number you change by dragging vertically or scrolling; double-click resets. */
export function DragValue({
  value,
  min,
  max,
  step = 1,
  defaultValue,
  format,
  onChange,
  label,
  className = "",
}: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <span
      className={`field cursor-ns-resize touch-none ${className}`}
      title="Drag or scroll · double-click = reset"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, v: value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const range = (max - min) / (e.shiftKey ? 800 : 160);
        onChange(clamp(drag.current.v + (drag.current.y - e.clientY) * range));
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => onChange(clamp(value - Math.sign(e.deltaY) * step))}
      onDoubleClick={() => onChange(defaultValue)}
    >
      {label && <span className="label">{label}</span>}
      <span className="num text-ink">{format(value)}</span>
    </span>
  );
}
