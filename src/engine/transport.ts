/**
 * The transport: a lookahead scheduler on the audio clock. It walks through steps, pages and the
 * song order, schedules sounds slightly ahead of time, and tells the UI about each step at the
 * moment it is heard (via Tone.Draw), so visuals bypass React.
 */
import * as Tone from "tone";
import { laneStepsWithin } from "../model/timing";
import { arpOrder } from "../model/notes";
import { STEP_SIZE_QUARTERS, type Pattern, type Step, type Track } from "../model/types";
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
  /** Current step index per track (differs from pageStep for tracks with their own length/rate). */
  laneSteps: Map<string, number>;
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
let firstStepTime = 0;
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

/** Audio time of the next beat while playing (for starting things in time). */
export function nextBeatTime(): number | null {
  const now = audioNow();
  const cur = [...history].reverse().find((h) => h.time <= now);
  if (!cur) return null;
  const spb = stepsPerBeat(cur.pattern);
  const left = spb - (cur.pageStep % spb);
  return (
    cur.time +
    left * (60 / useStore.getState().project.bpm) * STEP_SIZE_QUARTERS[cur.pattern.stepSize]
  );
}

/** Audio time of the next bar line while playing. */
export function nextBarTime(): number | null {
  const now = audioNow();
  const cur = [...history].reverse().find((h) => h.time <= now) ?? history[0];
  if (!cur) return null;
  const spb = stepsPerBeat(cur.pattern);
  const bar = spb * useStore.getState().project.timeSignature[0];
  const stepSec = (60 / useStore.getState().project.bpm) * STEP_SIZE_QUARTERS[cur.pattern.stepSize];
  const left = bar - (cur.pageStep % bar);
  return cur.time + left * stepSec;
}

/** When the first step plays (after any count-in), for the current run. */
export function playStartTime() {
  return firstStepTime;
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
    const i = slots.indexOf(slot);
    if (i === slots.length - 1 && !s.songLoop) return END;
    return slots[(i + 1) % slots.length].id;
  }
  return slot.id;
}

const END = "__end";
let ending = false;

/** Play a step's chord as an arpeggio over the length of its longest note. */
function arpeggiate(
  track: Track,
  step: Step,
  time: number,
  stepDur: number,
  transpose: number,
  bpm: number,
) {
  const arp = track.arp!;
  const notes = [...step.notes!].sort((a, b) => a.pitch - b.pitch);
  const total = Math.max(...notes.map((n) => n.length)) * stepDur;
  const rate = STEP_SIZE_QUARTERS[arp.rate] * (60 / bpm);
  const order = arpOrder(
    notes.map((n) => n.pitch),
    arp.mode,
    arp.octaves,
  );
  const count = Math.max(1, Math.round(total / rate));
  for (let k = 0; k < count; k++) {
    const pitch =
      order[arp.mode === "random" ? Math.floor(Math.random() * order.length) : k % order.length];
    trigger(track, step.velocity, {
      time: time + k * rate,
      stepDur: rate,
      transpose,
      notes: [
        { pitch, length: Math.max(0.05, arp.gate), velocity: step.accent ? 1 : notes[0].velocity },
      ],
    });
  }
}

function scheduleStep(time: number) {
  const state = useStore.getState();
  const { project } = state;
  let slot = project.slots.find((x) => x.id === slotId) ?? project.slots[0];
  let pattern = project.patterns[slot.patternId];

  pageStep += 1;
  const atEnd = pageStep >= pattern.stepCount;
  const next = pageStep > 0 ? nextSlot(atEnd, pattern) : null;
  if (next === END) {
    // the song is over: stop when the last page has been heard
    ending = true;
    Tone.getDraw().schedule(() => stop(), time);
    return;
  }
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
  const laneSteps = new Map<string, number>();
  const spb = stepsPerBeat(pattern);
  const qPage = STEP_SIZE_QUARTERS[pattern.stepSize];
  const secPerQ = 60 / project.bpm;

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
    const play = (step: Step, t: number, d: number) => {
      if (!step.on || !audible) return;
      if (Math.random() >= step.probability) return;
      if (!conditionPasses(step.condition, cycle, fill)) return;
      triggered.add(track.id);
      if (track.arp?.on && step.notes?.length) {
        arpeggiate(track, step, t, d, pattern.transpose ?? 0, project.bpm);
        return;
      }
      trigger(track, step.accent ? 1 : step.velocity, {
        transpose: pattern.transpose,
        time: t + step.nudge * d,
        ratchet: step.ratchet,
        stepDur: d,
        notes: step.accent ? step.notes?.map((n) => ({ ...n, velocity: 1 })) : step.notes,
        pitch: step.pitch,
        gate: step.gate,
      });
    };
    if (!lane.stepSizeOverride || lane.stepSizeOverride === pattern.stepSize) {
      laneSteps.set(track.id, pageStep % len);
      let t = time;
      if (lane.swingOverride !== undefined && pageStep % 2 === 1) {
        // move the off-beat step from the page's swing to the track's own
        const pageSwing = pattern.swing ?? project.swing;
        t += qPage * secPerQ * 2 * (lane.swingOverride - pageSwing);
      }
      play(lane.steps[pageStep % len], t, dur);
      continue;
    }
    // a track with its own rate: play the lane steps that start within this page step
    const qLane = STEP_SIZE_QUARTERS[lane.stepSizeOverride];
    const within = laneStepsWithin(pageStep, qPage, qLane, len);
    laneSteps.set(track.id, within.current);
    for (const { index, offsetQ } of within.steps)
      play(lane.steps[index], time + offsetQ * secPerQ, qLane * secPerQ);
  }

  const info: ScheduledStep = { time, dur, slotId: slot.id, pattern, pageStep, tick };
  history.push(info);
  if (history.length > 64) history.shift();
  for (const fn of stepHooks) fn(info);
  tick += 1;
  emit({ slotId: slot.id, patternId: pattern.id, pageStep, triggered, laneSteps }, time);
  nextTime = time + dur;
}

function onTick() {
  const horizon = audioNow() + LOOKAHEAD;
  // a stalled main thread (hidden tab, debugger): resync instead of catching up
  if (horizon - nextTime > 1) nextTime = audioNow() + 0.02;
  while (nextTime < horizon && !ending) scheduleStep(nextTime);
}

export function play() {
  const s = useStore.getState();
  if (s.playing) return;
  initEngine();
  pageStep = -1;
  tick = 0;
  ending = false;
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
  firstStepTime = start;
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
  const e = {
    slotId: "",
    patternId: "",
    pageStep: -1,
    triggered: new Set<string>(),
    laneSteps: new Map(),
  };
  for (const fn of listeners) fn(e);
}

export function toggle() {
  if (useStore.getState().playing) stop();
  else play();
}
