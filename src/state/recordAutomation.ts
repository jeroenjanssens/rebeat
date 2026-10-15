/**
 * Record automation (D191): while recording in Song mode with Record automation on, turning an
 * automatable knob writes its moves at their song positions. During the take the knob plays (its
 * lane is overridden); when the take ends, the moves become points, thinned, in one undo step,
 * replacing the lane's points under them.
 */
import { songPosition } from "../engine/transport";
import { toAnchor, toSong } from "../model/arrangement";
import { automatableKnobs, knobValue, thinPoints } from "../model/automation";
import { uid } from "../model/id";
import { overrideLane, useOverrides } from "./automationOverride";
import { useStore } from "./store";

const take = new Map<string, { q: number; value: number }[]>();

/** Write the take's moves into their lanes (one undo step), and play the lanes again. */
function flush() {
  if (!take.size) return;
  const moves = [...take.entries()].filter(([, list]) => list.length);
  take.clear();
  if (!moves.length) return;
  useStore.getState().commit((p) => {
    p.automation ??= [];
    for (const [target, list] of moves) {
      let lane = p.automation.find((l) => l.target === target);
      if (!lane) {
        lane = { id: uid("auto"), target, on: true, points: [] };
        p.automation.push(lane);
      }
      const from = list[0].q - 1e-6;
      const to = list[list.length - 1].q + 1e-6;
      lane.points = lane.points.filter((pt) => {
        const q = toSong(p, pt);
        return q === null || q < from || q > to;
      });
      for (const pt of thinPoints(list, 0.01))
        lane.points.push({ ...toAnchor(p, pt.q), value: pt.value });
    }
  });
  // the recorded lanes play again
  useOverrides.setState((s) => {
    const overridden = { ...s.overridden };
    for (const [target] of moves) delete overridden[target];
    return { overridden };
  });
}

export function watchRecordAutomation(): () => void {
  return useStore.subscribe((s, prev) => {
    const on = s.recordAutomation && s.recording && s.playing && s.project.playMode === "song";
    const was =
      prev.recordAutomation && prev.recording && prev.playing && prev.project.playMode === "song";
    if (was && !on) return flush();
    // undo and redo don't update lastCommitTime; recording reads only deliberate knob turns
    if (!on || s.project === prev.project || s.lastCommitTime === prev.lastCommitTime) return;
    const q = songPosition();
    if (q === null) return;
    for (const k of automatableKnobs(s.project)) {
      const v = knobValue(s.project, k.target);
      if (v === knobValue(prev.project, k.target)) continue;
      const list = take.get(k.target) ?? [];
      // the value before the turn, so the lane starts where the knob was
      if (!list.length)
        list.push({ q: Math.max(0, q - 0.01), value: knobValue(prev.project, k.target) });
      list.push({ q, value: v });
      take.set(k.target, list);
      overrideLane(k.target);
    }
  });
}
