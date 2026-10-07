/**
 * Playing pads and notes: step entry while stopped (writes at the step cursor and moves on) and
 * live recording while playing (quantized into steps, or with the nudge kept when Q is off).
 */
import { position } from "../engine/transport";
import { audioContext } from "../engine/context";
import { slotPattern } from "../model/project";
import { STEP_SIZE_QUARTERS, type Step, type Track } from "../model/types";
import { laneLen } from "./actions";
import { useStore } from "./store";

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
    if (lane?.kind === "steps") fn(lane.steps[index]);
  }, key);
}

function apply(step: Step, velocity: number, notes?: number[], nudge = 0) {
  step.on = true;
  step.velocity = velocity;
  step.nudge = nudge;
  if (notes) {
    // pressing several notes at once builds a chord
    const merged =
      step.notes && step.length === 1 ? [...new Set([...step.notes, ...notes])] : notes;
    step.notes = merged.sort((a, b) => a - b);
    step.length = 1;
  }
}

let chordWindow = { at: 0, index: -1, trackId: "" };

/** A pad or note was played by the user (mouse, touch, keyboard or MIDI). */
export function padInput(track: Track, velocity: number, notes?: number[]) {
  const s = get();
  if (track.kind === "audio") return;

  if (s.playing && s.recording) {
    const pos = position();
    const slot = s.project.slots.find((x) => x.id === s.playSlotId)!;
    const pattern = s.project.patterns[slot.patternId];
    const lane = pattern.lanes[track.id];
    if (lane?.kind !== "steps") return;
    const len = lane.stepCountOverride ?? pattern.stepCount;
    // what you hear is behind the audio clock by the output latency
    const ctx = audioContext();
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    const stepSec = (60 / s.project.bpm) * STEP_SIZE_QUARTERS[pattern.stepSize];
    const exact = pos.progress * pattern.stepCount - latency / stepSec;
    const q = QUANTIZE_QUARTERS[s.quantize];
    let index: number;
    let nudge = 0;
    if (q) {
      const grid = Math.max(1, Math.round(q / STEP_SIZE_QUARTERS[pattern.stepSize]));
      index = Math.round(exact / grid) * grid;
    } else {
      index = Math.round(exact);
      nudge = Math.max(-0.5, Math.min(0.5, exact - index));
    }
    index = ((index % len) + len) % len;
    writeStep(track.id, index, (st) => apply(st, velocity, notes, nudge), `rec-${track.id}`);
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
    writeStep(track.id, index, (st) => apply(st, velocity, notes), `entry-${now}`);
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
  // skip audio tracks: they have no steps
  while (pattern.lanes[tracks[ti].id]?.kind !== "steps" && ti > 0 && ti < tracks.length - 1)
    ti += dy || 1;
  const trackId = tracks[ti].id;
  if (pattern.lanes[trackId]?.kind !== "steps") return;
  const len = laneLen(trackId);
  const index = (((c.index + dx) % len) + len) % len;
  s.setUi({ cursor: { trackId, index }, selectedTrackId: trackId });
}

export function cursorToggle() {
  const c = get().cursor;
  if (!c) return moveCursor(0, 0);
  const s = get();
  const lane = slotPattern(s.project, s.editSlotId).lanes[c.trackId];
  if (lane?.kind !== "steps") return;
  const on = !lane.steps[c.index].on;
  writeStep(
    c.trackId,
    c.index,
    (st) => {
      st.on = on;
      const track = s.project.tracks.find((t) => t.id === c.trackId);
      if (on && track?.kind === "instrument" && !st.notes) {
        st.notes = [track.category === "bass" ? 36 : 60];
        st.length = 1;
      }
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
        if (lane?.kind === "steps") lane.steps[Number(i)].velocity = v;
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
        st.velocity = v;
      },
      "vel-digit",
    );
}
