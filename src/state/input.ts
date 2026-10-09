/**
 * Playing pads and notes: step entry while stopped (writes at the step cursor and moves on) and
 * live recording while playing (quantized into steps, or with the nudge kept when Q is off).
 */
import { position } from "../engine/transport";
import { audioContext } from "../engine/context";
import { chordInKey, snapToKey } from "../model/notes";
import { pageKey, slotPattern } from "../model/project";
import { STEP_SIZE_QUARTERS, setStepVelocity, type Step, type Track } from "../model/types";
import { laneLen, switchStep, toggleSelectedSteps } from "./actions";
import { stepped } from "../model/tracks";
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
