import * as clock from "../mock/clock";
import { platform } from "../platform";
import { clearSelection, fnClick, fnPress, fnRelease } from "../state/actions";
import { THEMES, useSettings } from "../state/settings";
import { useStore } from "../state/store";
import type { Command } from "./commands";
import { toggleMaximize } from "./Dock";
import { LAYOUT_PRESETS, applyPreset, openPanel } from "./layouts";
import { togglePanelFullscreen } from "./PanelFrame";
import { PANELS } from "./panels";
import { dock, useShell } from "./shell";
import { tapTempo } from "./TransportBar";

const store = () => useStore.getState();
const shell = () => useShell.getState();

export function defaultCommands(): Command[] {
  return [
    // ---- transport ----
    {
      id: "transport.toggle",
      title: "Play / stop",
      category: "Transport",
      keys: ["Space"],
      run: clock.toggle,
    },
    {
      id: "transport.record",
      title: "Record",
      category: "Transport",
      keys: ["R"],
      run: () => store().setUi({ recording: !store().recording }),
    },
    { id: "transport.tap", title: "Tap tempo", category: "Transport", keys: ["T"], run: tapTempo },
    {
      id: "transport.metronome",
      title: "Metronome on/off",
      category: "Transport",
      keys: ["K"],
      run: () => store().commit((p) => void (p.metronome = !p.metronome)),
    },
    {
      id: "transport.mode",
      title: "Toggle loop page / song",
      category: "Transport",
      keys: ["L"],
      run: () => store().setUi({ playMode: store().playMode === "loop" ? "song" : "loop" }),
    },
    {
      id: "transport.bpmUp",
      title: "Tempo +1 BPM",
      category: "Transport",
      keys: ["="],
      run: () => store().commit((p) => void (p.bpm = Math.min(300, Math.round(p.bpm) + 1)), "bpm"),
    },
    {
      id: "transport.bpmDown",
      title: "Tempo −1 BPM",
      category: "Transport",
      keys: ["-"],
      run: () => store().commit((p) => void (p.bpm = Math.max(20, Math.round(p.bpm) - 1)), "bpm"),
    },

    // ---- edit ----
    {
      id: "edit.undo",
      title: "Undo",
      category: "Edit",
      keys: ["Mod+Z"],
      run: () => store().undo(),
    },
    {
      id: "edit.redo",
      title: "Redo",
      category: "Edit",
      keys: ["Mod+Shift+Z", "Mod+Y"],
      run: () => store().redo(),
    },
    {
      id: "edit.copy",
      title: "Copy steps",
      category: "Edit",
      keys: ["Mod+C"],
      run: () => fnClick("copy"),
    },
    {
      id: "edit.paste",
      title: "Paste steps",
      category: "Edit",
      keys: ["Mod+V"],
      run: () => fnClick("paste"),
    },
    {
      id: "edit.clear",
      title: "Clear selected steps / track",
      category: "Edit",
      keys: ["Backspace", "Delete"],
      run: () => fnClick("clear"),
    },
    {
      id: "edit.deselect",
      title: "Clear selection",
      category: "Edit",
      keys: ["Escape"],
      run: clearSelection,
    },
    {
      id: "edit.selectAll",
      title: "Select all steps of the track",
      category: "Edit",
      keys: ["Mod+A"],
      run: () => {
        store().setUi({ shiftLatched: true });
        fnClick("select");
      },
    },

    // ---- drum machine ----
    {
      id: "dm.draw",
      title: "Draw tool",
      category: "Drum machine",
      keys: ["D"],
      run: () => store().setUi({ tool: "draw" }),
    },
    {
      id: "dm.erase",
      title: "Erase tool",
      category: "Drum machine",
      keys: ["E"],
      run: () => store().setUi({ tool: "erase" }),
    },
    {
      id: "dm.select",
      title: "Select tool",
      category: "Drum machine",
      keys: ["S"],
      run: () => store().setUi({ tool: "select" }),
    },
    {
      id: "dm.view",
      title: "Toggle grid / pads view",
      category: "Drum machine",
      keys: ["V"],
      run: () => store().setUi({ view: store().view === "grid" ? "pads" : "grid" }),
    },
    {
      id: "dm.mute",
      title: "Hold to mute tracks (click = mute selected)",
      category: "Drum machine",
      keys: ["M"],
      run: () => fnPress("mute"),
      release: () => fnRelease("mute"),
    },
    {
      id: "dm.solo",
      title: "Hold to solo tracks (click = solo selected)",
      category: "Drum machine",
      keys: ["O"],
      run: () => fnPress("solo"),
      release: () => fnRelease("solo"),
    },
    {
      id: "dm.fill",
      title: "Fill (hold)",
      category: "Drum machine",
      keys: ["F"],
      run: () => fnPress("fill"),
      release: () => fnRelease("fill"),
    },
    {
      id: "dm.double",
      title: "Double page (×2)",
      category: "Drum machine",
      run: () => fnClick("double"),
    },
    {
      id: "dm.duplicate",
      title: "Duplicate track",
      category: "Drum machine",
      keys: ["Mod+D"],
      run: () => fnClick("dupl"),
    },
    {
      id: "dm.random",
      title: "Randomize track",
      category: "Drum machine",
      run: () => fnClick("rand"),
    },
    {
      id: "dm.euclid",
      title: "Euclidean fill…",
      category: "Drum machine",
      run: () => fnClick("euclid"),
    },
    {
      id: "dm.shiftLeft",
      title: "Shift track left",
      category: "Drum machine",
      keys: ["Alt+Left"],
      run: () => fnClick("nudgeL"),
    },
    {
      id: "dm.shiftRight",
      title: "Shift track right",
      category: "Drum machine",
      keys: ["Alt+Right"],
      run: () => fnClick("nudgeR"),
    },
    {
      id: "dm.accent",
      title: "Accent mode on/off",
      category: "Drum machine",
      run: () => fnClick("accent"),
    },

    // ---- view ----
    {
      id: "view.fullscreen",
      title: "Full screen",
      category: "View",
      keys: ["Mod+Shift+F"],
      global: true,
      run: () =>
        platform.fullscreen.element() ? platform.fullscreen.exit() : platform.fullscreen.enter(),
    },
    {
      id: "view.maximize",
      title: "Maximize panel",
      category: "View",
      keys: ["Mod+Shift+M"],
      global: true,
      run: toggleMaximize,
    },
    {
      id: "view.panelFullscreen",
      title: "Panel full screen",
      category: "View",
      keys: ["Mod+Shift+Enter"],
      global: true,
      run: () => {
        const fs = shell().fullscreen;
        if (fs && fs !== "app") return void platform.fullscreen.exit();
        const id = dock.api?.activePanel?.id;
        if (id) togglePanelFullscreen(id);
      },
    },
    {
      id: "app.palette",
      title: "Command palette",
      category: "View",
      keys: ["Mod+K", "Mod+Shift+P"],
      global: true,
      hidden: true,
      run: () => shell().set({ paletteOpen: !shell().paletteOpen }),
    },
    {
      id: "app.settings",
      title: "Settings",
      category: "View",
      keys: ["Mod+,"],
      global: true,
      run: () => shell().set({ settingsOpen: true }),
    },
    {
      id: "app.shortcuts",
      title: "Keyboard shortcuts",
      category: "View",
      keys: ["Shift+/"],
      run: () => shell().set({ shortcutsOpen: true }),
    },
    ...LAYOUT_PRESETS.map((l, i) => ({
      id: `layout.${l.id}`,
      title: `Layout: ${l.label}`,
      category: "View",
      keys: [`Mod+Alt+${i + 1}`],
      run: () => dock.api && applyPreset(dock.api, l.id),
    })),
    ...PANELS.map((p) => ({
      id: `panel.${p.id}`,
      title: `Show ${p.title}`,
      category: "Panels",
      run: () => dock.api && openPanel(dock.api, p.id),
    })),
    ...THEMES.map((t) => ({
      id: `theme.${t.id}`,
      title: `Theme: ${t.label}`,
      category: "Theme",
      run: () => useSettings.getState().set({ theme: t.id }),
    })),
    {
      id: "theme.system",
      title: "Theme: follow system",
      category: "Theme",
      run: () => useSettings.getState().set({ theme: "system" }),
    },
  ];
}
