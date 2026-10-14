/** The "A" of an automated control (D186), for controls that aren't knobs (switches, D231). */
import { useAutomated } from "../state/automationKnob";

export function AutoMark({ target }: { target: string | undefined }) {
  const auto = useAutomated(target);
  if (!auto.lane) return null;
  const color = auto.overridden ? "var(--lit)" : "var(--accent)";
  return (
    <span
      className="rounded-[2px] px-[2px] text-[7.5px] leading-[10px]"
      style={{ color, boxShadow: `inset 0 0 0 1px ${color}` }}
      title={
        auto.overridden
          ? "Automated, overridden: you changed it. Back to automation brings the lane back."
          : "Automated: it follows its lane on the timeline while the song plays"
      }
      data-testid="automated-mark"
    >
      A
    </span>
  );
}
