import { useRef } from "react";
import type { Draft } from "immer";
import {
  emptyStep,
  setStepVelocity,
  stepVelocity,
  type Step,
  type StepLane,
  type Track,
} from "../../model/types";
import { editSteps } from "../../state/actions";
import { stepKey } from "../../state/store";
import type { Geometry } from "./layout";

type Field = "velocity" | "probability" | "nudge";

const LABEL: Record<Field, string> = { velocity: "Velocity", probability: "Prob", nudge: "Nudge" };

const DEFAULTS = emptyStep();

const read = (s: Step, f: Field) =>
  f === "nudge" ? s.nudge + 0.5 : f === "velocity" ? stepVelocity(s) : s[f];

/** Set a lane's value (on instrument tracks, velocity is the notes'). */
function write(s: Draft<Step>, f: Field, v: number) {
  if (f === "velocity") setStepVelocity(s, v);
  else s[f] = v;
}

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
  // the reset merges with the clicks that started the double-click: one undo step
  const lastKey = useRef("");
  const lastDown = useRef(0);
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
        else write(s, field, field === "probability" ? Math.round(v * 20) / 20 : v);
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
        data-hint="dm.param-lane.bars"
        style={{ gap: geo.beatGap, height: h + 8 }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          // pointer events have no click count: a quick second press continues the first
          const now = performance.now();
          if (now - lastDown.current > 500) lastKey.current = `lane-${field}-${now}`;
          lastDown.current = now;
          drawing.current = lastKey.current;
          apply(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => drawing.current && apply(e.clientX, e.clientY)}
        onPointerUp={() => (drawing.current = null)}
        // double-click: back to the default; Alt+double-click: the whole lane
        onDoubleClick={(e) => {
          // (pointer capture makes the lane itself the target, so look at the coordinates)
          const el = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>("[data-lane-i]");
          if (!el && !e.altKey) return;
          const indices = e.altKey
            ? Array.from({ length }, (_, i) => i)
            : [Number(el!.dataset.laneI)];
          editSteps(
            indices.map((i) => stepKey(track.id, i)),
            (s) => write(s, field, DEFAULTS[field]),
            lastKey.current,
          );
        }}
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
