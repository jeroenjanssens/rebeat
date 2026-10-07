/** App shell state: dialogs, full screen, the Dockview API. */
import { create } from "zustand";
import type { DockviewApi } from "dockview-react";

export type AudioStatus = "suspended" | "starting" | "running" | "error";

interface ShellState {
  paletteOpen: boolean;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  homeOpen: boolean;
  /** Panel id shown in panel full screen, or "app" for app full screen. */
  fullscreen: string | null;
  maximized: boolean;
  audio: AudioStatus;
  audioError: string;
  set: (partial: Partial<Omit<ShellState, "set">>) => void;
}

export const useShell = create<ShellState>()((set) => ({
  paletteOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  homeOpen: false,
  fullscreen: null,
  maximized: false,
  audio: "suspended",
  audioError: "",
  set: (partial) => set(partial),
}));

/** The Dockview API, available once the dock is mounted. Not reactive. */
export const dock: { api: DockviewApi | null } = { api: null };
