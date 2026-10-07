import { useRef, useState } from "react";
import * as engine from "../../engine/engine";
import type { Track } from "../../model/types";

/**
 * Jog strip for scratching an audio track: grab the platter or the strip and drag to move the
 * playhead forwards/backwards; release to return to synced playback.
 */
export function ScratchStrip({ track, width }: { track: Track; width: number }) {
  const drag = useRef<{ x: number; pos: number; t: number; lastX: number } | null>(null);
  const [angle, setAngle] = useState(0);
  const [cut, setCut] = useState(false);

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = engine.clipPosition(track.id) ?? 0;
    drag.current = { x: e.clientX, pos, t: performance.now(), lastX: e.clientX };
    engine.scratch(track, pos, 0);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const speed = (e.clientX - d.lastX) / Math.max(1, now - d.t);
    d.t = now;
    d.lastX = e.clientX;
    const pos = (((d.pos + (e.clientX - d.x) / 600) % 1) + 1) % 1;
    engine.scratch(track, pos, cut ? 0 : speed * 4);
    setAngle((e.clientX - d.x) * 1.6);
  };
  const onUp = () => {
    drag.current = null;
    engine.scratch(track, null);
  };

  return (
    <div className="flex items-center gap-3 py-1.5" style={{ width }}>
      <svg
        width={44}
        height={44}
        className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
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
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
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
        onPointerDown={() => setCut(true)}
        onPointerUp={() => setCut(false)}
        onPointerLeave={() => setCut(false)}
        title="Hold to cut the sound (transform/crab scratches)"
      >
        Cut
      </button>
    </div>
  );
}
