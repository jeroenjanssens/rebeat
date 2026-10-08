import type { Hints } from "./types";

/** Explain-mode hints for the drum machine panel and all its sub-components. */
const hints: Hints = {
  // ─────────────────────────────────── Header bar ────────────────────────────────────
  "dm.header.view": {
    title: "Grid / Pads view",
    text: "Switch between the step grid and the large pad view. Grid shows every track's steps at once; Pads shows playable pads alongside the selected track's steps.",
    command: "dm.view",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.page-name": {
    title: "Page name",
    text: "The number and name of the page you're editing. Click the name to rename it.",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.steps": {
    title: "Steps",
    text: "How many steps this page has (8 to 128). Fewer steps hide the extras without deleting them, so you can grow the page again later. Type a custom number under Custom.",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.size": {
    title: "Step size",
    text: "The length of one step: 1/4, 1/8, 1/8T, 1/16, 1/16T or 1/32. Steps × size is the total page length.",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.swing": {
    title: "Swing",
    text: "The page's own swing amount. It follows the song's swing until you change it (the label then shows Swing·P). Double-click to follow the song swing again.",
    keys: "Double-click: reset to song swing",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.key": {
    title: "Key and scale",
    text: "The key and scale used for note names, the note pads and scale lock. Pick the root note and scale, or give just this page its own key.",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.tool.draw": {
    title: "Draw tool",
    text: "Click or drag across pads to turn steps on or off. Shift+drag on a lit pad sets its velocity.",
    command: "dm.draw",
    guide: "drum-machine-pads-steps",
  },
  "dm.header.tool.erase": {
    title: "Erase tool",
    text: "Click or drag across pads to erase steps.",
    command: "dm.erase",
    guide: "drum-machine-pads-steps",
  },
  "dm.header.tool.select": {
    title: "Select tool",
    text: "Drag a selection box over pads to select them. Hold Shift to add to the current selection. Edit selected steps with the Step bank.",
    command: "dm.select",
    guide: "drum-machine-pads-steps",
  },
  "dm.header.quantize": {
    title: "Quantize",
    text: "Snap live-recorded hits to the nearest grid division. Off records the exact timing; 1/16 is the tightest common grid.",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.zoom-out": {
    title: "Zoom out",
    text: "Show more steps at once by shrinking the pads. You can also hold Ctrl/Cmd and scroll over the pads.",
    keys: "Ctrl/Cmd+scroll over the pads",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.zoom-in": {
    title: "Zoom in",
    text: "Enlarge the pads so velocity bars and note names are easier to read. You can also hold Ctrl/Cmd and scroll over the pads.",
    keys: "Ctrl/Cmd+scroll over the pads",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.follow": {
    title: "Follow",
    text: "When on, the drum machine automatically shows whichever page is playing. Turn it off to keep editing a different page while the song plays.",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.lanes": {
    title: "Parameter lanes",
    text: "Show velocity, probability and nudge lanes below the selected track. Drag over a bar to set the value for that step.",
    guide: "drum-machine-the-header-bar",
  },
  "dm.header.more": {
    title: "More options",
    text: "Open the condensed menu with step size, swing, quantize, follow and lane options — controls shown directly in larger panels.",
    guide: "drum-machine-the-header-bar",
  },

  // ─────────────────────────────────── Page strip ────────────────────────────────────
  "dm.page.thumb": {
    title: "Page",
    text: "Click to edit this page. While the song is playing, clicking also queues it to start when the current page ends. The progress bar underneath shows how far along the playing page is.",
    keys: "Drag: reorder · Alt+drag: copy · Alt+Shift+drag: clone · Right-click: page options",
    guide: "drum-machine-the-page-strip",
  },
  "dm.page.add": {
    title: "Add page",
    text: "Add a new empty page after the current one, with the same step count and step size.",
    guide: "drum-machine-the-page-strip",
  },
  "dm.page.song-loop": {
    title: "Loop song",
    text: "In Song mode: when on, the song starts over after the last page. When off, it stops at the end.",
    guide: "pages-playing-a-song",
  },
  "dm.page.mode": {
    title: "Playback mode",
    text: "Loop page repeats the current page indefinitely. Song plays all pages in order, each for its repeat count, then loops or stops. Saved with the project.",
    guide: "pages-playing-a-song",
  },

  // ─────────────────────────────────── Encoder strip ─────────────────────────────────
  "dm.encoder.display": {
    title: "Track display",
    text: "Shows the selected track: its number, name, type, waveform (or envelope shape for instruments) and the sound's name. When steps are selected it shows the count.",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "dm.encoder.bank.sound": {
    title: "Sound bank",
    text: "The eight knobs control this track's sound parameters: tune, decay, filter and more. With steps selected, turning a knob sets a parameter lock on those steps only.",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "dm.encoder.bank.step": {
    title: "Step bank",
    text: "Edit selected steps: velocity, probability, nudge, ratchet, pitch and more. Select steps first with Alt+click or the Select tool. Turning a knob adjusts all selected steps by the same amount.",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "dm.encoder.bank.fx": {
    title: "FX bank",
    text: "Control the parameters of the track's effects. Use the ◀ ▶ arrows to step through multiple effects. Add effects in the Inspector.",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "dm.encoder.bank.mix": {
    title: "Mix bank",
    text: "Control this track's level, pan, reverb and delay sends, stereo width and three-band EQ.",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "dm.encoder.fx-prev": {
    title: "Previous effect",
    text: "Switch to the previous effect on this track.",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "dm.encoder.fx-next": {
    title: "Next effect",
    text: "Switch to the next effect on this track.",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "dm.encoder.compact-toggle": {
    title: "Show encoders",
    text: "Expand the encoder strip to access the eight knobs and the track display. Click again to collapse it.",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },

  // ─────────────────────────────────── Track rows ────────────────────────────────────
  "dm.track.drag": {
    title: "Drag to reorder",
    text: "Drag this colored bar up or down to change the order of tracks. Clicking anywhere on the track row selects it.",
    guide: "drum-machine-tracks",
  },
  "dm.track.name": {
    title: "Track name",
    text: "Click to rename this track. Right-click for more options: duplicate, delete, color, replace sound, copy/paste steps, and per-page settings like length and rate.",
    keys: "Right-click: track options",
    guide: "drum-machine-tracks",
  },
  "dm.track.mute": {
    title: "Mute",
    text: "Silence this track. Muted tracks still appear in the mix but don't play. Click again to unmute.",
    command: "dm.mute",
    guide: "drum-machine-tracks",
  },
  "dm.track.solo": {
    title: "Solo",
    text: "Solo this track so only soloed tracks play. Click again to unsolo. Shift+SOLO from the function bar unsolo all at once.",
    command: "dm.solo",
    guide: "drum-machine-tracks",
  },
  "dm.track.arm": {
    title: "Record arm",
    text: "Arm this track for recording. Arm an audio track to record a loop from the microphone; arm an instrument track to record MIDI from pads or a MIDI controller.",
    guide: "drum-machine-audio-tracks",
  },
  "dm.track.fader": {
    title: "Volume",
    text: "Set the track's volume. Drag left or right; hold Shift for fine control. Double-click to reset to 0 dB.",
    keys: "Shift+drag: fine · Double-click: 0 dB",
    guide: "drum-machine-tracks",
  },
  "dm.track.fx": {
    title: "Effects",
    text: "Shows how many effects are on this track. Click to open the Inspector and edit or add effects.",
    guide: "drum-machine-tracks",
  },
  "dm.track.scope": {
    title: "Scope and meter",
    text: "A live waveform and level meter for this track. Click to enlarge it with a waveform or spectrum view.",
    keys: "Click: enlarge · zoom has Scope / Spectrum switch",
    guide: "drum-machine-tracks",
  },
  "dm.track.clip-active": {
    title: "Clip active",
    text: "Turn the audio clip on or off for this page. When off, the clip is silent on this page but keeps playing on pages where it's active.",
    guide: "drum-machine-audio-tracks",
  },
  "dm.track.scratch": {
    title: "Scratch strip",
    text: "Open the scratch strip below this track to drag the audio clip back and forth like a record.",
    guide: "loop-station-scratching",
  },
  "dm.track.clip-view": {
    title: "Audio clip",
    text: "The waveform of this track's audio clip. Right-click for options: double or halve the clip length, manage overdub layers, merge layers, or clear the clip.",
    keys: "Right-click: clip options",
    guide: "drum-machine-audio-tracks",
  },
  "dm.track.clip-launch": {
    title: "Launch mode",
    text: "Loop: the clip loops and restarts at the top of each page. 1-shot: the clip plays once from the start then stops.",
    guide: "drum-machine-audio-tracks",
  },
  "dm.track.add-drum": {
    title: "Add drum track",
    text: "Add a new drum track with a default percussion sound. Drag a sample from the library or your computer here to create a drum track with that sound.",
    guide: "drum-machine-tracks",
  },
  "dm.track.add-instrument": {
    title: "Add instrument track",
    text: "Add a new polyphonic instrument track. Play notes with the note pads or open the piano roll for detailed editing.",
    guide: "drum-machine-tracks",
  },
  "dm.track.add-audio": {
    title: "Add audio track",
    text: "Add a new audio track for recording microphone loops or dropping sample files.",
    guide: "drum-machine-audio-tracks",
  },

  // ─────────────────────────────────── Step pads ─────────────────────────────────────
  "dm.step.pad": {
    title: "Step pad",
    text: "Click to toggle a step on or off. Drag across pads to paint or erase. Right-click for accent, probability, ratchet, condition and parameter lock options; on a selected pad, they apply to all selected steps.",
    keys: "Shift+drag: set velocity · Alt+click: select · Right-drag: erase · Right-click: step menu · Enter: turn the selection on/off",
    guide: "drum-machine-pads-steps",
  },

  // ─────────────────────────────────── Parameter lane ──────────────────────────────
  "dm.param-lane.bars": {
    title: "Parameter lane",
    text: "Drag up or down over a bar to set velocity, probability or nudge for that step. Only steps that are on have a bar to drag.",
    keys: "Double-click: back to the default · Alt+double-click: reset the whole lane",
    guide: "drum-machine-the-header-bar",
  },

  // ─────────────────────────────────── Function bar ──────────────────────────────────
  "dm.fn.shift": {
    title: "Shift",
    text: "Reveals the second function (small text) of each button. Click to latch it on for the next press; hold for momentary access.",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.select": {
    title: "Select",
    text: "Click to switch to the Select tool. Hold and click steps to select them. Shift+Select selects all steps of the track.",
    command: "dm.select",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.copy": {
    title: "Copy",
    text: "Copy the selected track's steps to the clipboard. Hold and click a track to copy its steps; hold and click a page to copy the whole page. Shift+Copy copies the page.",
    command: "edit.copy",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.paste": {
    title: "Paste",
    text: "Paste copied steps starting at the first selected step. Hold and click a track to paste into it.",
    command: "edit.paste",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.clear": {
    title: "Clear",
    text: "Clear the selected steps, or all steps on the track if nothing is selected. Shift+Clear clears the whole page. Hold and click a track or page to clear it.",
    command: "edit.clear",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.dupl": {
    title: "Duplicate",
    text: "Duplicate the selected track. Hold and click a page to copy it. Shift+Dupl clones the page — a linked copy that shares its pattern with the original.",
    command: "dm.duplicate",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.double": {
    title: "Double / halve",
    text: "Double the page length and copy all steps into the new half. Shift+×2 halves the page, removing the second half.",
    command: "dm.double",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.mute": {
    title: "Mute",
    text: "Mute the selected track. Hold and click tracks to mute them one by one. Shift+Mute unmutes all tracks at once.",
    command: "dm.mute",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.solo": {
    title: "Solo",
    text: "Solo the selected track so only soloed tracks play. Hold and click tracks to solo them. Shift+Solo unsolo all.",
    command: "dm.solo",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.fill": {
    title: "Fill",
    text: "While held, steps with the FILL condition play — a great way to trigger a fill pattern live. Shift+Fill latches it on until you press it again.",
    command: "dm.fill",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.repeat": {
    title: "Repeat",
    text: "Hold and press a pad to repeat the note at the current rate (shown next to the button). Shift+Repeat cycles through the available rates: 1/8, 1/16 and 1/32.",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.accent": {
    title: "Accent",
    text: "New steps you draw and pad hits will be at full velocity. Click again to turn accent off.",
    command: "dm.accent",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.rand": {
    title: "Randomize",
    text: "Randomize the on/off pattern of the selected track. Shift+Rand randomizes only the velocities, keeping the existing pattern.",
    command: "dm.random",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.euclid": {
    title: "Euclidean",
    text: "Open the Euclidean generator to spread hits as evenly as possible across a set number of steps. Shift+Euclid rotates the pattern one step.",
    command: "dm.euclid",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.nudgeL": {
    title: "Shift left",
    text: "Rotate the track's steps one position to the left. Shift+◀ nudges the selected steps slightly early instead of moving the whole pattern.",
    command: "dm.shiftLeft",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.nudgeR": {
    title: "Shift right",
    text: "Rotate the track's steps one position to the right. Shift+▶ nudges the selected steps slightly late instead.",
    command: "dm.shiftRight",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.undo": {
    title: "Undo",
    text: "Undo the last change. Shift+Undo redoes it.",
    command: "edit.undo",
    guide: "drum-machine-function-buttons",
  },
  "dm.fn.more": {
    title: "More functions",
    text: "Open a menu with all the function buttons not shown in this compact view.",
    guide: "drum-machine-function-buttons",
  },

  // ─────────────────────────────────── Pad view ──────────────────────────────────────
  "dm.pads.keyboard": {
    title: "Keyboard play",
    text: "Play pads with the computer keyboard. Drum tracks: Z X C V / A S D F / Q W E R / 1 2 3 4. Instrument tracks: A W S E D F … is a piano layout; Z and X shift the octave.",
    guide: "pad-view",
  },
  "dm.pads.drum-pad": {
    title: "Drum pad",
    text: "Click to play the track and select it. The higher you click on the pad, the louder the velocity. Hold REPEAT and click to retrigger at the repeat rate.",
    guide: "pad-view",
  },
  "dm.pads.note-pad": {
    title: "Note pad",
    text: "Play a note in the current key. Root notes are highlighted. Click higher on the pad for louder velocity. Hold REPEAT and a pad to retrigger it.",
    guide: "pad-view",
  },
  "dm.pads.scale-lock": {
    title: "Scale lock",
    text: "Snap all played notes to the current scale. Useful for staying in key while you improvise.",
    guide: "pad-view",
  },
  "dm.pads.chord.off": {
    title: "Notes mode",
    text: "Each pad plays a single note from the current key.",
    guide: "pad-view",
  },
  "dm.pads.chord.triad": {
    title: "Triads mode",
    text: "Each pad plays a three-note triad chord built on that scale degree.",
    guide: "pad-view",
  },
  "dm.pads.chord.seventh": {
    title: "Seventh chords",
    text: "Each pad plays a four-note seventh chord built on that scale degree.",
    guide: "pad-view",
  },
  "dm.pads.step-count": {
    title: "Track step count",
    text: "Set the number of steps for this track on this page. A shorter count makes the track loop inside the page — great for polyrhythms (e.g. 3 or 5 against 16).",
    guide: "pad-view",
  },
  "dm.pads.back": {
    title: "Back to drum pads",
    text: "Switch back to the 4×4 drum pad layout.",
    guide: "pad-view",
  },

  // ─────────────────────────────────── Euclid popover ───────────────────────────────
  "dm.euclid.close": {
    title: "Close",
    text: "Close the Euclidean generator.",
  },
  "dm.euclid.pulses": {
    title: "Pulses",
    text: "How many hits to distribute across the steps. Euclid places them as evenly as possible — great for classic rhythms like 5 over 16.",
    guide: "drum-machine-function-buttons",
  },
  "dm.euclid.steps": {
    title: "Steps",
    text: "How many steps the Euclidean pattern spans. Can be shorter than the track's full step count.",
    guide: "drum-machine-function-buttons",
  },
  "dm.euclid.rotate": {
    title: "Rotate",
    text: "Offset the pattern by this many steps, shifting the whole rhythm forward in time.",
    guide: "drum-machine-function-buttons",
  },

  // ─────────────────────────────────── Scratch strip ────────────────────────────────
  "dm.scratch.platter": {
    title: "Scratch platter",
    text: "Drag the platter to move the audio clip forwards or backwards like a record. Release and it snaps back to the current playback position.",
    guide: "loop-station-scratching",
  },
  "dm.scratch.strip": {
    title: "Scratch strip",
    text: "Drag left or right to scratch the clip. The speed of your drag sets the playback speed. Release to return to the beat. The scroll wheel also nudges the record.",
    keys: "Scroll: nudge the record",
    guide: "loop-station-scratching",
  },
  "dm.scratch.cut": {
    title: "Cut",
    text: "Hold to silence the audio while you scratch, then release to bring it back. Use this for transform and crab scratch styles.",
    guide: "loop-station-scratching",
  },

  // ─────────────────────────────────── Track menu: sound ─────────────────────────────
  "dm.sound.show": {
    title: "Show in library",
    text: "Select this track's sample in the library, to see its details or find similar sounds.",
    guide: "drum-machine-tracks",
  },
  "dm.sound.edit": {
    title: "Open in sample editor",
    text: "Trim, tune, loop or slice this track's sample in the sample editor.",
    guide: "sample-editor",
  },
  "dm.sound.kind": {
    title: "Kind of sound",
    text: "Instrument tracks can play a built-in synth, one of your samples across the keyboard (Sampler), or a sampled instrument such as a grand piano or strings (streamed the first time you use it).",
    guide: "instruments-sound-sources",
  },
  "dm.sound.search": {
    title: "Find a sound",
    text: "Type to filter your library samples and the built-in sounds. Enter picks the first match.",
    guide: "drum-machine-tracks",
  },
  "dm.sound.list": {
    title: "Replace the sound",
    text: "Click a sound to play it on this track instead: a sample, or on instrument tracks a synth preset or sampled instrument. The track keeps its steps, effects and settings; undo brings the old sound back.",
    guide: "drum-machine-tracks",
  },
};

export default hints;
