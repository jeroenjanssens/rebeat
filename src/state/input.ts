/**
 * Playing pads and notes: step entry while stopped (writes at the step cursor and moves on) and
 * live recording while playing. Supports Overdub (adds notes, keeps what's there) and Replace
 * (clears a step the first time you play onto it per loop pass). Snap on = starts and lengths
 * snap to Q's grid; Snap off = exact timing stored as Note.offset (D127, D128).
 */
import { position } from "../engine/transport";
import { audioContext } from "../engine/context";
import { chordInKey, snapToKey } from "../model/notes";
import { pageKey, slotPattern } from "../model/project";
import {
  STEP_SIZE_QUARTERS,
  setStepVelocity,
  type Note,
  type Step,
  type StepSize,
  type Track,
} from "../model/types";
import { laneLen, switchStep, toggleSelectedSteps } from "./actions";
import { stepped } from "../model/tracks";
import { useStore } from "./store";
import { useSettings } from "./settings";

const get = () => useStore.getState();

const QUANTIZE_QUARTERS: Record<string, number> = {
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
  "1/32": 0.125,
};

function writeStep(trackId: string, index: number, fn: (s: Step) => void, key: string) {
  get().commit((p) => {
    const s = get();
    const lane = slotPattern(p, s.playing ? s.playSlotId : s.editSlotId).lanes[trackId];
    if (lane && stepped(p, trackId)) fn(lane.steps[index]);
  }, key);
}

function apply(step: Step, velocity: number, notes?: number[], nudge = 0, merge = false) {
  step.on = true;
  step.velocity = velocity;
  step.nudge = nudge;
  if (notes) {
    // notes played together build a chord; a new hit replaces what was there
    const kept = merge ? (step.notes ?? []).filter((n) => !notes.includes(n.pitch)) : [];
    step.notes = [...kept, ...notes.map((pitch) => ({ pitch, length: 1, velocity }))].sort(
      (a, b) => a.pitch - b.pitch,
    );
  }
}

let chordWindow = { at: 0, index: -1, trackId: "" };

// ── Replace mode: track which steps have been punched in this loop pass ─────────────────────

/** Incremented each time we detect the loop has wrapped around. */
let replaceCycle = 0;
/** The loop progress the last time we recorded, for wrap detection. */
let lastRecordProgress = 0;
/** trackId → step index → replaceCycle when that step was first punched. */
const punchedSteps = new Map<string, Map<number, number>>();

/**
 * Check whether progress has wrapped (decreased by more than half a loop), which means the
 * transport has looped. Returns true when a wrap is detected.
 */
function detectLoopWrap(progress: number): boolean {
  const wrapped = progress < lastRecordProgress - 0.5;
  lastRecordProgress = progress;
  if (wrapped) replaceCycle++;
  return wrapped;
}

/**
 * Return true if a step in Replace mode should be cleared (first hit this pass).
 * If so, marks it as punched for this cycle.
 */
function shouldPunch(trackId: string, stepIndex: number): boolean {
  let track = punchedSteps.get(trackId);
  if (!track) {
    track = new Map();
    punchedSteps.set(trackId, track);
  }
  const cycle = track.get(stepIndex);
  if (cycle === replaceCycle) return false; // already punched this pass
  track.set(stepIndex, replaceCycle);
  return true;
}

// ── In-flight notes: note-on written, waiting for note-off to get real length ────────────

interface InflightNote {
  id: number;
  trackId: string;
  pitch: number;
  /** Quantized (or rounded) step index where the note was placed. */
  stepIndex: number;
  /**
   * Floating-point step position at note-on (in lane step units), after latency correction.
   * Used to compute the real length when note-off arrives.
   */
  startExact: number;
  /** Loop-progress at note-on, to detect wraps on note-off. */
  startProgress: number;
}

let nextNoteId = 0;
const inflightNotes = new Map<number, InflightNote>();

// ── Shared step-position computation ────────────────────────────────────────────────────────

interface StepPos {
  exact: number; // floating-point lane step index
  len: number; // lane step count
  laneQ: number; // lane step size in quarter-notes
  grid: number; // quantize grid in lane steps
}

function computeStepPos(
  patternStepSize: string,
  laneStepSizeOverride: string | undefined,
  patternStepCount: number,
  laneStepCountOverride: number | undefined,
  bpm: number,
  progress: number,
  quantize: string,
): StepPos {
  const ctx = audioContext();
  const latency = ctx.outputLatency || ctx.baseLatency || 0;
  const patternQ = STEP_SIZE_QUARTERS[patternStepSize as StepSize];
  const laneQ = STEP_SIZE_QUARTERS[(laneStepSizeOverride ?? patternStepSize) as StepSize];
  const ratio = patternQ / laneQ;
  const len = laneStepCountOverride ?? Math.round(patternStepCount * ratio);
  const laneStepSec = (60 / bpm) * laneQ;
  const q = QUANTIZE_QUARTERS[quantize] ?? 0.25;
  const grid = Math.max(1, Math.round(q / laneQ));
  const exact = progress * patternStepCount * ratio - latency / laneStepSec;
  return { exact, len, laneQ, grid };
}

/** A pad or note was played by the user (mouse, touch, keyboard or MIDI). */
export function padInput(track: Track, velocity: number, notes?: number[]) {
  const s = get();
  if (track.mode === "clip") return;

  if (s.playing && s.recording) {
    const pos = position();
    const slot = s.project.slots.find((x) => x.id === s.playSlotId)!;
    const pattern = s.project.patterns[slot.patternId];
    const lane = pattern.lanes[track.id];
    if (!lane) return;

    detectLoopWrap(pos.progress);

    const { exact, len, grid } = computeStepPos(
      pattern.stepSize,
      lane.stepSizeOverride,
      pattern.stepCount,
      lane.stepCountOverride,
      s.project.bpm,
      pos.progress,
      s.quantize,
    );
    const { snap, recordMode } = useSettings.getState();
    let index: number;
    let nudge = 0;
    if (snap) {
      index = Math.round(exact / grid) * grid;
    } else {
      index = Math.round(exact);
      nudge = Math.max(-0.5, Math.min(0.5, exact - index));
    }
    index = ((Math.round(index) % len) + len) % len;

    const doClear =
      recordMode === "replace" && track.mode !== "notes" && shouldPunch(track.id, index);

    writeStep(
      track.id,
      index,
      (st) => {
        if (doClear) {
          // Replace: clear the step first
          st.on = false;
          st.notes = undefined;
        }
        apply(st, velocity, notes, nudge, !doClear);
      },
      `rec-${track.id}`,
    );
    return;
  }

  const cursor = s.cursor;
  if (!s.playing && cursor) {
    const now = performance.now();
    // notes hit together (within 60 ms) go into the same step
    const sameChord =
      notes &&
      chordWindow.trackId === track.id &&
      now - chordWindow.at < 60 &&
      chordWindow.index >= 0;
    const index = sameChord ? chordWindow.index : cursor.index;
    writeStep(track.id, index, (st) => apply(st, velocity, notes, 0, !!sameChord), `entry-${now}`);
    chordWindow = { at: now, index, trackId: track.id };
    if (!sameChord) {
      const len = laneLen(track.id);
      s.setUi({
        cursor: { trackId: track.id, index: (index + 1) % len },
        selectedTrackId: track.id,
      });
    }
  }
}

/** What a played note becomes: snapped to the key (scale lock) and/or a chord (chord mode). */
export function playedNotes(midi: number): number[] {
  const s = get();
  const key = pageKey(s.project, slotPattern(s.project, s.editSlotId));
  const root = s.scaleLock ? snapToKey(midi, key) : midi;
  if (s.chordMode === "off") return [root];
  return chordInKey(root, key, s.chordMode === "seventh" ? 4 : 3);
}

// ── Live note recording (called by WS-A's keys.ts) ───────────────────────────────────────────

/**
 * A note was played on the keys while the transport is running. Writes a provisional note to the
 * step and returns an id for `recordNoteOff` to complete it with the real length. Returns null
 * when not recording or the track is not a Notes track.
 *
 * When the transport is stopped, falls back to step entry (same as padInput) and returns null.
 * The caller (keys.ts / WS-A) already plays the note's audio through the live voice.
 */
export function recordNoteOn(track: Track, pitch: number, velocity: number): number | null {
  const trackId = track.id;
  const s = get();

  // Stopped: step entry
  if (!s.playing) {
    if (track.mode === "clip") return null;
    if (track.mode !== "notes") return null; // padInput handles Hits
    const now = performance.now();
    const sameChord =
      chordWindow.trackId === trackId &&
      now - chordWindow.at < 60 &&
      chordWindow.index >= 0;
    const cursor = s.cursor;
    const index = sameChord ? chordWindow.index : (cursor?.trackId === trackId ? cursor.index : 0);
    writeStep(
      trackId,
      index,
      (st) => apply(st, velocity, [pitch], 0, !!sameChord),
      `entry-${now}`,
    );
    chordWindow = { at: now, index, trackId };
    if (!sameChord) {
      const len = laneLen(trackId);
      s.setUi({
        cursor: { trackId, index: (index + 1) % len },
        selectedTrackId: trackId,
      });
    }
    return null;
  }

  if (!s.recording) return null;

  const slot = s.project.slots.find((x) => x.id === s.playSlotId);
  if (!slot) return null;
  const pattern = s.project.patterns[slot.patternId];
  const lane = pattern.lanes[trackId];
  if (!lane) return null;
  if (track.mode !== "notes") return null;

  const pos = position();
  detectLoopWrap(pos.progress);

  const { exact, len, laneQ, grid } = computeStepPos(
    pattern.stepSize,
    lane.stepSizeOverride,
    pattern.stepCount,
    lane.stepCountOverride,
    s.project.bpm,
    pos.progress,
    s.quantize,
  );
  const { snap, recordMode } = useSettings.getState();

  let stepIndex: number;
  let noteOffset: number | undefined;

  if (snap) {
    stepIndex = Math.round(exact / grid) * grid;
  } else {
    stepIndex = Math.round(exact);
    const rawOffset = exact - stepIndex;
    if (Math.abs(rawOffset) >= 0.001) {
      noteOffset = Math.max(-0.5, Math.min(0.5, rawOffset));
    }
  }
  stepIndex = ((Math.round(stepIndex) % len) + len) % len;

  const doClear = recordMode === "replace" && shouldPunch(trackId, stepIndex);

  const id = nextNoteId++;
  const noteVel = Math.max(0, Math.min(1, velocity));

  // Build provisional note (length 1 grid unit)
  const provisionalLen = snap ? grid : Math.max(0.05, laneQ * 4); // 0.05 steps min
  const provisionalNote: Note = {
    pitch,
    length: provisionalLen,
    velocity: noteVel,
    ...(noteOffset !== undefined ? { offset: noteOffset } : {}),
  };

  writeStep(
    trackId,
    stepIndex,
    (st) => {
      if (doClear) {
        st.notes = undefined;
        st.on = false;
      }
      // Overdub: keep existing notes at other pitches; replace same pitch
      const kept = (st.notes ?? []).filter((n) => n.pitch !== pitch);
      st.notes = [...kept, provisionalNote].sort((a, b) => a.pitch - b.pitch);
      st.on = true;
      st.velocity = Math.max(noteVel, ...kept.map((n) => n.velocity));
    },
    `rec-${trackId}`,
  );

  inflightNotes.set(id, {
    id,
    trackId,
    pitch,
    stepIndex,
    startExact: exact,
    startProgress: pos.progress,
  });

  return id;
}

/**
 * The note started by recordNoteOn(id) was released (or the sustain pedal released it).
 * Computes the real length and updates the note in the store.
 */
export function recordNoteOff(id: number | null): void {
  if (id === null) return;
  const inf = inflightNotes.get(id);
  if (!inf) return;
  inflightNotes.delete(id);

  const s = get();
  if (!s.playing || !s.recording) return;

  const slot = s.project.slots.find((x) => x.id === s.playSlotId);
  if (!slot) return;
  const pattern = s.project.patterns[slot.patternId];
  const lane = pattern.lanes[inf.trackId];
  if (!lane) return;

  const pos = position();
  const patternQ = STEP_SIZE_QUARTERS[pattern.stepSize];
  const laneQ = STEP_SIZE_QUARTERS[lane.stepSizeOverride ?? pattern.stepSize];
  const ratio = patternQ / laneQ;
  const len = lane.stepCountOverride ?? Math.round(pattern.stepCount * ratio);
  const { snap } = useSettings.getState();
  const q = QUANTIZE_QUARTERS[s.quantize] ?? 0.25;
  const grid = Math.max(1, Math.round(q / laneQ));

  // Current exact position in lane steps (same latency correction as note-on)
  const ctx = audioContext();
  const latency = ctx.outputLatency || ctx.baseLatency || 0;
  const laneStepSec = (60 / s.project.bpm) * laneQ;
  const nowExact = pos.progress * pattern.stepCount * ratio - latency / laneStepSec;

  // Length = distance from note-on to note-off; wraps across page if note-off is earlier
  let rawLen = nowExact - inf.startExact;
  if (rawLen <= 0) rawLen += len; // wrapped around
  rawLen = Math.max(rawLen, 0.05); // at least 0.05 steps
  rawLen = Math.min(rawLen, len); // at most page length

  let noteLen: number;
  if (snap) {
    noteLen = Math.max(grid, Math.round(rawLen / grid) * grid);
  } else {
    noteLen = Math.max(0.05, rawLen);
  }

  // Update the note's length in the step (same undo key → merges with the note-on write)
  get().commit((p) => {
    const sl = get();
    const pat = slotPattern(p, sl.playSlotId);
    const ln = pat.lanes[inf.trackId];
    if (!ln || !stepped(p, inf.trackId)) return;
    const step = ln.steps[inf.stepIndex];
    const note = step.notes?.find((n) => n.pitch === inf.pitch);
    if (!note) return;
    note.length = noteLen;
    // Recompute step velocity as the loudest note
    if (step.notes?.length) {
      step.velocity = Math.max(...step.notes.map((n) => n.velocity));
    }
  }, `rec-${inf.trackId}`);
}

// ---------- keyboard step cursor ----------

export function moveCursor(dx: number, dy: number) {
  const s = get();
  const tracks = s.project.tracks;
  const pattern = slotPattern(s.project, s.editSlotId);
  const c = s.cursor ?? { trackId: s.selectedTrackId, index: 0 };
  let ti = tracks.findIndex((t) => t.id === c.trackId);
  if (!s.cursor) {
    s.setUi({ cursor: c });
    return;
  }
  ti = Math.min(tracks.length - 1, Math.max(0, ti + dy));
  // skip Clip tracks: their steps don't play
  while (tracks[ti].mode === "clip" && ti > 0 && ti < tracks.length - 1) ti += dy || 1;
  const trackId = tracks[ti].id;
  if (tracks[ti].mode === "clip" || !pattern.lanes[trackId]) return;
  const len = laneLen(trackId);
  const index = (((c.index + dx) % len) + len) % len;
  s.setUi({ cursor: { trackId, index }, selectedTrackId: trackId });
}

export function cursorToggle() {
  if (toggleSelectedSteps()) return;
  const c = get().cursor;
  if (!c) return moveCursor(0, 0);
  const s = get();
  const lane = slotPattern(s.project, s.editSlotId).lanes[c.trackId];
  if (!lane || !stepped(s.project, c.trackId)) return;
  const on = !lane.steps[c.index].on;
  writeStep(
    c.trackId,
    c.index,
    (st) => {
      const track = s.project.tracks.find((t) => t.id === c.trackId);
      if (track) switchStep(st, track, on);
      else st.on = on;
    },
    `cursor-${performance.now()}`,
  );
}

/** 1–9: velocity of the selected steps, or of the step under the cursor. */
export function velocityDigit(d: number) {
  const s = get();
  const v = d / 9;
  const keys = Object.keys(s.selectedSteps);
  if (keys.length) {
    s.commit((p) => {
      const pattern = slotPattern(p, s.editSlotId);
      for (const k of keys) {
        const [t, i] = k.split(":");
        const lane = pattern.lanes[t];
        if (lane && stepped(p, t)) setStepVelocity(lane.steps[Number(i)], v);
      }
    }, "vel-digit");
    return;
  }
  const c = s.cursor;
  if (c)
    writeStep(
      c.trackId,
      c.index,
      (st) => {
        st.on = true;
        setStepVelocity(st, v);
      },
      "vel-digit",
    );
}
