import { useRef, useState } from "react";
import { useScratch } from "../../components/useScratch";
import type { Track } from "../../model/types";

/**
 * Jog strip for scratching an audio track: grab the platter or the strip and drag to move the
 * record forwards/backwards; release to return to synced playback.
 */
export function ScratchStrip({ track, width }: { track: Track; width: number }) {
  const [angle, setAngle] = useState(0);
  const [cut, setCut] = useState(false);
  const x0 = useRef(0);
  // 300 px of dragging per second = normal speed
  const s = useScratch(track, 300);

  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    x0.current = e.clientX;
    s.begin(e.clientX);
  };
  const move = (e: React.PointerEvent) => {
    if (!s.active()) return;
    s.move(e.clientX);
    setAngle((e.clientX - x0.current) * 1.6);
  };

  return (
    <div className="flex items-center gap-3 py-1.5" style={{ width }}>
      <svg
        width={44}
        height={44}
        className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={s.end}
        onPointerCancel={s.end}
      >
        <circle cx={22} cy={22} r={21} fill="var(--display)" stroke="var(--border-strong)" />
        <g transform={`rotate(${angle} 22 22)`}>
          {[14, 10, 6].map((r) => (
            <circle key={r} cx={22} cy={22} r={r} fill="none" stroke="var(--border)" />
          ))}
          <line
            x1={22}
            y1={3}
            x2={22}
            y2={12}
            stroke={track.color}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>
        <circle cx={22} cy={22} r={2.5} fill="var(--text-dim)" />
      </svg>
      <div
        className="relative h-8 flex-1 cursor-ew-resize touch-none overflow-hidden rounded-md border border-line bg-display"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={s.end}
        onPointerCancel={s.end}
        onWheel={(e) => {
          // the wheel nudges the record like a jog wheel
          if (!s.active()) s.begin(0);
          s.move(-e.deltaY * 2);
          window.setTimeout(s.end, 120);
        }}
        title="Drag to scratch · release to return to the beat"
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px 12px)`,
            backgroundPositionX: `${angle}px`,
          }}
        />
        <div className="label absolute inset-0 flex items-center justify-center">
          Drag to scratch
        </div>
      </div>
      <button
        className="hw-btn"
        data-lit={cut}
        onPointerDown={() => (setCut(true), s.cut(true))}
        onPointerUp={() => (setCut(false), s.cut(false))}
        onPointerLeave={() => cut && (setCut(false), s.cut(false))}
        title="Hold to cut the sound (transform/crab scratches)"
      >
        Cut
      </button>
    </div>
  );
}
