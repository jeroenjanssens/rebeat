import type { Hints } from "./types";

const hints: Hints = {
  // ── Transport bar ────────────────────────────────────────────────────────
  "transport.project": {
    title: "Project name",
    text: "Click to open the project browser, where you can switch projects, create new ones, or import and export files.",
    command: "project.home",
    guide: "projects-projects",
  },
  "transport.play": {
    title: "Play / Stop",
    text: "Start or stop playback. Playback begins at the page you're editing.",
    command: "transport.toggle",
    guide: "transport-bar",
  },
  "transport.record": {
    title: "Record",
    text: "While playing, pads you hit are written into the pattern. With an armed Clip track it records a loop. Press again to stop recording.",
    command: "transport.record",
    guide: "transport-bar",
  },
  "transport.loop": {
    title: "Loop length",
    text: "Sets how long a loop recording runs: the page length, or 1, 2, 4, or 8 bars.",
    guide: "transport-bar",
  },
  "transport.position": {
    title: "Playhead position",
    text: "Shows where playback is right now: bar . beat . step.",
    guide: "transport-bar",
  },
  "transport.bpm": {
    title: "Tempo (BPM)",
    text: "The song's tempo in beats per minute. Drag up or down, or scroll to change it. Double-click to reset to 120.",
    keys: "Shift+drag: fine adjustment · Double-click: reset to 120",
    guide: "transport-bar",
  },
  "transport.tap": {
    title: "Tap tempo",
    text: "Tap several times in time with the music to set the tempo.",
    command: "transport.tap",
    guide: "transport-bar",
  },
  "transport.timesig": {
    title: "Time signature",
    text: "Choose from 4/4, 3/4, 5/4, 6/8, or 7/8. This affects how the bar.beat.step position is counted.",
    guide: "transport-bar",
  },
  "transport.metronome": {
    title: "Metronome",
    text: "Turns the click track on or off while playing. The metronome click is not recorded or exported.",
    command: "transport.metronome",
    guide: "transport-bar",
  },
  "transport.countin": {
    title: "Count-in",
    text: "When on, Rebeat plays one bar of clicks (or two — set in Settings) before playback or recording starts from a stopped position.",
    guide: "transport-bar",
  },
  "transport.swing": {
    title: "Swing",
    text: "Adds a shuffle feel to the whole song. 50% is straight; higher values delay every second step. Pages and tracks can have their own swing too.",
    keys: "Drag or scroll · Double-click: reset to 50% (straight)",
    guide: "transport-bar",
  },
  "transport.quantize": {
    title: "Quantize",
    text: "Snaps live-recorded pad hits to the nearest note value. Set to Off to keep the exact timing you play.",
    guide: "transport-bar",
  },
  "transport.playmode": {
    title: "Playback mode",
    text: "Page loops the current page; Song plays all your pages in order with their repeat counts. Saved with the project.",
    command: "transport.mode",
    guide: "transport-bar",
  },
  "transport.cpu": {
    title: "CPU meter",
    text: "Shows how busy the app is drawing and scheduling audio. If it stays high you may hear glitches — try closing other tabs or lowering the UI scale in Settings.",
    guide: "transport-bar",
  },
  "transport.masterlevel": {
    title: "Master level",
    text: "The output level of the master mix, left and right channels. Green is healthy; yellow is loud; red means the signal is clipping.",
    guide: "transport-bar",
  },
  "transport.audiostatus": {
    title: "Audio status",
    text: "Green means audio is running normally. Yellow means it's starting up. Red means an error — click to try starting again.",
    guide: "transport-bar",
  },
  "transport.explain": {
    title: "Explain mode",
    text: "Turn this on to see detailed cards like this one when you hover over controls. In Explain mode, pressing F1 jumps to the guide section for whatever you're hovering.",
    command: "app.explain",
    guide: "getting-started-getting-help",
  },

  // ── App-wide controls ────────────────────────────────────────────────────
  "app.palette": {
    title: "Command palette",
    text: "Search for any action, shortcut, panel, or layout preset from a single box.",
    command: "app.palette",
    guide: "getting-started-getting-help",
  },
  "app.layouts": {
    title: "Layouts and panels",
    text: "Switch between the Compose, Perform, and Edit layout presets, or show any panel that isn't currently visible.",
    guide: "panels-layout-presets",
  },
  "app.fullscreen": {
    title: "Full screen",
    text: "Expands Rebeat to fill your whole screen. Press Esc to leave full screen.",
    command: "view.fullscreen",
    guide: "panels-bigger-panels",
  },
  "app.guide": {
    title: "Open guide",
    text: "Opens this guide. In Explain mode, pressing F1 jumps straight to the guide section for whatever you're hovering over.",
    command: "app.guide",
    guide: "getting-started-getting-help",
  },
  "app.settings": {
    title: "Settings",
    text: "Open Settings to change the theme, audio device, MIDI setup, latency, and more.",
    command: "app.settings",
    guide: "settings",
  },

  // ── Panel header buttons (Dock) ──────────────────────────────────────────
  "app.panel.popout": {
    title: "Pop out",
    text: "Moves this panel into its own window. Useful when you have a second screen.",
    guide: "panels-bigger-panels",
  },
  "app.panel.fullscreen": {
    title: "Panel full screen",
    text: "Shows only this panel across the whole screen. Move the mouse to the top to reveal the floating transport. Press Esc to return.",
    command: "view.panelFullscreen",
    guide: "panels-bigger-panels",
  },
  "app.panel.maximize": {
    title: "Maximize panel",
    text: "Fills the window with this panel while keeping the transport bar. Click again or double-click the tab to restore the layout.",
    command: "view.maximize",
    guide: "panels-bigger-panels",
  },

  // ── Project browser ──────────────────────────────────────────────────────
  "app.project.import": {
    title: "Import .rebeat",
    text: "Open a .rebeat file from your computer. You can also drag a file directly onto the project browser.",
    command: "project.import",
    guide: "projects-saving-a-project-file",
  },
  "app.project.template": {
    title: "New from template",
    text: "Start a fresh project from a template. Templates set up tracks, sounds, and a basic groove for you.",
    guide: "projects-projects",
  },
  "app.project.example": {
    title: "Open example",
    text: "Load a demo groove. Changing an example automatically makes a copy in your own projects, so the original stays untouched.",
    guide: "projects-projects",
  },
  "app.project.card": {
    title: "Open project",
    text: "Click to open this project. Right-click for more options: duplicate, export, or delete.",
    keys: "Right-click: more options",
    guide: "projects-projects",
  },
  "app.project.rename": {
    title: "Rename project",
    text: "Click the name to edit it inline.",
    guide: "projects-projects",
  },
  "app.project.duplicate": {
    title: "Duplicate",
    text: "Make a copy of this project. The copy is added to your project list.",
    guide: "projects-projects",
  },
  "app.project.export": {
    title: "Export .rebeat",
    text: "Save this project as a .rebeat file with all its samples included. Use it to back up or move a project to another computer.",
    command: "project.export",
    guide: "projects-saving-a-project-file",
  },
  "app.project.delete": {
    title: "Delete project",
    text: "Permanently deletes this project. This can't be undone. You can't delete the project that's currently open.",
    guide: "projects-projects",
  },

  // ── Export dialog ────────────────────────────────────────────────────────
  "app.export.range": {
    title: "Export range",
    text: "Song renders the whole arrangement; Current page renders only the page you're editing right now.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.source": {
    title: "Source",
    text: "Export the full mix (master output) or isolate a single track. Choosing a track exports only that track's audio.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.format": {
    title: "File format",
    text: "WAV is uncompressed, for further work in other software. MP3 and OGG are compressed, small files for sharing.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.quality.wav": {
    title: "Bit depth",
    text: "24-bit is the standard for production; 32-bit float keeps headroom for further processing; 16-bit is CD quality.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.quality.mp3": {
    title: "MP3 bit rate",
    text: "Higher sounds better and makes bigger files. 320 kbit/s is the best MP3 can do; 128 is fine for sketches.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.quality.ogg": {
    title: "OGG quality",
    text: "Higher sounds better and makes bigger files. Good is about 192 kbit/s.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.sampleexport.source": {
    title: "Which audio",
    text: "As heard: with the sample editor's settings (trim, fades, tuning…), in the format you choose. Original file: the stored file itself, unchanged.",
    guide: "library-using-samples",
  },
  "app.sampleexport.run": {
    title: "Export",
    text: "Save the sample as a file on your computer.",
    guide: "library-using-samples",
  },
  "app.export.stems": {
    title: "Stems",
    text: "When checked, exports one WAV file per track, packed into a zip. Useful for mixing in another DAW.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.wav": {
    title: "Export audio",
    text: "Renders the project and saves it in the chosen format (WAV, MP3 or OGG). Rendering runs offline, faster than real time.",
    command: "project.exportAudio",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.midi": {
    title: "Export MIDI",
    text: "Exports all note and drum data as a MIDI file with one track per instrument. Drums use channel 10 with General MIDI note numbers.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.resamplelib": {
    title: "Resample to library",
    text: "Renders the project and saves the result as a new sample in the library, under Recordings. Great for bouncing a loop for further use.",
    guide: "projects-exporting-audio-and-midi",
  },
  "app.export.resampletrack": {
    title: "Resample to track",
    text: "Renders and immediately adds the result as a new Clip track in the project.",
    guide: "projects-exporting-audio-and-midi",
  },

  // ── Audio start overlay ──────────────────────────────────────────────────
  "app.audiostart": {
    title: "Start audio",
    text: "Click anywhere to start the audio engine. Browsers require a user gesture before they'll play sound.",
    guide: "getting-started-starting-the-sound",
  },

  // ── Shortcuts dialog ─────────────────────────────────────────────────────
  "app.shortcuts.filter": {
    title: "Filter shortcuts",
    text: "Type to search for a command by name or category.",
  },
  "app.shortcuts.reset": {
    title: "Reset all shortcuts",
    text: "Removes all custom key bindings and restores the defaults.",
  },
  "app.shortcuts.rebind": {
    title: "Rebind shortcut",
    text: "Click the key badge, then press the new key combination. Press Esc to cancel without changing anything.",
    guide: "shortcuts",
  },
  "app.shortcuts.resetone": {
    title: "Reset this shortcut",
    text: "Resets this command's shortcut to its default, removing your custom binding.",
  },

  // ── Settings dialog ──────────────────────────────────────────────────────
  "app.settings.tab": {
    title: "Settings section",
    text: "Switch between Appearance, Audio, MIDI, Projects, and Storage settings.",
    guide: "settings",
  },
  "app.settings.shortcuts": {
    title: "Keyboard shortcuts",
    text: "Open the full shortcut list, where you can see and rebind any command.",
    command: "app.shortcuts",
    guide: "shortcuts",
  },
  "app.settings.theme": {
    title: "Theme",
    text: "Choose the color theme. System follows your computer's own light or dark setting.",
    guide: "settings-appearance",
  },
  "app.settings.accent": {
    title: "Accent color",
    text: "Pick the highlight color used for active controls. Theme uses the theme's built-in color. Use the color picker at the right for a custom hue.",
    guide: "settings-appearance",
  },
  "app.settings.scale": {
    title: "UI scale",
    text: "Make the whole interface larger or smaller, from 80% to 150%.",
    guide: "settings-appearance",
  },
  "app.settings.density": {
    title: "Spacing",
    text: "Comfortable gives more padding around controls; Compact squeezes more into the same space.",
    guide: "settings-appearance",
  },
  "app.settings.explain": {
    title: "Explain mode",
    text: "Turn on to see detailed hover cards for every control. Same as the speech-bubble button in the transport bar.",
    command: "app.explain",
    guide: "getting-started-getting-help",
  },
  "app.settings.reducedmotion": {
    title: "Reduced motion",
    text: "Limits animations for accessibility. System follows your OS preference; you can also force it on or off.",
    guide: "settings-appearance",
  },
  "app.settings.outputdevice": {
    title: "Output device",
    text: "Where Rebeat's sound goes. Choosing a specific device only works in Chrome and Edge.",
    guide: "settings-audio",
  },
  "app.settings.inputdevice": {
    title: "Input device",
    text: "The microphone or audio interface input used for recording. Device names appear after you grant microphone permission.",
    guide: "settings-audio",
  },
  "app.settings.latency": {
    title: "Latency",
    text: "Low is most responsive; Safe reduces glitches on slower machines. The change takes effect after you reload the page.",
    guide: "settings-audio",
  },
  "app.settings.reclatency": {
    title: "Recording latency",
    text: "How many milliseconds recordings are shifted back in time to compensate for input latency. Use Calibrate to measure it automatically.",
    guide: "settings-audio",
  },
  "app.settings.calibrate": {
    title: "Calibrate recording latency",
    text: "Plays clicks through your speakers and records them with the microphone to measure the round-trip time automatically.",
    guide: "settings-audio",
  },
  "app.settings.freefirstloop": {
    title: "Free first loop",
    text: "When nothing is playing, the length of the first loop recording sets the tempo, treating that recording as one bar.",
    guide: "loop-station-free-first-loop",
  },
  "app.settings.monitor": {
    title: "Monitor while armed",
    text: "Hear the input through armed Clip tracks while recording. Turn this off if your audio interface already monitors the input directly.",
    guide: "loop-station-monitoring-and-latency",
  },
  "app.settings.speakermode": {
    title: "Speaker mode",
    text: "Enables echo cancellation so you can record without headphones. Turn off when using headphones or a separate interface.",
    guide: "settings-audio",
  },
  "app.settings.autosave": {
    title: "Autosave",
    text: "Saves your project automatically a moment after each change. Recommended — without it, changes may be lost if you close the tab.",
    guide: "settings-projects",
  },
  "app.settings.pageswitch": {
    title: "Page switch",
    text: "When you queue a different page while playing, this sets when the switch happens: at the end of the page, on the next bar, or on the next beat.",
    guide: "settings-projects",
  },
  "app.settings.countinlen": {
    title: "Count-in length",
    text: "How many bars of clicks play before recording or playback starts from a stop when count-in is enabled.",
    guide: "settings-projects",
  },
  "app.settings.storageused": {
    title: "Storage used",
    text: "How much browser storage your projects and samples are using.",
    guide: "settings-storage",
  },
  "app.settings.persiststorage": {
    title: "Request persistent storage",
    text: "Asks the browser to never automatically clear Rebeat's data to free up space. Recommended if you have many samples.",
    guide: "settings-storage",
  },

  // ── MIDI settings ────────────────────────────────────────────────────────
  "app.midi.enable": {
    title: "Enable MIDI",
    text: "Grants Web MIDI access so Rebeat can receive notes, CC messages, and controller input.",
    guide: "performance-midi",
  },
  "app.midi.input": {
    title: "MIDI input",
    text: "Enable or disable individual MIDI input devices. Enabled inputs send notes to the selected Notes track, or hits to step tracks 1, 2, 3… from note 36 up.",
    guide: "performance-midi",
  },
  "app.midi.connect": {
    title: "Connect Launchpad / Push",
    text: "Connects a Novation Launchpad or Ableton Push. Pads show 8 tracks × 8 steps in track colors; arrows scroll; Push encoders control the selected track's sound.",
    guide: "performance-launchpad-and-push",
  },
  "app.midi.removemap": {
    title: "Remove mapping",
    text: "Removes this MIDI learn mapping from the project.",
    guide: "performance-midi",
  },

  // ── Calibration dialog ───────────────────────────────────────────────────
  "app.calibration.start": {
    title: "Start calibration",
    text: "Plays a series of clicks through your speakers and records them with the microphone to measure the recording latency. Use speakers (not headphones), or a loopback cable from your interface's output to its input.",
    guide: "settings-audio",
  },
  "app.calibration.use": {
    title: "Use measured latency",
    text: "Sets the recording latency compensation to the measured value and closes the dialog.",
    guide: "settings-audio",
  },
  "app.calibration.again": {
    title: "Measure again",
    text: "Runs the calibration measurement again.",
    guide: "settings-audio",
  },
};

export default hints;
