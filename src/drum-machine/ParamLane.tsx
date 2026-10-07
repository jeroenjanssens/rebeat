import { useRef } from "react";
import type { Step, StepLane, Track } from "../model/types";
import { editSteps } from "../state/actions";
import { stepKey } from "../state/store";
import type { Geometry } from "./layout";

type Field = "velocity" | "probability" | "nudge";

const LABEL: Record<Field, string> = { velocity: "Velocity", probability: "Prob", nudge: "Nudge" };

const read = (s: Step, f: Field) => (f === "nudge" ? s.nudge + 0.5 : s[f]);

/** A lane of bars under the selected track for editing one step parameter by drawing. */
export function ParamLane({
  track,
  lane,
  length,
  geo,
  field,
}: {
  track: Track;
  lane: StepLane;
  length: number;
  geo: Geometry;
  field: Field;
}) {
  const drawing = useRef<string | null>(null);
  const h = 38;

  const apply = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-lane-i]");
    if (!el) return;
    const i = Number(el.dataset.laneI);
    if (!lane.steps[i].on || i >= length) return;
    const r = el.getBoundingClientRect();
    const v = Math.min(1, Math.max(0, 1 - (y - r.top) / r.height));
    editSteps(
      [stepKey(track.id, i)],
      (s) => {
        if (field === "nudge") s.nudge = Math.round((v - 0.5) * 20) / 20;
        else s[field] = field === "probability" ? Math.round(v * 20) / 20 : v;
      },
      drawing.current!,
    );
  };

  return (
    <div className="flex w-max min-w-full items-center">
      <div
        className="sticky left-0 z-[2] flex shrink-0 items-center justify-end gap-2 self-stretch bg-panel pr-3"
        style={{ width: geo.headerW }}
      >
        <span className="label" style={{ color: track.color }}>
          {LABEL[field]}
        </span>
      </div>
      <div
        className="flex touch-none items-end py-1 pl-1"
        style={{ gap: geo.beatGap, height: h + 8 }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = `lane-${field}-${performance.now()}`;
          apply(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => drawing.current && apply(e.clientX, e.clientY)}
        onPointerUp={() => (drawing.current = null)}
      >
        {geo.groups.map((g, gi) => (
          <div key={gi} className="flex items-end" style={{ gap: geo.beatGap }}>
            {g.barStart && <div className="w-px self-stretch bg-line" style={{ height: h }} />}
            <div className="flex items-end" style={{ gap: geo.gap }}>
              {g.indices.map((i) => {
                const s = lane.steps[i];
                const v = read(s, field);
                const on = s.on && i < length;
                const bipolar = field === "nudge";
                return (
                  <div
                    key={i}
                    data-lane-i={i}
                    className="relative cursor-ns-resize rounded-[2px] bg-surface"
                    style={{ width: geo.padW, height: h }}
                  >
                    {bipolar && <div className="absolute inset-x-0 top-1/2 h-px bg-line" />}
                    {on && (
                      <div
                        className="absolute inset-x-[2px] rounded-[2px]"
                        style={{
                          background: track.color,
                          opacity: 0.85,
                          ...(bipolar
                            ? {
                                top: `${Math.min(50, 100 - v * 100)}%`,
                                height: `${Math.max(2, Math.abs(v - 0.5) * 100)}%`,
                              }
                            : { bottom: 0, height: `${Math.max(4, v * 100)}%` }),
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
