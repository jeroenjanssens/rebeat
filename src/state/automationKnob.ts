/**
 * Knobs and their automation (D186, D191): the Automate item in a knob's menu, its "A" mark,
 * and the dot that follows the lane while the song plays.
 */
import { useMemo } from "react";
import type { MenuItem } from "../components/Menu";
import { songPosition, startPosition } from "../engine/transport";
import { isAutomatable, knobValue, laneValueAt } from "../model/automation";
import { isOverridden, useOverrides } from "./automationOverride";
import { useSettings } from "./settings";
import { useStore } from "./store";
import { automate } from "./timelineActions";

/** A knob's automation lane (on), whether it's overridden, and its value while playing. */
export function useAutomated(target: string | undefined) {
  const lane = useStore((s) =>
    target ? s.project.automation?.find((l) => l.target === target && l.on) : undefined,
  );
  const overridden = useOverrides((s) => (target ? !!s.overridden[target] : false));
  const live = useMemo(
    () =>
      lane && target
        ? () => {
            const q = songPosition();
            if (q === null || isOverridden(target)) return null;
            return laneValueAt(useStore.getState().project, lane, q);
          }
        : undefined,
    [lane, target],
  );
  return { lane, overridden, live };
}

/** "Automate" (or "Show its automation") for a knob's menu, when the knob can be automated. */
export function automateItems(target: string | undefined): MenuItem[] {
  const project = useStore.getState().project;
  if (!target || !isAutomatable(project, target)) return [];
  const has = project.automation?.some((l) => l.target === target);
  return [
    { separator: true },
    {
      label: has ? "Show its automation" : "Automate",
      onSelect: () => {
        automate(target, startPosition(), knobValue(project, target));
        // show the lane: its track's row on the timeline
        if (useSettings.getState().timelineTracks === "none")
          useSettings.getState().set({ timelineTracks: "used" });
        void import("../app/openers").then((m) => m.focusPanel("timeline"));
      },
    },
  ];
}

/**
 * The menu of a control that isn't an Encoder (a matrix amount, a switch, D226, D231): MIDI
 * learn and Automate, for its target.
 */
export function controlItems(target: string | undefined, label: string): MenuItem[] {
  if (!target) return [];
  return [
    {
      label: "MIDI learn",
      onSelect: () =>
        void import("../audio-io/midi").then((m) => m.startLearn(target, label, "project")),
    },
    ...automateItems(target),
  ];
}
