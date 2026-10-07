import { create } from "zustand";
import { produce, type Draft } from "immer";
import { demoProject } from "../mock/demoProject";
import { slotPattern, type Project } from "../model/project";
import type { Step } from "../model/types";

export type FnKey =
  | "shift"
  | "select"
  | "copy"
  | "paste"
  | "clear"
  | "dupl"
  | "double"
  | "mute"
  | "solo"
  | "fill"
  | "repeat"
  | "accent"
  | "rand"
  | "euclid"
  | "nudgeL"
  | "nudgeR"
  | "undo";

export type Bank = "sound" | "step" | "fx" | "mix";
export type Tool = "draw" | "erase" | "select";
export type RepeatRate = "1/8" | "1/16" | "1/32";

export interface UiState {
  view: "grid" | "pads";
  tool: Tool;
  quantize: string;
  zoom: number;
  follow: boolean;
  lanes: { velocity: boolean; probability: boolean; nudge: boolean };
  bank: Bank;
  fxIndex: number;
  selectedTrackId: string;
  editSlotId: string;
  /** Keys are `${trackId}:${stepIndex}` in the page being edited. */
  selectedSteps: Record<string, true>;
  held: FnKey | null;
  heldUsed: boolean;
  shiftLatched: boolean;
  shiftHeld: boolean;
  accentMode: boolean;
  fillHeld: boolean;
  fillLatched: boolean;
  repeatRate: RepeatRate;
  playMode: "loop" | "song";
  playing: boolean;
  recording: boolean;
  playSlotId: string;
  queuedSlotId: string | null;
  jogOpen: Record<string, boolean>;
  clipboard: Step[] | null;
  euclidOpen: boolean;
}

interface State extends UiState {
  project: Project;
  past: Project[];
  future: Project[];
  lastCommitKey: string | null;
  lastCommitTime: number;
  /** Change the project and record an undo step. Calls with the same `key` within 600 ms are merged. */
  commit: (recipe: (p: Draft<Project>) => void, key?: string) => void;
  undo: () => void;
  redo: () => void;
  setUi: (partial: Partial<UiState>) => void;
}

const project = demoProject();

export const useStore = create<State>()((set, get) => ({
  project,
  past: [],
  future: [],
  lastCommitKey: null,
  lastCommitTime: 0,

  view: "grid",
  tool: "draw",
  quantize: "1/16",
  zoom: 1,
  follow: true,
  lanes: { velocity: false, probability: false, nudge: false },
  bank: "sound",
  fxIndex: 0,
  selectedTrackId: project.tracks[1].id,
  editSlotId: project.slots[1].id,
  selectedSteps: {},
  held: null,
  heldUsed: false,
  shiftLatched: false,
  shiftHeld: false,
  accentMode: false,
  fillHeld: false,
  fillLatched: false,
  repeatRate: "1/16",
  playMode: "loop",
  playing: false,
  recording: false,
  playSlotId: project.slots[1].id,
  queuedSlotId: null,
  jogOpen: {},
  clipboard: null,
  euclidOpen: false,

  commit: (recipe, key) => {
    const { project, past, lastCommitKey, lastCommitTime } = get();
    const next = produce(project, recipe);
    if (next === project) return;
    const now = performance.now();
    const merge = key !== undefined && key === lastCommitKey && now - lastCommitTime < 600;
    set({
      project: next,
      past: merge ? past : [...past.slice(-199), project],
      future: [],
      lastCommitKey: key ?? null,
      lastCommitTime: now,
    });
  },
  undo: () => {
    const { past, future, project } = get();
    if (past.length === 0) return;
    set({
      project: past[past.length - 1],
      past: past.slice(0, -1),
      future: [project, ...future],
      lastCommitKey: null,
    });
  },
  redo: () => {
    const { past, future, project } = get();
    if (future.length === 0) return;
    set({
      project: future[0],
      past: [...past, project],
      future: future.slice(1),
      lastCommitKey: null,
    });
  },
  setUi: (partial) => set(partial),
}));

// ---------- selectors ----------

export const useEditPattern = () => useStore((s) => slotPattern(s.project, s.editSlotId));
export const useSelectedTrack = () =>
  useStore((s) => s.project.tracks.find((t) => t.id === s.selectedTrackId) ?? s.project.tracks[0]);
export const useShift = () => useStore((s) => s.shiftLatched || s.shiftHeld || s.held === "shift");

export function isAudible(trackId: string, project: Project): boolean {
  const anySolo = project.tracks.some((t) => t.solo);
  const t = project.tracks.find((x) => x.id === trackId);
  if (!t || t.mute) return false;
  return !anySolo || t.solo;
}

export const stepKey = (trackId: string, index: number) => `${trackId}:${index}`;
