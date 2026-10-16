/**
 * The tracker's commands (D274, D275): every key of the tracker that isn't a note or a digit, as
 * a command in the palette (category Tracker) that can be rebound. They're scoped: their keys
 * only apply while the tracker has focus, and win over the global ones there.
 */
import * as engine from "../engine/engine";
import * as clock from "../engine/transport";
import { ROWS_SETTINGS, rowPlace } from "../model/tracker";
import { MAX_STEPS } from "../model/types";
import { useStore } from "../state/store";
import {
  copySelection,
  cursorIn,
  deleteCell,
  deleteField,
  fxColumns,
  interpolateColumn,
  moveField,
  moveRows,
  moveTrack,
  noteColumns,
  paste,
  removeLockColumn,
  scaleVolumes,
  selectAll,
  setRow,
  setTrackerSettings,
  shiftRow,
  toggleMute,
  trackerContext,
  trackerSettings,
  transpose,
  useTracker,
} from "../state/tracker";
import { runCommand, type Command } from "./commands";

const scope = "tracker";
const category = "Tracker";

/** Edit mode on or off (D273). */
export function toggleEdit() {
  const edit = !useTracker.getState().edit;
  useTracker.setState({ edit, message: null });
}

export function setOctave(d: number) {
  setTrackerSettings({ octave: Math.max(0, Math.min(8, trackerSettings().octave + d)) });
}

/** Play the cursor's row once: every track's step on it. */
export function playRow() {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  const bpm = clock.tempoNow();
  for (const col of ctx.cols) {
    const t = col.track;
    if (t.mode === "clip" || t.mute) continue;
    const place = rowPlace(col.layout.grid, c.row);
    if (place?.step === undefined) continue;
    const step = ctx.pattern.lanes[t.id]?.steps[place.step];
    if (!step?.on) continue;
    const stepDur = (60 / bpm) * (col.layout.grid.k / ctx.perQuarter);
    engine.trigger(t, step.accent ? 1 : step.velocity, {
      stepDur,
      ratchet: step.ratchet,
      notes: t.mode === "notes" ? step.notes : undefined,
      pitch: step.pitch,
      gate: step.gate,
      locks: step.locks,
    });
  }
}

/** Play from the cursor's row (the start marker there, D190). */
export function playFromCursor() {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c) return;
  if (useStore.getState().playing) clock.stop();
  useStore.getState().setUi({ startAt: { slotId: ctx.slot.id, at: c.row / ctx.perQuarter } });
  void clock.play();
}

function setLength(fn: (n: number) => number) {
  const ctx = trackerContext();
  const next = Math.max(1, Math.min(MAX_STEPS, Math.round(fn(ctx.pattern.stepCount))));
  useStore.getState().commit((p) => {
    p.patterns[ctx.pattern.id].stepCount = next;
  }, "trk-length");
}

export function cycleRows() {
  const i = ROWS_SETTINGS.indexOf(trackerSettings().rows);
  setTrackerSettings({ rows: ROWS_SETTINGS[(i + 1) % ROWS_SETTINGS.length] });
}

const SCALES = [1, 1.5, 2, 2.5, 3];
export function zoom(d: number) {
  const i = SCALES.indexOf(trackerSettings().scale);
  const j = Math.max(0, Math.min(SCALES.length - 1, (i < 0 ? 1 : i) + d));
  setTrackerSettings({ scale: SCALES[j] });
}

/** Jump to a part of the pattern (F9–F12: its start, ¼, ½, ¾). */
const jump = (part: number) => () => setRow(Math.floor(trackerContext().rows * part));

/** A lock column for a knob: the knob picker, then the column (Alt+L). */
async function pickLock() {
  const ctx = trackerContext();
  const c = cursorIn(ctx);
  if (!c || c.col.track.mode === "clip") return;
  const { openLockPicker } = await import("../panels/tracker/lockPicker");
  openLockPicker(c.col.track.id);
}

export function trackerCommands(): Command[] {
  const cmd = (
    id: string,
    title: string,
    keys: string[],
    run: () => void,
    hidden = false,
  ): Command => ({ id: `tracker.${id}`, title, category, keys, run, scope, hidden });
  return [
    cmd("edit", "Edit mode on/off", ["Escape"], toggleEdit),
    cmd("follow", "Follow the playhead on/off", ["ScrollLock", "Alt+F"], () =>
      useStore.getState().setUi({ follow: !useStore.getState().follow }),
    ),
    cmd("octaveDown", "Octave down", ["Alt+[", "Num/"], () => setOctave(-1)),
    cmd("octaveUp", "Octave up", ["Alt+]", "Num*"], () => setOctave(1)),
    ...Array.from({ length: 10 }, (_, i) =>
      cmd(
        `add${i}`,
        `Add: ${i} rows after a note`,
        [`Alt+${i}`],
        () => setTrackerSettings({ add: i }),
        i > 0 && i !== 1,
      ),
    ),
    // moving
    cmd("up", "Row up", ["Up"], () => moveRows(-1), true),
    cmd("down", "Row down", ["Down"], () => moveRows(1), true),
    cmd("left", "Field left", ["Left"], () => moveField(-1), true),
    cmd("right", "Field right", ["Right"], () => moveField(1), true),
    cmd("nextTrack", "Next track", ["Tab", "Alt+Right"], () => moveTrack(1)),
    cmd("prevTrack", "Previous track", ["Shift+Tab", "Alt+Left"], () => moveTrack(-1)),
    cmd("pageUp", "16 rows up", ["PgUp"], () => moveRows(-16, false, false)),
    cmd("pageDown", "16 rows down", ["PgDn"], () => moveRows(16, false, false)),
    cmd("home", "First row", ["Home"], () => setRow(0)),
    cmd("end", "Last row", ["End"], () => setRow(trackerContext().rows - 1)),
    cmd("jump0", "Jump to the pattern's start", ["F9"], jump(0)),
    cmd("jump1", "Jump to ¼ of the pattern", ["F10"], jump(0.25)),
    cmd("jump2", "Jump to ½ of the pattern", ["F11"], jump(0.5)),
    cmd("jump3", "Jump to ¾ of the pattern", ["F12"], jump(0.75)),
    cmd("prevSection", "Previous section", ["Mod+Left"], () => runCommand("section.previous")),
    cmd("nextSection", "Next section", ["Mod+Right"], () => runCommand("section.next")),
    // selecting
    cmd("selUp", "Select up", ["Shift+Up"], () => moveRows(-1, true, false), true),
    cmd("selDown", "Select down", ["Shift+Down"], () => moveRows(1, true, false), true),
    cmd("selLeft", "Select a track left", ["Shift+Left"], () => moveTrack(-1, true), true),
    cmd("selRight", "Select a track right", ["Shift+Right"], () => moveTrack(1, true), true),
    cmd("selPageUp", "Select 16 rows up", ["Shift+PgUp"], () => moveRows(-16, true, false), true),
    cmd(
      "selPageDown",
      "Select 16 rows down",
      ["Shift+PgDn"],
      () => moveRows(16, true, false),
      true,
    ),
    cmd("selHome", "Select to the first row", ["Shift+Home"], () => setRow(0, true), true),
    cmd(
      "selEnd",
      "Select to the last row",
      ["Shift+End"],
      () => setRow(trackerContext().rows - 1, true),
      true,
    ),
    cmd("selectAll", "Select the track, then the pattern", ["Mod+A"], selectAll),
    cmd("copy", "Copy", ["Mod+C"], () => copySelection()),
    cmd("cut", "Cut", ["Mod+X"], () => copySelection(true)),
    cmd("paste", "Paste", ["Mod+V"], () => paste()),
    cmd("mixPaste", "Paste into empty places only", ["Mod+Shift+V"], () => paste(true)),
    // editing
    cmd("delete", "Clear the field", ["Delete"], deleteField),
    cmd("deleteCell", "Clear the cell (or the selection)", ["Shift+Delete"], deleteCell),
    cmd("deleteRow", "Delete a row in the track", ["Backspace"], () => shiftRow(-1)),
    cmd("insertRow", "Insert a row in the track", ["Insert", "Shift+Backspace"], () => shiftRow(1)),
    cmd("deleteRowAll", "Delete a row in every track", ["Mod+Backspace"], () => shiftRow(-1, true)),
    cmd("insertRowAll", "Insert a row in every track", ["Mod+Insert"], () => shiftRow(1, true)),
    cmd("transposeUp", "Transpose up a semitone", ["Mod+Up"], () => transpose(1)),
    cmd("transposeDown", "Transpose down a semitone", ["Mod+Down"], () => transpose(-1)),
    cmd("octUp", "Transpose up an octave", ["Mod+Shift+Up"], () => transpose(12)),
    cmd("octDown", "Transpose down an octave", ["Mod+Shift+Down"], () => transpose(-12)),
    cmd("interpolate", "Interpolate the column in the selection", ["Mod+I"], interpolateColumn),
    cmd("softer", "Volumes ×0.9", ["Mod+J"], () => scaleVolumes(0.9)),
    cmd("louder", "Volumes ×1.1", ["Mod+Shift+J"], () => scaleVolumes(1.1)),
    // columns and tracks
    cmd("noteColAdd", "Add a note column", ["Alt+Shift+Right"], () => noteColumns(1)),
    cmd("noteColRemove", "Remove a note column", ["Alt+Shift+Left"], () => noteColumns(-1)),
    cmd("fxColAdd", "Add an effect column", ["Alt+E"], () => fxColumns(1)),
    cmd("fxColRemove", "Remove an effect column", ["Alt+Shift+E"], () => fxColumns(-1)),
    cmd("lockAdd", "Add a lock column", ["Alt+L"], () => void pickLock()),
    cmd("lockRemove", "Remove the lock column", ["Alt+Shift+L"], removeLockColumn),
    cmd("mute", "Mute the track", ["Alt+M"], () => toggleMute()),
    cmd("solo", "Solo the track", ["Alt+S"], () => toggleMute(true)),
    // playing
    cmd("playRow", "Play the row", ["Enter"], playRow),
    cmd("playFrom", "Play from the row", ["Shift+Enter"], playFromCursor),
    // the view and the pattern
    cmd("zoomIn", "Bigger text", ["Alt+="], () => zoom(1)),
    cmd("zoomOut", "Smaller text", ["Alt+-"], () => zoom(-1)),
    cmd("compact", "Top panel on/off", ["Alt+P"], () =>
      setTrackerSettings({ compact: !trackerSettings().compact }),
    ),
    cmd("rows", "Rows: Auto, ×1, ×2, ×3, ×4", ["Alt+R"], cycleRows),
    cmd("longer", "Pattern a step longer", ["Mod+Alt+Up"], () => setLength((n) => n + 1)),
    cmd("shorter", "Pattern a step shorter", ["Mod+Alt+Down"], () => setLength((n) => n - 1)),
    cmd("double", "Pattern twice as long", ["Mod+Alt+Shift+Up"], () => setLength((n) => n * 2)),
    cmd("halve", "Pattern half as long", ["Mod+Alt+Shift+Down"], () => setLength((n) => n / 2)),
  ];
}
