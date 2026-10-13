/**
 * Touching an automated knob, as in Ableton (D191): it overrides its lane until Back to
 * automation, which brings back every overridden lane. Typing a tempo while the song has tempo
 * changes overrides them the same way (D193). Session state, not saved.
 */
import { create } from "zustand";
import { knobValue } from "../model/automation";
import type { Project } from "../model/project";
import { useStore } from "./store";

interface OverrideState {
  /** Targets whose lane is overridden (the knob's own value plays); "tempo" for the tempo map. */
  overridden: Record<string, true>;
  /** The tempo typed over the tempo changes, while overridden. */
  tempo: number | null;
}

export const useOverrides = create<OverrideState>(() => ({ overridden: {}, tempo: null }));

export function overrideLane(target: string) {
  if (useOverrides.getState().overridden[target]) return;
  useOverrides.setState((s) => ({ overridden: { ...s.overridden, [target]: true } }));
}

/** One tempo instead of the tempo changes, until Back to automation. */
export function overrideTempo(bpm: number) {
  useOverrides.setState((s) => ({
    overridden: { ...s.overridden, tempo: true },
    tempo: Math.round(Math.min(300, Math.max(20, bpm)) * 10) / 10,
  }));
}

export function backToAutomation() {
  useOverrides.setState({ overridden: {}, tempo: null });
}

export const isOverridden = (target: string) => !!useOverrides.getState().overridden[target];

/** The project as it plays now: with the tempo typed over its tempo changes, if any. */
const typed = new WeakMap<Project, { bpm: number; project: Project }>();
export function playingProject(project: Project): Project {
  const bpm = useOverrides.getState().tempo;
  if (bpm === null || !project.tempo?.length) return project;
  const cached = typed.get(project);
  if (cached?.bpm === bpm) return cached.project;
  const out = { ...project, bpm, tempo: undefined };
  typed.set(project, { bpm, project: out });
  return out;
}

/**
 * Watch for knob changes on automated targets: automation never writes to the project (the
 * engine moves the sound), so a change there is a hand on the knob (a mouse, a controller).
 * Opening another project starts over.
 */
export function watchOverrides(): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.projectId !== prev.projectId) return backToAutomation();
    if (s.project === prev.project || !s.project.automation?.length) return;
    // undoing isn't a hand on a knob
    if (s.past.length < prev.past.length) return;
    for (const lane of s.project.automation)
      if (lane.on && knobValue(s.project, lane.target) !== knobValue(prev.project, lane.target))
        overrideLane(lane.target);
  });
}
