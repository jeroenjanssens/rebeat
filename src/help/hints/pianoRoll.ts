import type { Hints } from "./types";

const hints: Hints = {
  // ── Toolbar ───────────────────────────────────────────────────────────────
  "roll.tool.draw": {
    title: "Draw tool",
    text: "Click an empty spot on the grid to add a note. Drag right while clicking to set the note's length. This is the default drawing mode.",
    guide: "instruments-the-piano-roll",
  },
  "roll.tool.select": {
    title: "Select tool",
    text: "Click a note to select it; Shift+click to add to the selection. Drag on empty space to select notes in a box.",
    keys: "Shift+drag: add to selection",
    guide: "instruments-the-piano-roll",
  },
  "roll.noteLen": {
    title: "Note length",
    text: "The length of new notes when you click with the draw tool. After drawing, the length is remembered from the last note you drew.",
    guide: "instruments-the-piano-roll",
  },
  "roll.scaleLock": {
    title: "Scale lock",
    text: "When on, notes snap to the current key as you draw or move them. Out-of-key positions are skipped.",
    guide: "instruments-entering-notes",
  },
  "roll.zoomOut": {
    title: "Zoom out",
    text: "Shows more steps on screen, making the grid narrower.",
    guide: "instruments-the-piano-roll",
  },
  "roll.zoomIn": {
    title: "Zoom in",
    text: "Shows fewer steps on screen, making each step wider for more precise editing.",
    guide: "instruments-the-piano-roll",
  },
  "roll.trackPick": {
    title: "Select track",
    text: "Switch the piano roll to edit this instrument track.",
    guide: "instruments-the-piano-roll",
  },
  // ── Piano keys ────────────────────────────────────────────────────────────
  "roll.keys": {
    title: "Piano keys",
    text: "Click a key to hear that pitch. Dimmed keys are outside the current scale. The highlighted row is the root note of the key.",
    guide: "instruments-the-piano-roll",
  },
  // ── Grid / notes ──────────────────────────────────────────────────────────
  "roll.grid": {
    title: "Note grid",
    text: "Click (draw tool) to add a note; drag right while clicking to set its length. Drag a note to move it; drag its right edge to resize it. Alt+click or double-click a note to delete it.",
    keys: "Alt+click: delete · Right-click: menu · Shift+drag: select box",
    guide: "instruments-the-piano-roll",
  },
  "roll.note": {
    title: "Note",
    text: "Drag to move the note in time and pitch; hold Shift to move it an octave. Drag the right edge to resize. Right-click for slide and length options.",
    keys: "Drag: move · Drag right edge: resize · Alt+click / double-click: delete · Right-click: menu",
    guide: "instruments-the-piano-roll",
  },
  // ── Velocity lane ─────────────────────────────────────────────────────────
  "roll.velocity": {
    title: "Velocity",
    text: "Drag over the bars to set the velocity of each note. If notes are selected, only their velocities change; otherwise, any note at that position is affected.",
    keys: "Drag: set velocity",
    guide: "instruments-the-piano-roll",
  },
};

export default hints;
