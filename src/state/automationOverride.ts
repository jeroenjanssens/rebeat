/**
 * Touching an automated knob, as in Ableton (D191): it overrides its lane until Back to
 * automation, which brings back every overridden lane. Session state, not saved.
 */
import { create } from "zustand";

interface OverrideState {
  /** Targets whose lane is overridden (the knob's own value plays). */
  overridden: Record<string, true>;
}

export const useOverrides = create<OverrideState>(() => ({ overridden: {} }));

export function overrideLane(target: string) {
  if (useOverrides.getState().overridden[target]) return;
  useOverrides.setState((s) => ({ overridden: { ...s.overridden, [target]: true } }));
}

export function backToAutomation() {
  useOverrides.setState({ overridden: {} });
}

export const isOverridden = (target: string) => !!useOverrides.getState().overridden[target];
