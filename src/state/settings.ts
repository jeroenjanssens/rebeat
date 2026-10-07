/** User settings (not per project): theme, UI scale, audio devices, shortcuts, layout. */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { platform } from "../platform";

export type ThemeId = "studio-dark" | "paper" | "midnight" | "ember" | "high-contrast";
export type ThemeSetting = ThemeId | "system";
export type LatencyMode = "interactive" | "balanced" | "playback";
export type PageSwitch = "page" | "bar" | "beat";

export const THEMES: { id: ThemeId; label: string; dark: boolean }[] = [
  { id: "studio-dark", label: "Studio Dark", dark: true },
  { id: "paper", label: "Paper", dark: false },
  { id: "midnight", label: "Midnight", dark: true },
  { id: "ember", label: "Ember", dark: true },
  { id: "high-contrast", label: "High Contrast", dark: true },
];

export const ACCENTS = [
  "#7dd3fc",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#a3e635",
  "#2dd4bf",
  "#facc15",
];

export interface Settings {
  theme: ThemeSetting;
  /** null = the theme's own accent color. */
  accent: string | null;
  uiScale: number; // 0.8..1.5
  density: "compact" | "comfortable";
  reducedMotion: "system" | "on" | "off";
  /** Command id → shortcut, overriding the defaults. "" = unbound. */
  shortcuts: Record<string, string>;
  latencyMode: LatencyMode;
  outputDeviceId: string;
  inputDeviceId: string;
  /** Recording latency compensation, in ms (measured by the calibration wizard). */
  recordLatencyMs: number;
  monitorWhileArmed: boolean;
  speakerMode: boolean;
  autosave: boolean;
  pageSwitch: PageSwitch;
  countInBars: number;
  midiInputs: Record<string, boolean>;
  previewVolume: number;
  /** When nothing plays yet, the first loop recording sets the tempo (loop-pedal style). */
  freeFirstLoop: boolean;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: null,
  uiScale: 1,
  density: "comfortable",
  reducedMotion: "system",
  shortcuts: {},
  latencyMode: "interactive",
  outputDeviceId: "",
  inputDeviceId: "",
  recordLatencyMs: 0,
  monitorWhileArmed: true,
  speakerMode: false,
  autosave: true,
  pageSwitch: "page",
  countInBars: 1,
  midiInputs: {},
  previewVolume: 0.8,
  freeFirstLoop: false,
  onboarded: false,
};

interface SettingsState extends Settings {
  set: (partial: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (partial) => set(partial),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "rebeat.settings",
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: platform.kv.get,
        setItem: platform.kv.set,
        removeItem: platform.kv.remove,
      })),
      partialize: ({ set: _set, reset: _reset, ...rest }) => rest,
    },
  ),
);

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ThemeId {
  if (setting !== "system") return setting;
  return prefersDark ? "studio-dark" : "paper";
}
