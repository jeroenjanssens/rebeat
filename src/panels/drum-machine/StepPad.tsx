import { memo, type CSSProperties } from "react";
import { notesLabel, stepPitches } from "../../model/notes";
import type { Step } from "../../model/types";

interface Props {
  trackId: string;
  index: number;
  step: Step;
  color: string;
  beyond: boolean;
  tie: boolean;
  selected: boolean;
  velBar: boolean;
  instrument: boolean;
  cursor?: boolean;
  /** Note names with flats (follows the key). */
  flats?: boolean;
}

export const StepPad = memo(function StepPad({
  trackId,
  index,
  step,
  color,
  beyond,
  tie,
  selected,
  velBar,
  instrument,
  cursor = false,
  flats = true,
}: Props) {
  const on = step.on && !beyond;
  const cls = [
    "pad",
    on && "on",
    on && step.accent && "accent",
    on && step.probability < 1 && "partial",
    tie && !on && "tie",
    beyond && "beyond",
    selected && "selected",
    cursor && "cursor",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      data-pad=""
      data-track={trackId}
      data-i={index}
      style={{ "--c": color, "--v": step.accent ? 1 : step.velocity } as CSSProperties}
    >
      {(on || (tie && !on)) && (
        <span className="fill" style={{ height: on ? `${step.probability * 100}%` : "100%" }} />
      )}
      {on &&
        step.ratchet > 1 &&
        Array.from({ length: step.ratchet - 1 }, (_, k) => (
          <span
            key={k}
            className="ratchet"
            style={{ left: `${((k + 1) / step.ratchet) * 100}%` }}
          />
        ))}
      {on && step.nudge !== 0 && (
        <span className="nudge" style={{ left: `calc(50% - 3px + ${step.nudge * 100}%)` }} />
      )}
      {on && step.condition && <span className="cond">{step.condition}</span>}
      {on && step.locked && <span className="lock" />}
      {on && instrument && step.notes?.length && (
        <span className="note">{notesLabel(stepPitches(step), flats)}</span>
      )}
      {on && step.notes?.some((n) => n.slide) && <span className="slide">╱</span>}
      {on && velBar && !instrument && (
        <span className="velbar" style={{ width: `calc((100% - 6px) * ${step.velocity})` }} />
      )}
    </div>
  );
});
