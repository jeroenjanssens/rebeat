/**
 * The transport: a lookahead scheduler on the audio clock. It walks through steps, pages and the
 * song order, schedules sounds slightly ahead of time, and tells the UI about each step at the
 * moment it is heard (via Tone.Draw), so visuals bypass React.
 */
import * as Tone from "tone";
import { blockOf, positionOf, stepPosition, type Block } from "../model/arrangement";
import { secondsBetween, tempoAt } from "../model/tempoMap";
import { laneStepsWithin } from "../model/timing";
import { arpOrder } from "../model/notes";
import type { Project } from "../model/project";
import {
  STEP_SIZE_QUARTERS,
  clipOf,
  type Pattern,
  type Section,
  type Step,
  type Track,
} from "../model/types";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { playingProject } from "../state/automationOverride";
import {
  audioNow,
  heardNow,
  syncDrawToOutput,
  effectsStep,
  initEngine,
  panic,
  startClip,
  stopAll,
  releaseAutomation,
  stopClip,
  tempoStep,
  trigger,
  ungate,
} from "./engine";
import { automationStep, coveredTracks, regionStep } from "./automation";
import { click, silenceMetronome } from "./metronome";
import { notifyTick } from "./load";
import { startTicker } from "./ticker";
import { cancelTapeStop } from "./perf";

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
const LOOKAHEAD = 0.12;

interface ScheduledStep {
  time: number;
  dur: number;
  slotId: string;
  pattern: Pattern;
  pageStep: number;
  /** Absolute step counter since play. */
  tick: number;
  /** Steps the section plays per repeat (its `steps`, else the pattern's). */
  steps: number;
  /** Which repeat of the section. */
  repeat: number;
  /** Where the step is in the song, in quarter notes (D181). */
  songQ: number;
  /** The tempo at the step (D192). */
  bpm: number;
}

let stopTicker: (() => void) | null = null;
let nextTime = 0;
let pageStep = -1;
let tick = 0;
let slotId = "";
let repeatCount = 0;
/** Beat repeat: loop this many steps (from where it was switched on). */
let repeat: { length: number; start: number | null } | null = null;

export function setBeatRepeat(steps: number | null) {
  repeat = steps ? { length: steps, start: null } : null;
}
let firstStepTime = 0;
/** Where the last scheduled step ended in song time (NaN: nothing scheduled yet). */
let lastQ = NaN;
const cycles = new Map<string, number>();
/** Recently scheduled steps, for mapping audio time → position. */
const history: ScheduledStep[] = [];

export function onStep(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The swing multiplier for step `index`; swing=0.5 gives equal lengths (no swing). */
function swingFactor(swing: number, index: number): number {
  return index % 2 === 0 ? 2 * swing : 2 - 2 * swing;
}

/** Step length in seconds; swing lengthens even steps and shortens odd ones. */
export function stepDuration(pattern: Pattern, bpm: number, index: number, globalSwing = 0.5) {
  const base = (60 / bpm) * STEP_SIZE_QUARTERS[pattern.stepSize];
  const swing = pattern.swing ?? globalSwing;
  return base * swingFactor(swing, index);
}

/**
 * A step's length in seconds at song position q (D192): the tempo map's seconds over the step,
 * with the swing's share of each pair of steps. Without tempo changes, the same as stepDuration.
 */
export function stepSeconds(project: Project, pattern: Pattern, q: number, index: number) {
  const stepQ = STEP_SIZE_QUARTERS[pattern.stepSize];
  const base = secondsBetween(project, q, q + stepQ);
  const swing = pattern.swing ?? project.swing;
  return base * swingFactor(swing, index);
}

/** One repeat of a section in seconds: its steps' lengths (with swing) through the tempo map. */
export function repeatSeconds(project: Project, block: Block, repeat: number) {
  let t = 0;
  for (let i = 0; i < block.steps; i++)
    t += stepSeconds(project, block.pattern, stepPosition(block, repeat, i), i);
  return t;
}

/** The FILL conditions pass: held or latched Fill, or the section's own fill (D183). */
export function sectionFill(section: Section | undefined, repeat: number, repeats: number) {
  return section?.fill === "all" || (section?.fill === "last" && repeat === repeats - 1);
}

export function pageDuration(pattern: Pattern, bpm: number, globalSwing = 0.5) {
  let d = 0;
  for (let i = 0; i < pattern.stepCount; i++) d += stepDuration(pattern, bpm, i, globalSwing);
  return d;
}

/** Where the song is that you hear right now (D278): `positionAt` the heard time, for visuals
 * that follow the music (the tracker's playhead). */
export const heardPosition = () => positionAt(heardNow());

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
  if (!s.playing || !cur)
    return { pattern, pageStep: 0, progress: 0, sectionProgress: 0, time: now };
  const frac = Math.min(1, Math.max(0, (now - cur.time) / cur.dur));
  return {
    pattern: cur.pattern,
    pageStep: cur.pageStep,
    /** Through the pattern (for recording). */
    progress: (cur.pageStep + frac) / cur.pattern.stepCount,
    /** Through the steps the section plays (for progress bars). */
    sectionProgress: (cur.pageStep + frac) / cur.steps,
    time: now,
  };
}

/** The current step (the newest one heard by now), or null while stopped. */
function currentStep(time = audioNow()): ScheduledStep | null {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].time <= time) return history[i];
  return null;
}

/** The playhead in song time, quarter notes (null while stopped or counting in). */
export function songPosition(): number | null {
  const now = audioNow();
  const cur = currentStep(now);
  if (!useStore.getState().playing || !cur) return null;
  const frac = Math.min(1, Math.max(0, (now - cur.time) / cur.dur));
  return cur.songQ + frac * STEP_SIZE_QUARTERS[cur.pattern.stepSize];
}

/** Where Play starts (D190): the start marker in the edited section, else its start. */
export function startPosition(): number {
  const s = useStore.getState();
  const block = blockOf(s.project, s.editSlotId) ?? blockOf(s.project, s.project.slots[0].id);
  if (!block) return 0;
  const at = s.startAt?.slotId === block.section.id ? s.startAt.at : 0;
  return block.start + Math.min(at, block.span - 1e-6);
}

/** The tempo now (D192): the playing step's, else the tempo where Play starts. */
export function tempoNow(): number {
  const s = useStore.getState();
  const cur = s.playing ? currentStep() : null;
  return cur?.bpm ?? tempoAt(playingProject(s.project), startPosition());
}

/**
 * Where the song is at an audio time (D164): the page (slot) and the step playing then, from the
 * steps scheduled so far (they go 120 ms ahead), so a note recorded with its time lands in its own
 * page, after a count-in and across page changes too. Before the first step: its page, at 0.
 */
export function positionAt(time: number) {
  const s = useStore.getState();
  let cur: ScheduledStep | undefined;
  for (let i = history.length - 1; i >= 0; i--)
    if (history[i].time <= time + 1e-6) {
      cur = history[i];
      break;
    }
  if (!cur) {
    const first = history[0];
    const slotId = first?.slotId ?? s.playSlotId;
    const slot = s.project.slots.find((x) => x.id === slotId) ?? s.project.slots[0];
    return {
      slotId: slot.id,
      pattern: first?.pattern ?? s.project.patterns[slot.patternId],
      pageStep: 0,
      progress: 0,
      songQ: first?.songQ ?? startPosition(),
    };
  }
  const frac = Math.min(1, Math.max(0, (time - cur.time) / cur.dur));
  return {
    slotId: cur.slotId,
    pattern: cur.pattern,
    pageStep: cur.pageStep,
    progress: (cur.pageStep + frac) / cur.pattern.stepCount,
    /** Where that is in song time (D181). */
    songQ: cur.songQ + frac * STEP_SIZE_QUARTERS[cur.pattern.stepSize],
  };
}

/** The most recent scheduled steps (newest last). */
export function scheduledSteps(): readonly ScheduledStep[] {
  return history;
}

/** Audio time of the next beat while playing (for starting things in time). */
export function nextBeatTime(): number | null {
  const now = audioNow();
  let cur: ScheduledStep | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].time <= now) {
      cur = history[i];
      break;
    }
  }
  if (!cur) return null;
  const spb = stepsPerBeat(cur.pattern);
  const left = spb - (cur.pageStep % spb);
  return cur.time + left * (60 / cur.bpm) * STEP_SIZE_QUARTERS[cur.pattern.stepSize];
}

/** Audio time of the next bar line while playing. */
export function nextBarTime(): number | null {
  const now = audioNow();
  let cur: ScheduledStep | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].time <= now) {
      cur = history[i];
      break;
    }
  }
  cur ??= history[0];
  if (!cur) return null;
  const spb = stepsPerBeat(cur.pattern);
  const bar = spb * useStore.getState().project.timeSignature[0];
  const stepSec = (60 / cur.bpm) * STEP_SIZE_QUARTERS[cur.pattern.stepSize];
  const left = bar - (cur.pageStep % bar);
  return cur.time + left * stepSec;
}

/** When the first step plays (after any count-in), for the current run. */
export function playStartTime() {
  return firstStepTime;
}

export function conditionPasses(
  condition: string | undefined,
  cycle: number,
  fill: boolean,
): boolean {
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
  if (s.project.playMode === "song" && repeatCount >= slot.repeats) {
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

export interface StepContext {
  /** The section playing (its mutes and transpose, D183). */
  section?: Section;
  /** The tempo at the step (D192); default the project's. */
  bpm?: number;
  /** How long the section's repeat lasts, for clips (default: the pattern at the step's tempo). */
  repeatDur?: number;
  /** Tracks whose timeline audio sounds here: their own clips stay silent (D188). */
  covered?: Set<string>;
}

/**
 * Play every track's sound for one step of a section (shared by the live transport and offline
 * rendering). Fills `triggered` and `laneSteps` for the visuals.
 */
export function playStep(
  project: Project,
  pattern: Pattern,
  pageStep: number,
  time: number,
  dur: number,
  cycle: number,
  fill: boolean,
  triggered = new Set<string>(),
  laneSteps = new Map<string, number>(),
  ctx: StepContext = {},
) {
  const bpm = ctx.bpm ?? project.bpm;
  const qPage = STEP_SIZE_QUARTERS[pattern.stepSize];
  const secPerQ = 60 / bpm;
  const mutes = ctx.section?.mutes;
  const transpose = (pattern.transpose ?? 0) + (ctx.section?.transpose ?? 0) || undefined;
  // compute anySolo once so isAudible doesn't re-scan tracks per track per step
  const anySolo = project.tracks.some((t) => t.solo);
  effectsStep(time, pageStep * qPage, qPage, secPerQ);
  for (const track of project.tracks) {
    const lane = pattern.lanes[track.id];
    if (!lane) continue;
    // muted in this section (D183): silent here, its clones play it
    const mutedHere = !!mutes?.includes(track.id);
    const audible = !track.mute && (!anySolo || track.solo) && !mutedHere;
    if (track.mode === "clip") {
      const clip = clipOf(lane);
      if (pageStep === 0) {
        // a muted track's clip still starts (unmuting brings it back); muted here, or with
        // timeline audio playing on the track, it doesn't
        if (clip.active && !mutedHere && !ctx.covered?.has(track.id)) {
          startClip(
            track,
            time,
            ctx.repeatDur ?? pageDuration(pattern, bpm, project.swing),
            clip.launchMode === "oneshot",
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
      // Hits keep the notes a track had in Notes mode, but don't play them
      const notes = track.mode === "notes" ? step.notes : undefined;
      if (track.arp?.on && notes?.length) {
        arpeggiate(track, step, t, d, transpose ?? 0, bpm);
        return;
      }
      trigger(track, step.accent ? 1 : step.velocity, {
        transpose,
        time: t + step.nudge * d,
        ratchet: step.ratchet,
        stepDur: d,
        notes: step.accent ? notes?.map((n) => ({ ...n, velocity: 1 })) : notes,
        pitch: step.pitch,
        gate: step.gate,
        locks: step.locks,
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
}

/** The block of a section, or the first one (a section that was just deleted). */
function blockFor(project: Project, id: string): Block {
  return blockOf(project, id) ?? blockOf(project, project.slots[0].id)!;
}

function scheduleStep(time: number) {
  const state = useStore.getState();
  // a tempo typed over the tempo changes plays instead of them (D193)
  const project = playingProject(state.project);
  let block = blockFor(project, slotId);
  let slot = block.section;
  let pattern = block.pattern;

  pageStep += 1;
  if (repeat) {
    repeat.start ??= Math.max(0, Math.floor((pageStep - 1) / repeat.length) * repeat.length);
    if (pageStep >= repeat.start + repeat.length || pageStep >= block.steps)
      pageStep = repeat.start;
  }
  const atEnd = pageStep >= block.steps;
  const next = pageStep > 0 ? nextSlot(atEnd, pattern) : null;
  if (next === END) {
    // the song is over: stop when the last section has been heard
    ending = true;
    Tone.getDraw().schedule(() => stop(), time);
    return;
  }
  if (atEnd || (next && next !== slot.id)) {
    if (atEnd) cycles.set(slot.id, (cycles.get(slot.id) ?? 0) + 1);
    pageStep = 0;
    if (next && next !== slot.id) {
      repeatCount = 0;
      block = blockFor(project, next);
      slot = block.section;
      pattern = block.pattern;
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

  // in Loop mode the section's repeats go round, so its automation and tempo do too
  const rep = repeatCount % block.repeats;
  const songQ = stepPosition(block, rep, pageStep);
  const dur = stepSeconds(project, pattern, songQ, pageStep);
  const bpm = tempoAt(project, songQ + block.stepQ / 2);
  const fill = state.fillHeld || state.fillLatched || sectionFill(slot, rep, block.repeats);
  const cycle = cycles.get(slot.id) ?? 0;
  const triggered = new Set<string>();
  const laneSteps = new Map<string, number>();
  const spb = stepsPerBeat(pattern);

  if (project.metronome && pageStep % spb === 0) {
    const beat = Math.floor(pageStep / spb);
    click(time, beat % project.timeSignature[0] === 0);
  }

  const repeatDur = pageStep === 0 ? repeatSeconds(project, block, rep) : 0;
  tempoStep(bpm, time);
  // automation and timeline audio follow song time; a jump (a start, a queued section, a loop
  // going round) sets the lanes' values there, and in Song mode starts audio already playing
  const q1 = songQ + block.stepQ;
  // (the first step has nothing before it: lastQ is NaN, and that's a jump too)
  const jumped = !(Math.abs(songQ - lastQ) <= 1e-6);
  lastQ = q1;
  automationStep(project, songQ, q1, time, dur);
  regionStep(project, songQ, q1, time, dur, jumped && project.playMode === "song");
  playStep(project, pattern, pageStep, time, dur, cycle, fill, triggered, laneSteps, {
    section: slot,
    bpm,
    repeatDur,
    covered: pageStep === 0 ? coveredTracks(project, songQ) : undefined,
  });

  const info: ScheduledStep = {
    time,
    dur,
    slotId: slot.id,
    pattern,
    pageStep,
    tick,
    steps: block.steps,
    repeat: rep,
    songQ,
    bpm,
  };
  history.push(info);
  if (history.length > 64) history.shift();
  tick += 1;
  emit({ slotId: slot.id, patternId: pattern.id, pageStep, triggered, laneSteps }, time);
  nextTime = time + dur;
}

function onTick() {
  notifyTick();
  const horizon = audioNow() + LOOKAHEAD;
  // a stalled main thread (hidden tab, debugger): resync instead of catching up
  if (horizon - nextTime > 1) nextTime = audioNow() + 0.02;
  while (nextTime < horizon && !ending) scheduleStep(nextTime);
}

/** Play from the edited section, at the start marker if there is one (D190). */
export function play() {
  const s = useStore.getState();
  if (s.playing) return;
  cancelTapeStop();
  initEngine();
  // tracks muted by a stop open again
  ungate();
  const { project } = s;
  const from = startPosition();
  const at = positionOf(project, from);
  tick = 0;
  ending = false;
  cycles.clear();
  history.length = 0;
  lastQ = NaN;
  slotId = at.block.section.id;
  // start inside the section: its repeat (for 1:2 conditions) and the step before
  repeatCount = at.repeat;
  if (at.repeat) cycles.set(slotId, at.repeat);
  pageStep = at.step - 1;
  s.setUi({ playing: true, playSlotId: slotId, queuedSlotId: null });
  // the step lights show what's heard (D278); the output's latency can change between plays
  syncDrawToOutput();
  let start = audioNow() + 0.06;
  if (project.countIn) {
    const beat = 60 / tempoAt(playingProject(project), from);
    const beats = project.timeSignature[0] * useSettings.getState().countInBars;
    for (let i = 0; i < beats; i++) click(start + i * beat, i % project.timeSignature[0] === 0);
    start += beats * beat;
  }
  nextTime = start;
  firstStepTime = start;
  stopTicker = startTicker(onTick);
  onTick();
}

export function stop() {
  stopTicker?.();
  stopTicker = null;
  // silence at once (D99), unless the tails may ring out
  if (useSettings.getState().ringOutOnStop) stopAll();
  else panic();
  silenceMetronome();
  tempoStep(null, audioNow());
  releaseAutomation();
  // library previews too: stop means quiet
  void import("../library/audition").then((a) => (a.stopPreview(), a.stopAudition()));
  Tone.getDraw().cancel(0);
  pageStep = -1;
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
