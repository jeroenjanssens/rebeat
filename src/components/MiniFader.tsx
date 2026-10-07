import { useRef } from "react";
import { VOLUME_FORMAT } from "../model/params";

interface Props {
  value: number;
  color: string;
  onChange: (v: number) => void;
  width?: number;
}

/** Small horizontal volume fader. Drag (Shift = fine); double-click = 0 dB. */
export function MiniFader({ value, color, onChange, width = 44 }: Props) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  return (
    <div
      className="relative h-[14px] cursor-ew-resize touch-none rounded-[3px] bg-pad"
      style={{ width }}
      title={`Volume ${VOLUME_FORMAT(value)} dB · drag · double-click = 0 dB`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, v: value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const v = drag.current.v + ((e.clientX - drag.current.x) / width) * (e.shiftKey ? 0.2 : 1);
        onChange(Math.min(1, Math.max(0, v)));
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => onChange(0.8)}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-[3px]"
        style={{
          width: `${value * 100}%`,
          background: `color-mix(in oklab, ${color} 55%, var(--pad-bg))`,
        }}
      />
      <div
        className="absolute inset-y-[-2px] w-[3px] rounded-sm bg-ink"
        style={{ left: `calc(${value * 100}% - 1.5px)` }}
      />
      <div className="absolute inset-y-0 w-px bg-faint/60" style={{ left: "80%" }} />
    </div>
  );
}
