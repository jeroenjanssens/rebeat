/**
 * A fake transport: advances steps in time with the BPM, handles page changes (loop/song mode,
 * queued pages, repeats) and fires the fake engine. Visual updates subscribe to step events and
 * update the DOM directly, outside React.
 */
import { onFrame } from "../render/raf";
import { isAudible, useStore } from "../state/store";
import { STEP_SIZE_QUARTERS, type Pattern } from "../model/types";
import * as engine from "./engine";

export interface StepEvent {
  slotId: string;
  patternId: string;
  pageStep: number;
  triggered: Set<string>;
}

type Listener = (e: StepEvent) => void;
const listeners = new Set<Listener>();

let stopFrame: (() => void) | null = null;
let nextStepTime = 0;
let stepStartTime = 0;
let stepDuration = 1;
let pageStep = -1;
let repeatCount = 0;
const cycles = new Map<string, number>();

export function onStep(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function stepMs(pattern: Pattern, bpm: number, index: number): number {
  const base = (60000 / bpm) * STEP_SIZE_QUARTERS[pattern.stepSize];
  // swing: lengthen even steps, shorten odd ones
  return index % 2 === 0 ? base * 2 * pattern.swing : base * (2 - 2 * pattern.swing);
}

export function position(now: number) {
  const s = useStore.getState();
  const pattern = s.project.patterns[s.project.slots.find((x) => x.id === s.playSlotId)!.patternId];
  if (!s.playing || pageStep < 0) return { pattern, pageStep: 0, progress: 0 };
  const frac = Math.min(1, Math.max(0, (now - stepStartTime) / stepDuration));
  return { pattern, pageStep, progress: (pageStep + frac) / pattern.stepCount };
}

function conditionPasses(condition: string | undefined, cycle: number, fill: boolean): boolean {
  switch (condition) {
    case undefined:
      return true;
    case "FILL":
      return fill;
    case "!FILL":
      return !fill;
    default: {
      const [a, b] = condition.split(":").map(Number);
      return cycle % b === a - 1;
    }
  }
}

function advance(time: number) {
  const state = useStore.getState();
  const { project } = state;
  let slot = project.slots.find((s) => s.id === state.playSlotId) ?? project.slots[0];
  let pattern = project.patterns[slot.patternId];

  pageStep += 1;
  if (pageStep >= pattern.stepCount) {
    pageStep = 0;
    cycles.set(slot.id, (cycles.get(slot.id) ?? 0) + 1);
    repeatCount += 1;
    let next = slot;
    if (state.queuedSlotId) next = project.slots.find((s) => s.id === state.queuedSlotId) ?? slot;
    else if (state.playMode === "song" && repeatCount >= slot.repeats) {
      next = project.slots[(project.slots.indexOf(slot) + 1) % project.slots.length];
    }
    if (next !== slot || state.queuedSlotId) {
      repeatCount = 0;
      slot = next;
      pattern = project.patterns[slot.patternId];
      state.setUi({
        playSlotId: slot.id,
        queuedSlotId: null,
        ...(state.follow && state.editSlotId !== slot.id
          ? { editSlotId: slot.id, selectedSteps: {} }
          : {}),
      });
    }
  }

  stepStartTime = time;
  stepDuration = stepMs(pattern, project.bpm, pageStep);
  nextStepTime = time + stepDuration;

  const fill = state.fillHeld || state.fillLatched;
  const cycle = cycles.get(slot.id) ?? 0;
  const triggered = new Set<string>();
  for (const track of project.tracks) {
    const lane = pattern.lanes[track.id];
    if (!lane) continue;
    const audible = isAudible(track.id, project);
    if (lane.kind === "clip") {
      if (pageStep === 0) {
        if (lane.active && audible) {
          let ms = 0;
          for (let i = 0; i < pattern.stepCount; i++) ms += stepMs(pattern, project.bpm, i);
          engine.startClip(track, time, ms, lane.launchMode === "oneshot");
        } else engine.stopClip(track.id);
      } else if (!audible) engine.stopClip(track.id);
      continue;
    }
    const len = lane.stepCountOverride ?? pattern.stepCount;
    const step = lane.steps[pageStep % len];
    if (!step.on || !audible) continue;
    if (Math.random() >= step.probability) continue;
    if (!conditionPasses(step.condition, cycle, fill)) continue;
    triggered.add(track.id);
    engine.trigger(track, step.accent ? 1 : step.velocity, {
      now: time + step.nudge * stepDuration,
      ratchet: step.ratchet,
      stepMs: stepDuration,
      notes: step.notes,
      lengthSteps: step.length,
    });
  }

  const event: StepEvent = { slotId: slot.id, patternId: pattern.id, pageStep, triggered };
  for (const fn of listeners) fn(event);
}

export function play() {
  const s = useStore.getState();
  if (s.playing) return;
  pageStep = -1;
  repeatCount = 0;
  cycles.clear();
  s.setUi({ playing: true, playSlotId: s.editSlotId, queuedSlotId: null });
  nextStepTime = performance.now();
  stopFrame = onFrame((now) => {
    // after a long pause (hidden tab), resync instead of catching up
    if (now - nextStepTime > 250) nextStepTime = now;
    while (now >= nextStepTime) advance(nextStepTime);
  });
}

export function stop() {
  stopFrame?.();
  stopFrame = null;
  engine.stopAll();
  pageStep = -1;
  useStore.getState().setUi({ playing: false, queuedSlotId: null });
  for (const fn of listeners) fn({ slotId: "", patternId: "", pageStep: -1, triggered: new Set() });
}

export function toggle() {
  if (useStore.getState().playing) stop();
  else play();
}

// the engine's envelopes decay on the shared frame loop, also while stopped (pad auditioning)
onFrame((now, dt) => engine.update(now, dt));
