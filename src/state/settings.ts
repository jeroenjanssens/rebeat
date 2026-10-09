/** User settings (not per project): theme, UI scale, audio devices, shortcuts, layout. */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { platform } from "../platform";

export type ThemeId =
  | "studio-dark"
  | "midnight"
  | "ember"
  | "high-contrast"
  | "outrun"
  | "abyss"
  | "moss"
  | "graphite"
  | "oxblood"
  | "dracula"
  | "catppuccin-frappe"
  | "catppuccin-macchiato"
  | "catppuccin-mocha"
  | "paper"
  | "daylight"
  | "sand"
  | "mint"
  | "lavender"
  | "sky"
  | "catppuccin-latte";
export type ThemeSetting = ThemeId | "system";
export type LatencyMode = "interactive" | "balanced" | "playback";
export type PageSwitch = "page" | "bar" | "beat";

export const THEMES: { id: ThemeId; label: string; dark: boolean }[] = [
  { id: "studio-dark", label: "Studio Dark", dark: true },
  { id: "midnight", label: "Midnight", dark: true },
  { id: "ember", label: "Ember", dark: true },
  { id: "high-contrast", label: "High Contrast", dark: true },
  { id: "outrun", label: "Outrun", dark: true },
  { id: "abyss", label: "Abyss", dark: true },
  { id: "moss", label: "Moss", dark: true },
  { id: "graphite", label: "Graphite", dark: true },
  { id: "oxblood", label: "Oxblood", dark: true },
  { id: "dracula", label: "Dracula", dark: true },
  { id: "catppuccin-frappe", label: "Catppuccin Frappé", dark: true },
  { id: "catppuccin-macchiato", label: "Catppuccin Macchiato", dark: true },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", dark: true },
  { id: "paper", label: "Paper", dark: false },
  { id: "daylight", label: "Daylight", dark: false },
  { id: "sand", label: "Sand", dark: false },
  { id: "mint", label: "Mint", dark: false },
  { id: "lavender", label: "Lavender", dark: false },
  { id: "sky", label: "Sky", dark: false },
  { id: "catppuccin-latte", label: "Catppuccin Latte", dark: false },
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
  /** The themes System follows (D102). */
  systemDarkTheme: ThemeId;
  systemLightTheme: ThemeId;
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
  /** Stop lets reverb and delay tails (and notes' releases) ring out, instead of silence (D99). */
  ringOutOnStop: boolean;
  speakerMode: boolean;
  autosave: boolean;
  pageSwitch: PageSwitch;
  countInBars: number;
  midiInputs: Record<string, boolean>;
  /** Start Web MIDI with the audio (the user enabled it once). */
  midiEnabled: boolean;
  previewVolume: number;
  /** When nothing plays yet, the first loop recording sets the tempo (loop-pedal style). */
  freeFirstLoop: boolean;
  onboarded: boolean;
  /** Explain mode: detailed hover cards on buttons (D71). */
  explain: boolean;
  /** Sample sources you added by link (strudel.json, GitHub repositories), D74. */
  sampleSources: string[];
  /** Favorite instruments (catalog ids), D78. */
  instrumentFavorites: string[];
  /** The synth editor's view: Basic (the macros) first, then the one you used last. */
  synthView: "basic" | "advanced";
  /** The synth editor's folded sections (Advanced). */
  synthFolded: string[];
  /** Randomize: how far, and the sections it leaves alone. */
  synthRandom: { amount: number; locked: string[] };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  systemDarkTheme: "studio-dark",
  systemLightTheme: "paper",
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
  ringOutOnStop: false,
  speakerMode: false,
  autosave: true,
  pageSwitch: "page",
  countInBars: 1,
  midiInputs: {},
  midiEnabled: false,
  previewVolume: 0.8,
  freeFirstLoop: false,
  onboarded: false,
  explain: false,
  sampleSources: [],
  instrumentFavorites: [],
  synthView: "basic",
  synthFolded: [],
  synthRandom: { amount: 0.3, locked: [] },
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

export function resolveTheme(
  setting: ThemeSetting,
  prefersDark: boolean,
  system: { dark: ThemeId; light: ThemeId } = { dark: "studio-dark", light: "paper" },
): ThemeId {
  if (setting !== "system") return setting;
  return prefersDark ? system.dark : system.light;
}
