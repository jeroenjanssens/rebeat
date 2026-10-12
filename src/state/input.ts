/**
 * Playing pads and notes: step entry while stopped (writes at the step cursor and moves on) and
 * live recording while playing. Supports Overdub (adds notes, keeps what's there) and Replace
 * (clears a step the first time you play onto it per loop pass). Snap on = starts and lengths
 * snap to Q's grid; Snap off = exact timing stored as Note.offset (D127, D128).
 */
import { position, positionAt } from "../engine/transport";
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

function writeStep(
  trackId: string,
  index: number,
  fn: (s: Step) => void,
  key: string,
  slotId?: string,
) {
  get().commit((p) => {
    const s = get();
    const slot = slotId ?? (s.playing ? s.playSlotId : s.editSlotId);
    const lane = slotPattern(p, slot).lanes[trackId];
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
  /** The page (slot) it was recorded in: a timed note's own (D164). */
  slotId: string;
  /** On its musical grid (D175): its length isn't snapped either. */
  onGrid?: boolean;
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
  const root = keyRoot(midi);
  if (s.chordMode === "off") return [root];
  return chordInKey(root, key, s.chordMode === "seventh" ? 4 : 3);
}

/** A played note snapped to the page's key when scale lock is on (the root of its chord). */
export function keyRoot(midi: number): number {
  const s = get();
  if (!s.scaleLock) return midi;
  return snapToKey(midi, pageKey(s.project, slotPattern(s.project, s.editSlotId)));
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
/**
 * When a recorded note sounds (play styles, D149): `at`, the audio time of its hit (the moment
 * the grid or the key gave it; default now), and `spread`, how much later the note itself starts
 * (a strum's or slop's delay, in seconds). Snap snaps the hit; the spread stays as the note's
 * offset, so a strum survives Snap.
 */
export interface RecordTiming {
  at?: number;
  spread?: number;
  /** On its musical grid (a pattern's or the arp's note, D175): recorded where it is, never
   * snapped (a triplet stays a triplet). */
  onGrid?: boolean;
}

export function recordNoteOn(
  track: Track,
  pitch: number,
  velocity: number,
  timing: RecordTiming = {},
): number | null {
  const trackId = track.id;
  const s = get();

  // Stopped: step entry
  if (!s.playing) {
    if (track.mode === "clip") return null;
    if (track.mode !== "notes") return null; // padInput handles Hits
    const now = performance.now();
    const sameChord =
      chordWindow.trackId === trackId && now - chordWindow.at < 60 && chordWindow.index >= 0;
    const cursor = s.cursor;
    // without the step cursor, playing while stopped writes nothing (as padInput)
    if (!sameChord && !cursor) return null;
    const index = sameChord ? chordWindow.index : cursor!.index;
    writeStep(trackId, index, (st) => apply(st, velocity, [pitch], 0, !!sameChord), `entry-${now}`);
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

  // a note with a time (the play styles, Auto) goes in the page playing then (D164), at its exact
  // place on the grid; a key, where it's heard now (latency corrected)
  const timed = timing.at !== undefined;
  const pos = timed ? positionAt(timing.at!) : { ...position(), slotId: s.playSlotId };
  const slot = s.project.slots.find((x) => x.id === pos.slotId);
  if (!slot) return null;
  const pattern = s.project.patterns[slot.patternId];
  const lane = pattern.lanes[trackId];
  if (!lane) return null;
  if (track.mode !== "notes") return null;

  detectLoopWrap(pos.progress);

  const step = computeStepPos(
    pattern.stepSize,
    lane.stepSizeOverride,
    pattern.stepCount,
    lane.stepCountOverride,
    s.project.bpm,
    pos.progress,
    s.quantize,
  );
  const { len, laneQ, grid } = step;
  const { snap, recordMode } = useSettings.getState();
  // the hit's position, and the note's own delay after it, in lane steps
  const laneStepSec = (60 / s.project.bpm) * laneQ;
  const ratio = STEP_SIZE_QUARTERS[pattern.stepSize] / laneQ;
  const hit = timed ? pos.progress * pattern.stepCount * ratio : step.exact;
  const spread = (timing.spread ?? 0) / laneStepSec;

  let stepIndex: number;
  let noteOffset: number | undefined;

  const snapped = snap && !timing.onGrid;
  const at = snapped ? Math.round(hit / grid) * grid + spread : hit + spread;
  stepIndex = Math.round(at);
  if (!snapped || spread !== 0) {
    const rawOffset = at - stepIndex;
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
    slot.id,
  );

  inflightNotes.set(id, {
    id,
    trackId,
    pitch,
    stepIndex,
    startExact: hit + spread,
    slotId: slot.id,
    onGrid: timing.onGrid,
    startProgress: pos.progress,
  });

  return id;
}

/**
 * The note started by recordNoteOn(id) was released (or the sustain pedal released it).
 * Computes the real length and updates the note in the store.
 */
export function recordNoteOff(id: number | null, at?: number): void {
  if (id === null) return;
  const inf = inflightNotes.get(id);
  if (!inf) return;
  inflightNotes.delete(id);

  const s = get();
  if (!s.playing || !s.recording) return;

  // the note's own page; with a time, where the song is then (D164)
  const slot = s.project.slots.find((x) => x.id === inf.slotId);
  if (!slot) return;
  const pattern = s.project.patterns[slot.patternId];
  const lane = pattern.lanes[inf.trackId];
  if (!lane) return;

  const pos = at === undefined ? { ...position(), slotId: s.playSlotId } : positionAt(at);
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
  // a timed note-off is exactly on the grid; a key's is where it's heard (latency corrected)
  const nowExact =
    pos.progress * pattern.stepCount * ratio - (at === undefined ? latency / laneStepSec : 0);

  // Length = distance from note-on to note-off; wraps across page if note-off is earlier; a note
  // whose page has ended (song mode) is cut at the page's end
  let rawLen = pos.slotId !== inf.slotId ? len - inf.startExact : nowExact - inf.startExact;
  if (rawLen <= 0) rawLen += len; // wrapped around
  rawLen = Math.max(rawLen, 0.05); // at least 0.05 steps
  rawLen = Math.min(rawLen, len); // at most page length

  let noteLen: number;
  if (snap && !inf.onGrid) {
    noteLen = Math.max(grid, Math.round(rawLen / grid) * grid);
  } else {
    noteLen = Math.max(0.05, rawLen);
  }

  // Update the note's length in the step (same undo key → merges with the note-on write)
  get().commit((p) => {
    const pat = slotPattern(p, inf.slotId);
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
