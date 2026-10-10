import * as clock from "../engine/transport";
import { platform } from "../platform";
import { clearSelection, fnClick, fnPress, fnRelease } from "../state/actions";
import { cursorToggle, moveCursor, velocityDigit } from "../state/input";
import { THEMES, useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { TEMPLATES } from "../templates";
import { EXAMPLES } from "../templates/examples";
import type { Command } from "./commands";
import * as projectActions from "./projectActions";
import { toggleMaximize } from "./Dock";
import { LAYOUT_PRESETS, applyPreset, openPanel } from "./layouts";
import { togglePanelFullscreen } from "./PanelFrame";
import { hoveredHint } from "./hintLayer";
import { openGuide } from "./openers";
import { PANELS } from "./panels";
import { dock, useShell } from "./shell";
import { tapTempo } from "./TransportBar";

const store = () => useStore.getState();
const shell = () => useShell.getState();

/** Edit the page next to the one being edited; while playing it's queued, as a click does. */
function stepPage(dir: 1 | -1) {
  const s = store();
  const i = s.project.slots.findIndex((x) => x.id === s.editSlotId);
  const next = s.project.slots[Math.max(0, Math.min(s.project.slots.length - 1, i + dir))];
  if (!next || next.id === s.editSlotId) return;
  s.setUi({ editSlotId: next.id, selectedSteps: {} });
  if (s.playing && next.id !== s.playSlotId) s.setUi({ queuedSlotId: next.id });
  else if (!s.playing) s.setUi({ playSlotId: next.id });
}

/** Select the track above or below: a controller's knobs follow the selected track (D121). */
function stepTrack(dir: 1 | -1) {
  const s = store();
  const tracks = s.project.tracks;
  const i = tracks.findIndex((t) => t.id === s.selectedTrackId);
  const next = tracks[Math.max(0, Math.min(tracks.length - 1, i < 0 ? 0 : i + dir))];
  if (next) s.setUi({ selectedTrackId: next.id });
}

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
    // for controllers' Play and Stop buttons (D122, D123)
    {
      id: "transport.play",
      title: "Play",
      category: "Transport",
      run: () => void (store().playing || clock.play()),
    },
    { id: "transport.stop", title: "Stop", category: "Transport", run: clock.stop },
    { id: "transport.tap", title: "Tap tempo", category: "Transport", keys: ["T"], run: tapTempo },
    {
      id: "page.next",
      title: "Next page",
      category: "Pages",
      run: () => stepPage(1),
    },
    {
      id: "page.previous",
      title: "Previous page",
      category: "Pages",
      run: () => stepPage(-1),
    },
    {
      id: "track.next",
      title: "Select the next track",
      category: "Tracks",
      run: () => stepTrack(1),
    },
    {
      id: "track.previous",
      title: "Select the previous track",
      category: "Tracks",
      run: () => stepTrack(-1),
    },
    {
      id: "beatbox.record",
      title: "Record a beatbox",
      category: "Transport",
      // the Beatbox panel, recording a 4-bar take to the metronome (D111)
      run: () => {
        if (dock.api) openPanel(dock.api, "beatbox");
        void import("../library/beatbox/record").then((m) => m.recordTake("metronome", 4));
      },
    },
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
      run: () => store().setPlayMode(store().project.playMode === "loop" ? "song" : "loop"),
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

    // ---- project ----
    {
      id: "project.home",
      title: "Projects…",
      category: "Project",
      keys: ["Mod+O"],
      global: true,
      run: () => shell().set({ homeOpen: true }),
    },
    {
      id: "project.save",
      title: "Save",
      category: "Project",
      keys: ["Mod+S"],
      global: true,
      run: () => void projectActions.save(),
    },
    {
      id: "project.export",
      title: "Export .rebeat…",
      category: "Project",
      keys: ["Mod+Shift+E"],
      run: () => void projectActions.exportProject(),
    },
    {
      id: "project.exportAudio",
      title: "Export audio / MIDI…",
      category: "Project",
      keys: ["Mod+E"],
      global: true,
      run: () => shell().set({ exportOpen: true }),
    },
    {
      id: "project.import",
      title: "Import .rebeat…",
      category: "Project",
      run: () => void projectActions.importProjectFile(),
    },
    {
      id: "project.folder",
      title: "Save to folder…",
      category: "Project",
      enabled: () => platform.files.supportsFolders,
      run: () => void projectActions.saveToFolder(),
    },
    {
      id: "project.duplicate",
      title: "Duplicate project",
      category: "Project",
      run: () => void projectActions.duplicate(store().projectId),
    },
    ...EXAMPLES.map((e) => ({
      id: `project.example.${e.id}`,
      title: `Open example: ${e.name} (${e.artist})`,
      category: "Project",
      run: () => void projectActions.open(`example:${e.id}`),
    })),
    ...TEMPLATES.map((t) => ({
      id: `project.new.${t.id}`,
      title: `New project: ${t.name}`,
      category: "Project",
      run: () => void projectActions.newFromTemplate(t.id),
    })),

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

    // ---- step cursor ----
    {
      id: "cursor.left",
      title: "Step cursor left",
      category: "Step cursor",
      keys: ["Left"],
      run: () => moveCursor(-1, 0),
    },
    {
      id: "cursor.right",
      title: "Step cursor right",
      category: "Step cursor",
      keys: ["Right"],
      run: () => moveCursor(1, 0),
    },
    {
      id: "cursor.up",
      title: "Step cursor up",
      category: "Step cursor",
      keys: ["Up"],
      run: () => moveCursor(0, -1),
    },
    {
      id: "cursor.down",
      title: "Step cursor down",
      category: "Step cursor",
      keys: ["Down"],
      run: () => moveCursor(0, 1),
    },
    {
      id: "cursor.toggle",
      title: "Toggle step at cursor / turn selected steps on or off",
      category: "Step cursor",
      keys: ["Enter"],
      run: cursorToggle,
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `cursor.velocity${i + 1}`,
      title: `Velocity ${Math.round(((i + 1) / 9) * 127)}`,
      category: "Step cursor",
      keys: [String(i + 1)],
      hidden: true,
      run: () => velocityDigit(i + 1),
    })),

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
      id: "app.guide",
      title: "Guide",
      category: "View",
      keys: ["F1"],
      global: true,
      // over a button in explain mode: its section of the guide
      run: () => openGuide(hoveredHint()?.guide),
    },
    {
      id: "app.explain",
      title: "Explain mode",
      category: "View",
      keys: ["Shift+F1"],
      global: true,
      run: () => useSettings.getState().set({ explain: !useSettings.getState().explain }),
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
