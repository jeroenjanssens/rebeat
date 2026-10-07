import type { Draft } from "immer";
import {
  applyPattern,
  clearLane,
  cloneSlot,
  copySlot,
  doublePattern,
  duplicateTrack,
  euclid,
  halvePattern,
  randomizeLane,
  rotateLane,
  slotPattern,
  type Project,
} from "../model/project";
import { emptyStep, type Step, type StepLane } from "../model/types";
import { stepKey, useStore, type FnKey } from "./store";

const get = () => useStore.getState();

// ---------- helpers ----------

function editPattern(p: Draft<Project>) {
  return slotPattern(p as Project, get().editSlotId);
}

function stepLane(p: Draft<Project>, trackId: string): StepLane | null {
  const lane = editPattern(p).lanes[trackId];
  return lane?.kind === "steps" ? lane : null;
}

export function laneLen(trackId: string): number {
  const s = get();
  const pattern = slotPattern(s.project, s.editSlotId);
  const lane = pattern.lanes[trackId];
  return lane?.kind === "steps" ? (lane.stepCountOverride ?? pattern.stepCount) : pattern.stepCount;
}

function shiftActive() {
  const s = get();
  return s.shiftLatched || s.shiftHeld || s.held === "shift";
}

function consumeShift() {
  if (get().shiftLatched) get().setUi({ shiftLatched: false });
}

export function selectedIndices(trackId: string): number[] {
  return Object.keys(get().selectedSteps)
    .filter((k) => k.startsWith(`${trackId}:`))
    .map((k) => Number(k.split(":")[1]))
    .sort((a, b) => a - b);
}

// ---------- steps ----------

export function setStep(trackId: string, index: number, on: boolean, key = "paint") {
  const accent = get().accentMode;
  get().commit((p) => {
    const lane = stepLane(p, trackId);
    if (!lane) return;
    const s = lane.steps[index];
    if (s.on === on) return;
    s.on = on;
    if (on && accent) {
      s.velocity = 1;
      s.accent = true;
    }
  }, key);
}

export function editSteps(keys: string[], fn: (s: Draft<Step>) => void, key: string) {
  get().commit((p) => {
    for (const k of keys) {
      const [trackId, i] = k.split(":");
      const lane = stepLane(p, trackId);
      if (lane) fn(lane.steps[Number(i)]);
    }
  }, key);
}

export function toggleSelected(trackId: string, index: number, additive = true) {
  const k = stepKey(trackId, index);
  const current = additive ? { ...get().selectedSteps } : {};
  if (current[k]) delete current[k];
  else current[k] = true;
  get().setUi({ selectedSteps: current, selectedTrackId: trackId, bank: "step" });
}

export function clearSelection() {
  get().setUi({ selectedSteps: {} });
}

// ---------- function buttons ----------

export function fnPress(key: FnKey) {
  get().setUi({ held: key, heldUsed: false, ...(key === "fill" ? { fillHeld: true } : {}) });
}

export function fnRelease(key: FnKey) {
  const s = get();
  if (key === "fill") s.setUi({ fillHeld: false });
  if (s.held !== key) return;
  const used = s.heldUsed;
  s.setUi({ held: null, heldUsed: false });
  if (used) return;
  if (key === "shift") s.setUi({ shiftLatched: !s.shiftLatched });
  else fnClick(key);
}

/** Use the held function button on a target. Returns true when the click was consumed. */
export function applyHeld(target: {
  trackId?: string;
  stepIndex?: number;
  slotId?: string;
}): boolean {
  const s = get();
  const key = s.held;
  if (!key || key === "shift" || key === "fill" || key === "repeat" || key === "accent")
    return false;
  s.setUi({ heldUsed: true });
  const { trackId, stepIndex, slotId } = target;

  if (slotId) {
    if (key === "copy") s.commit((p) => void copySlot(p as Project, slotId));
    else if (key === "dupl")
      s.commit((p) => void (shiftActive() ? cloneSlot : copySlot)(p as Project, slotId));
    else if (key === "clear")
      s.commit((p) => {
        for (const lane of Object.values(slotPattern(p as Project, slotId).lanes))
          if (lane.kind === "steps") clearLane(lane);
      });
    else return false;
    return true;
  }
  if (!trackId) return false;

  switch (key) {
    case "select":
      if (stepIndex !== undefined) toggleSelected(trackId, stepIndex);
      else s.setUi({ selectedTrackId: trackId });
      return true;
    case "mute":
      s.commit((p) => {
        const t = p.tracks.find((x) => x.id === trackId)!;
        t.mute = !t.mute;
      });
      return true;
    case "solo":
      s.commit((p) => {
        const t = p.tracks.find((x) => x.id === trackId)!;
        t.solo = !t.solo;
      });
      return true;
    case "clear":
      s.commit((p) => {
        const lane = stepLane(p, trackId);
        if (lane) clearLane(lane);
      });
      return true;
    case "copy":
      copySteps(trackId);
      return true;
    case "paste":
      pasteSteps(trackId);
      return true;
    case "dupl":
      s.commit((p) => void duplicateTrack(p as Project, trackId));
      return true;
    case "rand":
      s.setUi({ selectedTrackId: trackId });
      fnClick("rand");
      return true;
    case "euclid":
      s.setUi({ selectedTrackId: trackId, euclidOpen: true });
      return true;
    case "nudgeL":
    case "nudgeR":
      s.setUi({ selectedTrackId: trackId });
      fnClick(key);
      return true;
    default:
      return false;
  }
}

function copySteps(trackId: string) {
  const s = get();
  const pattern = slotPattern(s.project, s.editSlotId);
  const lane = pattern.lanes[trackId];
  if (lane?.kind !== "steps") return;
  const sel = selectedIndices(trackId);
  const indices = sel.length ? sel : Array.from({ length: laneLen(trackId) }, (_, i) => i);
  s.setUi({ clipboard: indices.map((i) => structuredClone(lane.steps[i])) });
}

function pasteSteps(trackId: string) {
  const clip = get().clipboard;
  if (!clip) return;
  const start = selectedIndices(trackId)[0] ?? 0;
  const len = laneLen(trackId);
  get().commit((p) => {
    const lane = stepLane(p, trackId);
    if (!lane) return;
    clip.forEach((step, i) => {
      if (start + i < len) lane.steps[start + i] = structuredClone(step);
    });
  });
}

export function fnClick(key: FnKey) {
  const s = get();
  const shift = shiftActive();
  const trackId = s.selectedTrackId;
  const len = laneLen(trackId);
  const sel = selectedIndices(trackId);
  consumeShift();

  switch (key) {
    case "select":
      if (shift) {
        const all = Object.fromEntries(
          Array.from({ length: len }, (_, i) => [stepKey(trackId, i), true as const]),
        );
        s.setUi({ selectedSteps: all, bank: "step" });
      } else s.setUi({ tool: s.tool === "select" ? "draw" : "select" });
      break;
    case "copy":
      if (shift) {
        let id = "";
        s.commit((p) => void (id = copySlot(p as Project, s.editSlotId)));
        s.setUi({ editSlotId: id });
      } else copySteps(trackId);
      break;
    case "paste":
      pasteSteps(trackId);
      break;
    case "clear":
      s.commit((p) => {
        if (shift) {
          for (const lane of Object.values(editPattern(p).lanes))
            if (lane.kind === "steps") clearLane(lane);
          return;
        }
        const lane = stepLane(p, trackId);
        if (!lane) return;
        if (sel.length) for (const i of sel) lane.steps[i] = emptyStep();
        else clearLane(lane);
      });
      break;
    case "dupl":
      if (shift) {
        let id = "";
        s.commit((p) => void (id = cloneSlot(p as Project, s.editSlotId)));
        s.setUi({ editSlotId: id });
      } else {
        let id = "";
        s.commit((p) => void (id = duplicateTrack(p as Project, trackId)));
        s.setUi({ selectedTrackId: id });
      }
      break;
    case "double":
      s.commit((p) => (shift ? halvePattern : doublePattern)(editPattern(p)));
      break;
    case "mute":
      s.commit((p) => {
        if (shift) p.tracks.forEach((t) => (t.mute = false));
        else {
          const t = p.tracks.find((x) => x.id === trackId)!;
          t.mute = !t.mute;
        }
      });
      break;
    case "solo":
      s.commit((p) => {
        if (shift) p.tracks.forEach((t) => (t.solo = false));
        else {
          const t = p.tracks.find((x) => x.id === trackId)!;
          t.solo = !t.solo;
        }
      });
      break;
    case "fill":
      if (shift) s.setUi({ fillLatched: !s.fillLatched });
      break;
    case "repeat":
      if (shift)
        s.setUi({
          repeatRate: s.repeatRate === "1/8" ? "1/16" : s.repeatRate === "1/16" ? "1/32" : "1/8",
        });
      break;
    case "accent":
      s.setUi({ accentMode: !s.accentMode });
      break;
    case "rand":
      s.commit((p) => {
        const lane = stepLane(p, trackId);
        if (lane) randomizeLane(lane, len, 0.35, shift);
      });
      break;
    case "euclid":
      if (shift)
        s.commit((p) => {
          const lane = stepLane(p, trackId);
          if (lane) rotateLane(lane, len, 1);
        });
      else s.setUi({ euclidOpen: !s.euclidOpen });
      break;
    case "nudgeL":
    case "nudgeR": {
      const dir = key === "nudgeL" ? -1 : 1;
      if (shift && sel.length) {
        editSteps(
          sel.map((i) => stepKey(trackId, i)),
          (st) => (st.nudge = Math.max(-0.5, Math.min(0.5, st.nudge + dir * 0.1))),
          "nudge",
        );
      } else
        s.commit((p) => {
          const lane = stepLane(p, trackId);
          if (lane) rotateLane(lane, len, dir);
        }, "rotate");
      break;
    }
    case "undo":
      if (shift) s.redo();
      else s.undo();
      break;
  }
}

export function applyEuclid(trackId: string, pulses: number, length: number, rotation: number) {
  get().commit((p) => {
    const lane = stepLane(p, trackId);
    if (!lane) return;
    const pattern = editPattern(p);
    lane.stepCountOverride = length === pattern.stepCount ? undefined : length;
    for (let i = 0; i < length; i++) lane.steps[i].on = false;
    applyPattern(lane, euclid(pulses, length, rotation));
  }, "euclid");
}
