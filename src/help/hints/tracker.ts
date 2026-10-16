import type { Hints } from "./types";

const hints: Hints = {
  "tracker.pattern": {
    title: "Tracker",
    text: "The pattern as rows, top to bottom: one row per step, one group of columns per track (notes, volumes, effect commands, locks). The cursor row stays in the middle. Esc turns edit mode on; then the note keys write notes, digits write values.",
    command: "tracker.edit",
    keys: "Click: the cursor there · Shift+click: select · Wheel: rows",
    guide: "tracker",
  },
  "tracker.pos": {
    title: "Position",
    text: "The section you're editing, in hex as in FT2. ▲▼ go to the next or previous section.",
    command: "tracker.nextSection",
    guide: "tracker-the-screen",
  },
  "tracker.patt": {
    title: "Pattern",
    text: "The name of the section's pattern. Clones of the section share it, so an edit here changes them too.",
    guide: "tracker-the-screen",
  },
  "tracker.len": {
    title: "Length",
    text: "How many steps the pattern has, in hex (10 is 16 steps, 40 is 64). ▲▼ change it by a step.",
    command: "tracker.longer",
    guide: "tracker-the-screen",
  },
  "tracker.octave": {
    title: "Octave",
    text: "The octave of the note keys: Z is C in this octave, Q the C above it.",
    command: "tracker.octaveUp",
    guide: "tracker-the-keys",
  },
  "tracker.step": {
    title: "Step",
    text: "The pattern's step size: how long a row is when Rows is ×1.",
    guide: "tracker-rows-and-polyrhythms",
  },
  "tracker.bpm": {
    title: "BPM",
    text: "The tempo, as in the top bar.",
    guide: "tracker-the-screen",
  },
  "tracker.add": {
    title: "Add",
    text: "How many rows the cursor moves down after you type a note or a value. 0 keeps it where it is, for typing chords and values in place.",
    command: "tracker.add1",
    guide: "tracker-the-keys",
  },
  "tracker.rows": {
    title: "Rows",
    text: "How many rows a step gets. Auto picks the fewest where every track's steps land on a row (a 1/16T track next to 1/16 ones needs three). On finer rows a note can start between steps.",
    command: "tracker.rows",
    guide: "tracker-rows-and-polyrhythms",
  },
  "tracker.edit": {
    title: "Edit mode",
    text: "On: the note keys write notes where the cursor is (while playing: where the playhead is) and digits write values. Off: the note keys only play the sound.",
    command: "tracker.edit",
    guide: "tracker-the-keys",
  },
  "tracker.follow": {
    title: "Follow",
    text: "While playing, the pattern scrolls under the cursor row and the cursor goes with the playhead (and the edited section follows the song).",
    command: "tracker.follow",
    guide: "tracker-the-screen",
  },
  "tracker.scopes": {
    title: "Scopes",
    text: "A scope per track, as in FT2. Click one to mute its track, right-click to solo it.",
    guide: "tracker-the-screen",
  },
  "app.settings.tracker.ft2": {
    title: "FT2 keys",
    text: "While the tracker has focus: Space turns edit mode on and off and F1–F8 set the octave, as in Fast Tracker 2. Shift+Space plays and stops then.",
    guide: "tracker-the-keys",
  },
  "app.settings.tracker.decimal": {
    title: "Volumes",
    text: "The tracker's volume column in hex (01–7F, as trackers write it) or in decimal (1–127, as MIDI velocities are usually written).",
    guide: "tracker-the-columns",
  },
  "app.settings.tracker.volume": {
    title: "New notes' volume",
    text: "The velocity a note gets when you type it with the note keys. Notes from a MIDI keyboard keep their own.",
    guide: "tracker-the-columns",
  },
  "app.settings.tracker.scale": {
    title: "Text size",
    text: "How big the tracker's letters are: CSS pixels per pixel of its font.",
    guide: "tracker-the-screen",
  },
  "app.settings.tracker.compact": {
    title: "Top panel",
    text: "The tracker's top panel (position, length, octave, the lamps, the scopes), or only the pattern and the status line.",
    command: "tracker.compact",
    guide: "tracker-the-screen",
  },
};

export default hints;
