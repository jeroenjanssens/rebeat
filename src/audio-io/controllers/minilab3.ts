/**
 * Arturia MiniLab 3 OLED display output (WS-C).
 *
 * SysEx format — from MaksPV/minilab3-mixxx-config (community research, MIDI dump 2026-09-21;
 * UNCONFIRMED on real hardware until tested with Send test text in Settings → MIDI):
 *
 *   Init:    F0 00 20 6B 7F 42  02 02 40 6A 21  F7
 *   Display: F0 00 20 6B 7F 42  04 [mode] 60  01 [line1 ascii...] 00  02 [line2 ascii...] 00  F7
 *
 * where [mode] is one of: 0x02 = DAW mode, 0x00 = User mode, 0x01 = ARTURIA mode.
 * Sending to all three modes ensures the text appears regardless of which mode is active.
 * Row IDs: the community's notes have 0x01 as the top line, but on Jeroen's MiniLab 3 (ARTURIA
 * mode, 2026-10-12) row 0x02 shows on top: Rebeat's line 1 goes in 0x02. The device centers
 * each line itself, so the Mixxx script's 3 spaces before line 1 are gone (they moved it right).
 *
 * Pad lights (D144), same source, "DAW mode" there; sent for every mode as the display is:
 *   F0 00 20 6B 7F 42  02 [mode] 16 [pad id] [r] [g] [b]  F7
 * pad ids 0x04–0x0B are pads 1–8 (bank A), r g b 0..127. While Shift is held nothing is sent,
 * so the MiniLab's own colors for the pads' second functions show.
 * Non-printable characters (< 0x20 or > 0x7E) are replaced with 0x20 (space).
 *
 * The display accepts messages on the regular MIDI port (not the MCU port).
 * An init SysEx sequence prepares the device for display messages.
 *
 * Sources:
 *   https://github.com/MaksPV/minilab3-mixxx-config  (MiniLab3-scripts.js, MINILAB3techno.midi.xml)
 *   Community MIDI dump 2026-09-21, cited in that repo.
 *   UNCONFIRMED — verify with "Send test text" in Settings → MIDI.
 */

import { midiOutputs, startMidi } from "../midi";
import { onDisplayText, type DisplayText } from "../../midi/display";
import { onControllerEvent } from "../../midi/controllerEvents";
import { deviceRgb, padColors } from "../../midi/padColors";
import { useSettings } from "../../state/settings";
import { useStore } from "../../state/store";
import { useKeys } from "../../state/keys";
import { ROLE_COLORS } from "../../model/suggest";

const ARTURIA_MANUFACTURER = [0x00, 0x20, 0x6b];
/** Send to all mode variants for max compatibility. 0x02=DAW, 0x00=User, 0x01=ARTURIA. */
const DISPLAY_MODES = [0x02, 0x00, 0x01];
/** The row on top, and the one below it (see above). */
const TOP_ROW = 0x02;
const BOTTOM_ROW = 0x01;
const INIT_MSG = new Uint8Array([
  0xf0,
  ...ARTURIA_MANUFACTURER,
  0x7f,
  0x42,
  0x02,
  0x02,
  0x40,
  0x6a,
  0x21,
  0xf7,
]);
const DEBOUNCE_MS = 60;

/** Match the main MIDI output port (not the MCU port). */
const OUTPUT_MATCH = /minilab ?3(?!.*(mcu|daw))/i;

/** What the display can't show, in ASCII: B♭ as Bb, F♯ as F#. */
const ASCII: Record<string, string> = { "♭": "b", "♯": "#", "·": "-", "−": "-", "°": "o", ø: "o" };

function asciiBytes(raw: string): number[] {
  const text = [...raw].map((c) => ASCII[c] ?? c).join("");
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) code = 0x20;
    bytes.push(code);
  }
  return bytes;
}

function findOutput(): MIDIOutput | null {
  return midiOutputs().find((o) => OUTPUT_MATCH.test(o.name ?? "")) ?? null;
}

let initSent = false;
let lastText: DisplayText | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function sendInit(out: MIDIOutput) {
  out.send(INIT_MSG);
  initSent = true;
}

function sendLines(out: MIDIOutput, line1: string, line2: string, handshake: boolean) {
  // the handshake is what Arturia's DAW scripts send to connect, and it may put the MiniLab in
  // DAW mode (where its knobs send other messages): only when asked for (unconfirmed)
  if (handshake && !initSent) sendInit(out);
  const l1 = asciiBytes(line1);
  const l2 = asciiBytes(line2);
  for (const mode of DISPLAY_MODES) {
    const msg = new Uint8Array([
      0xf0,
      ...ARTURIA_MANUFACTURER,
      0x7f,
      0x42,
      0x04,
      mode,
      0x60,
      TOP_ROW,
      ...l1,
      0x00,
      BOTTOM_ROW,
      ...l2,
      0x00,
      0xf7,
    ]);
    out.send(msg);
  }
}

function onText(text: DisplayText) {
  // De-duplicate: skip if nothing changed
  if (lastText && text.line1 === lastText.line1 && text.line2 === lastText.line2) return;
  lastText = text;

  // Debounce: coalesce rapid updates into one SysEx burst (~60 ms)
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const out = findOutput();
    if (!out) return;
    sendLines(out, text.line1, text.line2, useSettings.getState().midiMiniLabHandshake);
  }, DEBOUNCE_MS);
}

/**
 * Send two lines immediately, bypassing the debounce. Used by the "Send test text" button
 * in Settings → MIDI. Returns false when no output port is found.
 */
export function sendTestText(line1: string, line2: string, handshake = false): boolean {
  const out = findOutput();
  if (!out) return false;
  // send the handshake again, and forget the last text, so the test always goes through
  initSent = false;
  lastText = null;
  sendLines(out, line1, line2, handshake);
  return true;
}

let registered = false;
let unregister: (() => void) | null = null;

/**
 * Start the MiniLab 3 display driver: request SysEx access and register a display writer.
 * Safe to call multiple times (idempotent).
 */
export async function startMiniLab3Display(): Promise<boolean> {
  if (registered) return true;
  const ok = await startMidi(true); // SysEx is required for sending
  if (!ok) return false;
  registered = true;
  unregister = onDisplayText(onText);
  return true;
}

/** Stop the display driver. Called when "Show names on the MiniLab display" is turned off. */
export function stopMiniLab3Display() {
  if (!registered) return;
  registered = false;
  unregister?.();
  unregister = null;
  initSent = false;
  lastText = null;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// ---------- pad lights (D144) ----------

const PAD_IDS = [0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b];

let padsOn = false;
let padsOff: (() => void) | null = null;
let shiftDown = false;
let lastPads = "";
let padTimer: ReturnType<typeof setTimeout> | null = null;

function sendPads(force = false) {
  if (shiftDown) return; // the MiniLab's own colors for Shift's functions
  const { project } = useStore.getState();
  const suggested = useKeys.getState().suggestions.map((s) => ROLE_COLORS[s.role]);
  const colors = padColors(project.tracks, useSettings.getState().padMode, suggested).map(
    deviceRgb,
  );
  const key = JSON.stringify(colors);
  if (!force && key === lastPads) return;
  const out = findOutput();
  if (!out) return;
  lastPads = key;
  for (const mode of DISPLAY_MODES)
    colors.forEach(([r, g, b], i) =>
      out.send(
        new Uint8Array([
          0xf0,
          ...ARTURIA_MANUFACTURER,
          0x7f,
          0x42,
          0x02,
          mode,
          0x16,
          PAD_IDS[i],
          r,
          g,
          b,
          0xf7,
        ]),
      ),
    );
}

function sendPadsSoon(force = false) {
  if (padTimer !== null) clearTimeout(padTimer);
  padTimer = setTimeout(() => {
    padTimer = null;
    sendPads(force);
  }, DEBOUNCE_MS);
}

/**
 * Light the MiniLab 3's pads in the colors of what they play (D144): the tracks' colors in Drum
 * mode, blue and purple in Chord and Key mode. Repaints when tracks or the pad mode change, and
 * when Shift is let go. Safe to call more than once.
 */
export async function startMiniLab3Pads(): Promise<boolean> {
  if (padsOn) return true;
  const ok = await startMidi(true);
  if (!ok) return false;
  padsOn = true;
  const offStore = useStore.subscribe((s, prev) => {
    if (s.project.tracks !== prev.project.tracks) sendPadsSoon();
  });
  const offSettings = useSettings.subscribe((s, prev) => {
    if (s.padMode !== prev.padMode) sendPadsSoon();
  });
  // Next mode (D159): the pads change with the suggestions
  const offKeys = useKeys.subscribe((k, prev) => {
    if (k.suggestions !== prev.suggestions && useSettings.getState().padMode === "next")
      sendPadsSoon();
  });
  const offShift = onControllerEvent((e) => {
    if (e.control.slot !== "shift") return;
    shiftDown = !!e.down;
    // the device lit its own colors under Shift: put ours back
    if (!shiftDown) sendPadsSoon(true);
  });
  padsOff = () => (offStore(), offSettings(), offShift(), offKeys());
  sendPadsSoon(true);
  return true;
}

export function stopMiniLab3Pads() {
  if (!padsOn) return;
  padsOn = false;
  padsOff?.();
  padsOff = null;
  lastPads = "";
  if (padTimer !== null) {
    clearTimeout(padTimer);
    padTimer = null;
  }
}
