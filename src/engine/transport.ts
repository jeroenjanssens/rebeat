/**
 * The transport: a lookahead scheduler on the audio clock. It walks through steps, pages and the
 * song order, schedules sounds slightly ahead of time, and tells the UI about each step at the
 * moment it is heard (via Tone.Draw), so visuals bypass React.
 */
import * as Tone from "tone";
import { STEP_SIZE_QUARTERS, type Pattern, type Step } from "../model/types";
import { useSettings } from "../state/settings";
import { isAudible, useStore } from "../state/store";
import { audioNow, initEngine, startClip, stopAll, stopClip, trigger } from "./engine";
import { click } from "./metronome";
import { startTicker } from "./ticker";

export interface StepEvent {
  slotId: string;
  patternId: string;
  pageStep: number;
  triggered: Set<string>;
}

type Listener = (e: StepEvent) => void;
const listeners = new Set<Listener>();
const stepHooks = new Set<(info: ScheduledStep) => void>();

const LOOKAHEAD = 0.12;

export interface ScheduledStep {
  time: number;
  dur: number;
  slotId: string;
  pattern: Pattern;
  pageStep: number;
  /** Absolute step counter since play. */
  tick: number;
}

let stopTicker: (() => void) | null = null;
let nextTime = 0;
let pageStep = -1;
let tick = 0;
let slotId = "";
let repeatCount = 0;
let countInUntil = 0;
const cycles = new Map<string, number>();
/** Recently scheduled steps, for mapping audio time → position. */
const history: ScheduledStep[] = [];

export function onStep(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Called for every scheduled step, ahead of time (used by recording and the arpeggiator). */
export function onScheduleStep(fn: (s: ScheduledStep) => void): () => void {
  stepHooks.add(fn);
  return () => {
    stepHooks.delete(fn);
  };
}

/** Step length in seconds; swing lengthens even steps and shortens odd ones. */
export function stepDuration(pattern: Pattern, bpm: number, index: number, globalSwing = 0.5) {
  const base = (60 / bpm) * STEP_SIZE_QUARTERS[pattern.stepSize];
  const swing = pattern.swing ?? globalSwing;
  return index % 2 === 0 ? base * 2 * swing : base * (2 - 2 * swing);
}

export function pageDuration(pattern: Pattern, bpm: number, globalSwing = 0.5) {
  let d = 0;
  for (let i = 0; i < pattern.stepCount; i++) d += stepDuration(pattern, bpm, i, globalSwing);
  return d;
}

/** Where the playhead is right now (for progress bars). */
export function position() {
  const s = useStore.getState();
  const slot = s.project.slots.find((x) => x.id === s.playSlotId) ?? s.project.slots[0];
  const pattern = s.project.patterns[slot.patternId];
  const now = audioNow();
  let cur: ScheduledStep | undefined;
  for (let i = history.length - 1; i >= 0; i--)
    if (history[i].time <= now) {
      cur = history[i];
      break;
    }
  if (!s.playing || !cur) return { pattern, pageStep: 0, progress: 0, time: now };
  const frac = Math.min(1, Math.max(0, (now - cur.time) / cur.dur));
  return {
    pattern: cur.pattern,
    pageStep: cur.pageStep,
    progress: (cur.pageStep + frac) / cur.pattern.stepCount,
    time: now,
  };
}

/** The most recent scheduled steps (newest last). */
export function scheduledSteps(): readonly ScheduledStep[] {
  return history;
}

export function isCountingIn() {
  return audioNow() < countInUntil;
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

function stepsPerBeat(pattern: Pattern) {
  return Math.max(1, Math.round(1 / STEP_SIZE_QUARTERS[pattern.stepSize]));
}

function emit(e: StepEvent, time: number) {
  Tone.getDraw().schedule(() => {
    for (const fn of listeners) fn(e);
  }, time);
}

/** Decide which page plays next, at a page end or at a quantized switch point. */
function nextSlot(atPageEnd: boolean, pattern: Pattern): string | null {
  const s = useStore.getState();
  const { slots } = s.project;
  const slot = slots.find((x) => x.id === slotId) ?? slots[0];
  if (s.queuedSlotId && slots.some((x) => x.id === s.queuedSlotId)) {
    if (atPageEnd) return s.queuedSlotId;
    const mode = useSettings.getState().pageSwitch;
    const spb = stepsPerBeat(pattern);
    const beats = s.project.timeSignature[0];
    if (mode === "beat" && pageStep % spb === 0) return s.queuedSlotId;
    if (mode === "bar" && pageStep % (spb * beats) === 0) return s.queuedSlotId;
    return null;
  }
  if (!atPageEnd) return null;
  repeatCount += 1;
  if (s.playMode === "song" && repeatCount >= slot.repeats) {
    return slots[(slots.indexOf(slot) + 1) % slots.length].id;
  }
  return slot.id;
}

function scheduleStep(time: number) {
  const state = useStore.getState();
  const { project } = state;
  let slot = project.slots.find((x) => x.id === slotId) ?? project.slots[0];
  let pattern = project.patterns[slot.patternId];

  pageStep += 1;
  const atEnd = pageStep >= pattern.stepCount;
  const next = pageStep > 0 ? nextSlot(atEnd, pattern) : null;
  if (atEnd || (next && next !== slot.id)) {
    if (atEnd) cycles.set(slot.id, (cycles.get(slot.id) ?? 0) + 1);
    pageStep = 0;
    if (next && next !== slot.id) {
      repeatCount = 0;
      slot = project.slots.find((x) => x.id === next)!;
      pattern = project.patterns[slot.patternId];
      slotId = slot.id;
      const newSlot = slot.id;
      if (state.queuedSlotId) state.setUi({ queuedSlotId: null });
      Tone.getDraw().schedule(() => {
        const s = useStore.getState();
        s.setUi({
          playSlotId: newSlot,
          ...(s.follow && s.editSlotId !== newSlot
            ? { editSlotId: newSlot, selectedSteps: {} }
            : {}),
        });
      }, time);
    }
  }

  const dur = stepDuration(pattern, project.bpm, pageStep, project.swing);
  const fill = state.fillHeld || state.fillLatched;
  const cycle = cycles.get(slot.id) ?? 0;
  const triggered = new Set<string>();
  const spb = stepsPerBeat(pattern);

  if (project.metronome && pageStep % spb === 0) {
    const beat = Math.floor(pageStep / spb);
    click(time, beat % project.timeSignature[0] === 0);
  }

  for (const track of project.tracks) {
    const lane = pattern.lanes[track.id];
    if (!lane) continue;
    const audible = isAudible(track.id, project);
    if (lane.kind === "clip") {
      if (pageStep === 0) {
        if (lane.active) {
          startClip(
            track,
            time,
            pageDuration(pattern, project.bpm, project.swing),
            lane.launchMode === "oneshot",
          );
          if (audible) triggered.add(track.id);
        } else stopClip(track.id, time);
      }
      continue;
    }
    const len = lane.stepCountOverride ?? pattern.stepCount;
    const step: Step = lane.steps[pageStep % len];
    if (!step.on || !audible) continue;
    if (Math.random() >= step.probability) continue;
    if (!conditionPasses(step.condition, cycle, fill)) continue;
    triggered.add(track.id);
    trigger(track, step.accent ? 1 : step.velocity, {
      time: time + step.nudge * dur,
      ratchet: step.ratchet,
      stepDur: dur,
      notes: step.notes,
      lengthSteps: step.length,
      pitch: step.pitch,
      gate: step.gate,
      slide: step.slide,
    });
  }

  const info: ScheduledStep = { time, dur, slotId: slot.id, pattern, pageStep, tick };
  history.push(info);
  if (history.length > 64) history.shift();
  for (const fn of stepHooks) fn(info);
  tick += 1;
  emit({ slotId: slot.id, patternId: pattern.id, pageStep, triggered }, time);
  nextTime = time + dur;
}

function onTick() {
  const horizon = audioNow() + LOOKAHEAD;
  // a stalled main thread (hidden tab, debugger): resync instead of catching up
  if (horizon - nextTime > 1) nextTime = audioNow() + 0.02;
  while (nextTime < horizon) scheduleStep(nextTime);
}

export function play() {
  const s = useStore.getState();
  if (s.playing) return;
  initEngine();
  pageStep = -1;
  tick = 0;
  repeatCount = 0;
  cycles.clear();
  history.length = 0;
  slotId = s.editSlotId;
  s.setUi({ playing: true, playSlotId: s.editSlotId, queuedSlotId: null });
  let start = audioNow() + 0.06;
  const { project } = s;
  if (project.countIn) {
    const beat = 60 / project.bpm;
    const beats = project.timeSignature[0] * useSettings.getState().countInBars;
    for (let i = 0; i < beats; i++) click(start + i * beat, i % project.timeSignature[0] === 0);
    start += beats * beat;
    countInUntil = start;
  }
  nextTime = start;
  stopTicker = startTicker(onTick);
  onTick();
}

export function stop() {
  stopTicker?.();
  stopTicker = null;
  stopAll();
  Tone.getDraw().cancel(0);
  pageStep = -1;
  countInUntil = 0;
  history.length = 0;
  useStore.getState().setUi({ playing: false, queuedSlotId: null });
  for (const fn of listeners) fn({ slotId: "", patternId: "", pageStep: -1, triggered: new Set() });
}

export function toggle() {
  if (useStore.getState().playing) stop();
  else play();
}
