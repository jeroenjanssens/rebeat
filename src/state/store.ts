import { create } from "zustand";
import { produce, type Draft } from "immer";
import { demoProject } from "../templates/nightDrive";
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
  /** Keyboard step cursor (arrows / Enter / 1–9), also the step-entry position. */
  cursor: { trackId: string; index: number } | null;
  /** The computer keyboard plays pads/notes in the pad view. */
  keyboardPads: boolean;
  /** Octave offset for the computer-keyboard piano. */
  keyboardOctave: number;
  /** Notes snap to the key (drawing, pads, keyboard, MIDI). */
  scaleLock: boolean;
  /** Playing one note plays a chord in the key. */
  chordMode: "off" | "triad" | "seventh";
  held: FnKey | null;
  heldUsed: boolean;
  shiftLatched: boolean;
  shiftHeld: boolean;
  accentMode: boolean;
  fillHeld: boolean;
  fillLatched: boolean;
  repeatRate: RepeatRate;
  playMode: "loop" | "song";
  /** Song mode: start over after the last page (otherwise stop). */
  songLoop: boolean;
  playing: boolean;
  recording: boolean;
  /** Loop recording length in bars (0 = the page length). */
  loopBars: number;
  /** What the looper is doing, for the UI. */
  looper: {
    status: "idle" | "waiting" | "recording" | "saving";
    trackId: string;
    start: number;
    end: number;
  };
  playSlotId: string;
  queuedSlotId: string | null;
  jogOpen: Record<string, boolean>;
  clipboard: Step[] | null;
  euclidOpen: boolean;
}

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

interface State extends UiState {
  project: Project;
  /** Id of the project in storage. */
  projectId: string;
  saveStatus: SaveStatus;
  /** Replace the project (open, new, import): resets undo history and selection. */
  loadProject: (project: Project, id: string) => void;
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
  projectId: "",
  saveStatus: "saved",
  loadProject: (p, id) => {
    const firstStepTrack = p.tracks.find((t) => t.kind !== "audio") ?? p.tracks[0];
    set({
      project: p,
      projectId: id,
      past: [],
      future: [],
      lastCommitKey: null,
      saveStatus: "saved",
      selectedTrackId: firstStepTrack?.id ?? "",
      editSlotId: p.slots[0]?.id ?? "",
      playSlotId: p.slots[0]?.id ?? "",
      queuedSlotId: null,
      selectedSteps: {},
      cursor: null,
      fxIndex: 0,
      euclidOpen: false,
      jogOpen: {},
    });
  },
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
  cursor: null,
  keyboardPads: true,
  keyboardOctave: 0,
  scaleLock: false,
  chordMode: "off",
  held: null,
  heldUsed: false,
  shiftLatched: false,
  shiftHeld: false,
  accentMode: false,
  fillHeld: false,
  fillLatched: false,
  repeatRate: "1/16",
  playMode: "loop",
  songLoop: true,
  playing: false,
  recording: false,
  loopBars: 0,
  looper: { status: "idle", trackId: "", start: 0, end: 0 },
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
