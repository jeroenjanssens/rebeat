import { useRef } from "react";
import { useGlide } from "./glide";
import { contextMenu } from "./Menu";
import { startMidiLearn } from "../midi/learn";
import { VOLUME_FORMAT } from "../model/params";

/** dB marks on the fader scale, as fader positions (0.8 = 0 dB, 40·log10 curve). */
const MARKS = [6, 0, -6, -12, -24, -40].map((db) => ({ db, pos: 0.8 * Math.pow(10, db / 40) }));

/** Vertical volume fader. Drag (Shift = fine), scroll, double-click = 0 dB. */
export function Fader({
  value,
  onChange,
  color = "var(--accent)",
  height = 140,
  hint,
  midi,
}: {
  value: number;
  onChange: (v: number) => void;
  color?: string;
  height?: number;
  /** Explain-mode hint id (help/hints). */
  hint?: string;
  /** MIDI learn (D122): this project's target, and optionally a role for every project. */
  midi?: { target: string; label: string; global?: { target: string; label: string } };
}) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const glider = useGlide();
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return (
    <div
      data-hint={hint}
      className="relative w-7 cursor-ns-resize touch-none"
      style={{ height }}
      title={`${VOLUME_FORMAT(value)} dB · drag · double-click = 0 dB`}
      onPointerDown={(e) => {
        glider.stop();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, v: value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const d = (drag.current.y - e.clientY) / height;
        onChange(clamp(drag.current.v + d * (e.shiftKey ? 0.2 : 1)));
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => onChange(clamp(value - Math.sign(e.deltaY) * 0.01))}
      onDoubleClick={() => glider.glide(value, 0.8, onChange)}
      onContextMenu={(e) =>
        midi &&
        contextMenu(e, [
          { label: "Reset to 0 dB", onSelect: () => glider.glide(value, 0.8, onChange) },
          { separator: true },
          {
            label: midi.global ? "MIDI learn (in this project)" : "MIDI learn",
            onSelect: () => startMidiLearn(midi.target, midi.label),
          },
          ...(midi.global
            ? [
                {
                  label: `MIDI learn: ${midi.global.label} (every project)`,
                  onSelect: () => startMidiLearn(midi.global!.target, midi.global!.label, "global"),
                },
              ]
            : []),
        ])
      }
    >
      <div className="absolute inset-y-1 left-1/2 w-[3px] -translate-x-1/2 rounded bg-pad" />
      <div
        className="absolute bottom-1 left-1/2 w-[3px] -translate-x-1/2 rounded"
        style={{
          height: `calc(${value * 100}% - 8px)`,
          background: `color-mix(in oklab, ${color} 60%, var(--pad-bg))`,
        }}
      />
      {MARKS.map((m) => (
        <div
          key={m.db}
          className="absolute right-0 h-px w-1.5 bg-faint/60"
          style={{ bottom: `calc(4px + ${m.pos} * (100% - 8px))` }}
          title={`${m.db} dB`}
        />
      ))}
      <div
        className="absolute left-1/2 h-3 w-6 -translate-x-1/2 rounded-sm border border-line-strong bg-raised shadow"
        style={{ bottom: `calc(${value} * (100% - 8px) - 2px)` }}
      >
        <div className="mx-auto mt-[5px] h-px w-4 bg-ink" />
      </div>
    </div>
  );
}
