import type { Hints } from "./types";

const hints: Hints = {
  // ── Toolbar ───────────────────────────────────────────────────────────────
  "editor.play": {
    title: "Play / Stop",
    text: "Plays the sample with all current settings. If you have a selection, plays just that part as-is. Press again to stop.",
    keys: "Space",
    guide: "sample-editor-the-toolbar",
  },
  "editor.loop": {
    title: "Loop playback",
    text: "Loops the sample (or selection) while playing, so you can hear changes in real time.",
    guide: "sample-editor-the-toolbar",
  },
  "editor.view": {
    title: "Waveform / Spectrogram",
    text: "Switch between the waveform view (for trimming and editing) and a spectrogram (for reading the frequencies over time).",
    guide: "sample-editor-the-toolbar",
  },
  "editor.undo": {
    title: "Undo",
    text: "Steps back through this editor's own history. Also Ctrl/Cmd+Z while the editor has focus.",
    keys: "Ctrl/Cmd+Z",
    guide: "sample-editor-the-toolbar",
  },
  "editor.redo": {
    title: "Redo",
    text: "Re-applies the last undone change in this editor. Also Shift+Ctrl/Cmd+Z.",
    keys: "Shift+Ctrl/Cmd+Z",
    guide: "sample-editor-the-toolbar",
  },
  "editor.export": {
    title: "Export",
    text: "Save this sample as a WAV, MP3 or OGG file. It exports the sample as stored: Apply first to include changes you're still making.",
    guide: "sample-editor-the-toolbar",
  },
  "editor.saveAsNew": {
    title: "Save as new",
    text: "Renders all settings and edits into a new sample in the library, leaving the original unchanged.",
    guide: "sample-editor-the-toolbar",
  },
  "editor.apply": {
    title: "Apply",
    text: "Stores your changes on this sample. Every track in every project that uses it gets the new sound. The button shows how many tracks that affects here.",
    guide: "sample-editor-the-toolbar",
  },
  // ── Waveform ──────────────────────────────────────────────────────────────
  "editor.waveform": {
    title: "Waveform",
    text: "Drag on the waveform to select a range. Scroll to zoom in and out. Drag the trim edges (light region), fade handles (yellow regions) and loop region (purple) to adjust them.",
    keys: "Scroll: zoom · Drag: select",
    guide: "sample-editor-on-the-waveform",
  },
  // ── Tabs ──────────────────────────────────────────────────────────────────
  "editor.tab.edit": {
    title: "Edit tab",
    text: "Fade in/out, gain, normalize, reverse, remove DC, trim tools and clipboard operations on the selection.",
    guide: "sample-editor-the-tabs",
  },
  "editor.tab.envelope": {
    title: "Envelope tab",
    text: "Apply an AHDSR amplitude envelope or draw a free-form volume curve on the waveform.",
    guide: "sample-editor-the-tabs",
  },
  "editor.tab.tune": {
    title: "Tune tab",
    text: "Transpose by semitones or cents, and stretch the length without changing the pitch (or vice versa).",
    guide: "sample-editor-the-tabs",
  },
  "editor.tab.loop": {
    title: "Loop tab",
    text: "Set loop points for sustained sounds and add a crossfade so the loop joins smoothly.",
    guide: "sample-editor-the-tabs",
  },
  "editor.tab.slice": {
    title: "Slice tab",
    text: "Place slice markers by transients or on a grid, then turn each slice into its own step track.",
    guide: "sample-editor-the-tabs",
  },
  "editor.tab.fx": {
    title: "FX tab",
    text: "Add effects to hear and then render them permanently into the sample audio.",
    guide: "sample-editor-the-tabs",
  },
  "editor.tab.analyze": {
    title: "Analyze tab",
    text: "Detects the tempo and musical key, and shows peak, RMS and integrated loudness (LUFS).",
    guide: "sample-editor-the-tabs",
  },
  // ── Edit tab ──────────────────────────────────────────────────────────────
  "editor.snap": {
    title: "Snap to zero",
    text: "Makes trim and selection points snap to the nearest zero crossing to avoid clicks at the edit points.",
    guide: "sample-editor-on-the-waveform",
  },
  "editor.fadeIn": {
    title: "Fade in",
    text: "Sets how long the sample takes to fade up from silence at the start. Drag up or down.",
    keys: "Drag: adjust · Double-click: reset to 0",
    guide: "sample-editor-the-tabs",
  },
  "editor.fadeOut": {
    title: "Fade out",
    text: "Sets how long the sample fades to silence at the end. Drag up or down.",
    keys: "Drag: adjust · Double-click: reset to 0",
    guide: "sample-editor-the-tabs",
  },
  "editor.fadeCurve": {
    title: "Fade curve",
    text: "The shape of the fade: linear (straight line), exp (fast then slow), log (slow then fast), or S-curve.",
    guide: "sample-editor-the-tabs",
  },
  "editor.gain": {
    title: "Gain",
    text: "Adjusts the overall level of the sample in dB. Drag up for louder, down for quieter.",
    keys: "Drag: adjust · Double-click: reset to 0 dB",
    guide: "sample-editor-the-tabs",
  },
  "editor.normalize": {
    title: "Normalize",
    text: "Raises the gain so the loudest peak reaches 0 dBFS. Useful for quieter recordings.",
    guide: "sample-editor-the-tabs",
  },
  "editor.reverse": {
    title: "Reverse",
    text: "Plays the sample backwards. Great for unusual textures and reverse-reverb effects.",
    guide: "sample-editor-the-tabs",
  },
  "editor.dcRemove": {
    title: "Remove DC",
    text: "Removes any DC offset (a constant bias) from the audio, which can cause clicks and affect headroom.",
    guide: "sample-editor-the-tabs",
  },
  "editor.resetTrim": {
    title: "Reset trim",
    text: "Resets the trim start and end to include the whole sample, removing any trimming you have set.",
    guide: "sample-editor-on-the-waveform",
  },
  "editor.stripSilence": {
    title: "Strip silence",
    text: "Removes silent sections from the audio. This creates new audio (it cannot be undone without undo).",
    guide: "sample-editor-the-tabs",
  },
  "editor.cut": {
    title: "Cut selection",
    text: "Removes the selected region from the audio and copies it to the clipboard. Also Ctrl/Cmd+X or Delete.",
    keys: "Ctrl/Cmd+X · Delete",
    guide: "sample-editor-the-tabs",
  },
  "editor.copy": {
    title: "Copy selection",
    text: "Copies the selected region to the clipboard without removing it. Also Ctrl/Cmd+C.",
    keys: "Ctrl/Cmd+C",
    guide: "sample-editor-the-tabs",
  },
  "editor.paste": {
    title: "Paste",
    text: "Inserts the clipboard audio at the playhead position (or at the start of the selection). Also Ctrl/Cmd+V.",
    keys: "Ctrl/Cmd+V",
    guide: "sample-editor-the-tabs",
  },
  "editor.silence": {
    title: "Silence selection",
    text: "Fills the selected region with silence, leaving the surrounding audio in place.",
    guide: "sample-editor-the-tabs",
  },
  "editor.crop": {
    title: "Crop to selection",
    text: "Removes everything outside the selection, keeping only the selected region.",
    guide: "sample-editor-the-tabs",
  },
  "editor.trimToSel": {
    title: "Trim to selection",
    text: "Sets the trim start and end to match your selection. Unlike crop, the audio outside the trim is kept.",
    guide: "sample-editor-on-the-waveform",
  },
  // ── Envelope tab ──────────────────────────────────────────────────────────
  "editor.ahdsr": {
    title: "AHDSR envelope",
    text: "Applies an amplitude envelope with Attack, Hold, Decay, Sustain and Release stages. Useful for giving percussive shape to flat sounds.",
    guide: "sample-editor-the-tabs",
  },
  "editor.env.attack": {
    title: "Attack",
    text: "How long the sound takes to reach full volume from silence at the start.",
    keys: "Drag: adjust · Double-click: reset",
    guide: "sample-editor-the-tabs",
  },
  "editor.env.hold": {
    title: "Hold",
    text: "How long the sound stays at full volume before the decay begins.",
    keys: "Drag: adjust · Double-click: reset",
    guide: "sample-editor-the-tabs",
  },
  "editor.env.decay": {
    title: "Decay",
    text: "How long it takes to fall from full volume to the sustain level.",
    keys: "Drag: adjust · Double-click: reset",
    guide: "sample-editor-the-tabs",
  },
  "editor.env.sustain": {
    title: "Sustain",
    text: "The level the sound holds at after the decay phase, as a percentage of full volume.",
    keys: "Drag: adjust · Double-click: reset",
    guide: "sample-editor-the-tabs",
  },
  "editor.env.release": {
    title: "Release",
    text: "How long the sound takes to fade to silence from the sustain level.",
    keys: "Drag: adjust · Double-click: reset",
    guide: "sample-editor-the-tabs",
  },
  "editor.volumeEnv": {
    title: "Volume envelope",
    text: "Draws a free-form volume curve on the waveform. Drag the points on the waveform to shape it; double-click the waveform to add a new point.",
    guide: "sample-editor-the-tabs",
  },
  // ── Tune tab ──────────────────────────────────────────────────────────────
  "editor.semitones": {
    title: "Semitones",
    text: "Shifts the pitch up or down by whole semitones. Positive numbers are higher, negative are lower.",
    keys: "Drag: adjust · Double-click: reset to 0",
    guide: "sample-editor-the-tabs",
  },
  "editor.cents": {
    title: "Cents",
    text: "Fine-tunes the pitch by hundredths of a semitone. Combine with Semitones for precise tuning.",
    keys: "Drag: adjust · Double-click: reset to 0",
    guide: "sample-editor-the-tabs",
  },
  "editor.keepLength": {
    title: "Keep length",
    text: "When on, pitch changes use time-stretching so the duration stays the same. When off, pitch changes speed up or slow down the sample.",
    guide: "sample-editor-the-tabs",
  },
  "editor.stretch": {
    title: "Stretch",
    text: "Makes the sample longer or shorter without changing its pitch. 100% is the original length.",
    keys: "Drag: adjust · Double-click: reset to 100%",
    guide: "sample-editor-the-tabs",
  },
  "editor.stretchBpm.target": {
    title: "Target BPM",
    text: "The tempo you want to stretch this loop to. Defaults to the project BPM. Used by Stretch to BPM.",
    guide: "sample-editor-the-tabs",
  },
  "editor.stretchToBpm": {
    title: "Stretch to BPM",
    text: "Calculates the stretch amount needed to fit the sample's detected tempo to the target BPM. The sample must have a stored BPM for this to work.",
    guide: "sample-editor-the-tabs",
  },
  "editor.renderStretch": {
    title: "Render stretch",
    text: "Writes the stretch (and pitch shift if Keep length is on) permanently into the audio so the setting resets to 100%.",
    guide: "sample-editor-the-tabs",
  },
  // ── Loop tab ──────────────────────────────────────────────────────────────
  "editor.loop.points": {
    title: "Loop points",
    text: "Enables a loop region for sustained sounds like pads or strings. Drag the purple region on the waveform to adjust it.",
    guide: "sample-editor-the-tabs",
  },
  "editor.loop.crossfade": {
    title: "Crossfade",
    text: "Blends the loop end into the loop start so the seam is smooth. Increase if you hear a click at the loop point.",
    keys: "Drag: adjust · Double-click: reset",
    guide: "sample-editor-the-tabs",
  },
  "editor.loop.fromSel": {
    title: "Loop the selection",
    text: "Sets the loop start and end to match the current selection. Select a region first.",
    guide: "sample-editor-the-tabs",
  },
  // ── Slice tab ─────────────────────────────────────────────────────────────
  "editor.slice.sensitivity": {
    title: "Sensitivity",
    text: "Controls how easily transients are detected when using By transients. Higher values add more markers at quieter hits.",
    keys: "Drag: adjust · Double-click: reset",
    guide: "sample-editor-the-tabs",
  },
  "editor.slice.transients": {
    title: "By transients",
    text: "Places slice markers at each detected hit using the sensitivity setting. Good for drum loops.",
    guide: "sample-editor-the-tabs",
  },
  "editor.slice.grid": {
    title: "Grid divisions",
    text: "The number of equal slices to create with Equal grid.",
    keys: "Drag: adjust · Double-click: reset",
    guide: "sample-editor-the-tabs",
  },
  "editor.slice.equalGrid": {
    title: "Equal grid",
    text: "Places markers to divide the sample into the number of equal slices set by Grid.",
    guide: "sample-editor-the-tabs",
  },
  "editor.slice.addMarker": {
    title: "Add marker",
    text: "Adds a slice marker at the start of the current selection. Select a point on the waveform first.",
    guide: "sample-editor-the-tabs",
  },
  "editor.slice.clear": {
    title: "Clear markers",
    text: "Removes all slice markers.",
    guide: "sample-editor-the-tabs",
  },
  "editor.slice.toTracks": {
    title: "Slices to new step tracks",
    text: "Saves each slice as its own sample in the library, adds a step track playing hits of each, and writes a pattern that plays them in the original rhythm.",
    guide: "sample-editor-the-tabs",
  },
  // ── FX tab ────────────────────────────────────────────────────────────────
  "editor.fx.add": {
    title: "Add effect",
    text: "Choose an effect type from the list to add it to the preview chain below.",
    guide: "sample-editor-the-tabs",
  },
  "editor.fx.render": {
    title: "Render into the sample",
    text: "Processes the audio through the effect chain and writes the result into the sample. The effects are then removed.",
    guide: "sample-editor-the-tabs",
  },
  "editor.fx.preview": {
    title: "Preview",
    text: "Plays the sample with the effects applied so you can hear the result before rendering.",
    guide: "sample-editor-the-tabs",
  },
  // ── Analyze tab ───────────────────────────────────────────────────────────
  "editor.analyze.storeTempo": {
    title: "Store tempo",
    text: "Saves the detected BPM with the sample in the library, so Stretch to BPM can use it later.",
    guide: "sample-editor-the-tabs",
  },
};

export default hints;
