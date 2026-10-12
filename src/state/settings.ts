/** User settings (not per project): theme, UI scale, audio devices, shortcuts, layout. */
import { DEFAULT_PLAY_STYLE, type PlayStyle } from "../model/perform";
import { create } from "zustand";
import type { MidiMapping } from "../model/project";
import type { PadsChannel } from "../midi/mapping";
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
  /** Your controller's mappings, in every project (D121); targets are roles. */
  midiMappings: MidiMapping[];
  /** The controller map in use (D124): a map's id, "custom" or "none". */
  midiController: string;
  /** Notes on this channel always play step tracks as pads (D119): 0..15, "any" or "off". */
  midiPadsChannel: PadsChannel;
  /** Relative encoders: how far one step moves a knob (×1/127). */
  midiSensitivity: number;
  /** Absolute controls take over only when they reach the value (soft takeover, D120). */
  midiPickup: boolean;
  /** Inputs that speak Mackie Control (their transport notes run Rebeat's, D123), besides the
   * ones whose name says MCU. */
  midiMackieInputs: string[];
  /** MIDI Start/Continue and Stop messages play and stop (a controller's Play button, D123). */
  midiFollowStart: boolean;
  /** Send the selected track and sound name to the MiniLab 3's OLED display (WS-C). */
  midiShowDisplayNames: boolean;
  /** Send the MiniLab 3 the DAW handshake before writing its display (it may switch it to DAW mode). */
  midiMiniLabHandshake: boolean;
  /** Light the MiniLab 3's pads in the colors of what they play (D144). */
  midiMiniLabPadColors: boolean;
  /** The Keys strip (a library sound on the keys, D126): level and sends. */
  keysMix: { volume: number; sendA: number; sendB: number };
  /** The keys play what the active synth editor edits (D132). */
  keysFollowEditor: boolean;
  /** What a controller's pads 1–8 do: play tracks 1–8 (Drum), make chords (Chord, D137), or
   * add to Key mode's chords (Key, D138). */
  padMode: "drum" | "chord" | "key" | "next";
  /** Suggest the next chord (D158): markers on the keys, the display, in Chord and Key mode. */
  suggest: boolean;
  /** How adventurous the suggestions are: 0 Safe (the key's own chords), 1 Common, 2 Bold. */
  suggestAdventure: number;
  /** What the keys play (D126, D166), remembered: the library's Grand Piano to start with. */
  keysTarget:
    | { kind: "selected" }
    | { kind: "track"; id: string }
    | { kind: "sound"; source: "catalog" | "sample"; id: string; name: string };
  /** Next mode (D161): a progression whose next chord pad 1 holds, or null (the best one). */
  nextProgression: string | null;
  /** Key mode's own key (D138), independent of the project. */
  keyModeKey: { root: number; scale: string };
  /** The Key dial (the MiniLab's black knob in Key mode): a turn changes the key at once, or
   * picks one that a press selects (D138). */
  keyDial: "instant" | "press";
  /** Bass voicing (D139): when the pads make a chord, its root also plays this many octaves
   * below it (0 = off, 1–3), never below C1. */
  bassOctaves: number;
  /** Chord voicing (D140): inversions of every chord the pads make, −8..8 (0 = root position). */
  chordVoicing: number;
  /** How the keys play (D149–D153): strum, slop, the arpeggiator, a pattern, latch, balance.
   * Read it through `sanitizePlayStyle`: older settings may lack parts. */
  playStyle: PlayStyle;
  /** Smooth voicing (D152): each chord the voicing closest to the one before. */
  smoothVoicing: boolean;
  /** The bass on its own track (D154): a Notes track's id, or null for the chord's sound. */
  bassTrack: string | null;
  /** Auto: the root with every chord; split: keys below `bassSplit` play the bass alone. */
  bassMode: "auto" | "split";
  /** The first key that plays chords in split mode (MIDI note); the keys below it are the bass. */
  bassSplit: number;
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
  /**
   * Live note recording mode (D127): Overdub adds notes and keeps what's there; Replace clears
   * a step's notes the first time you play onto it in this loop pass (punch-in).
   */
  recordMode: "overdub" | "replace";
  /**
   * Snap (D128): when on, note starts and lengths snap to Q's grid. When off, starts are kept
   * at their exact position (stored as Note.offset) and lengths are unrounded.
   */
  snap: boolean;
  /** Drum-machine pad zoom: "fit" fills the available width, a number is a multiplier on the
   * base pad width (0.5–2.5; clamped to 0.25–4.0 when typed; D131). */
  zoom: number | "fit";
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
  midiMappings: [],
  midiController: "none",
  midiPadsChannel: 9,
  midiSensitivity: 2,
  midiPickup: false,
  midiMackieInputs: [],
  midiFollowStart: true,
  midiShowDisplayNames: true,
  midiMiniLabHandshake: false,
  midiMiniLabPadColors: true,
  keysMix: { volume: 0.8, sendA: 0, sendB: 0 },
  keysFollowEditor: false,
  padMode: "drum",
  keyModeKey: { root: 0, scale: "major" },
  keyDial: "instant",
  bassOctaves: 0,
  chordVoicing: 0,
  playStyle: DEFAULT_PLAY_STYLE,
  smoothVoicing: false,
  bassTrack: null,
  bassMode: "auto",
  bassSplit: 48,
  suggest: false,
  suggestAdventure: 1,
  nextProgression: null,
  keysTarget: { kind: "sound", source: "catalog", id: "smplr:piano", name: "Grand Piano" },
  previewVolume: 0.8,
  freeFirstLoop: false,
  onboarded: false,
  explain: false,
  sampleSources: [],
  instrumentFavorites: [],
  synthView: "basic",
  synthFolded: [],
  synthRandom: { amount: 0.3, locked: [] },
  recordMode: "overdub",
  snap: true,
  zoom: "fit",
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
