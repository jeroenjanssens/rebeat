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
 * Row IDs: 0x01 = top line, 0x02 = bottom line.
 * Line 1 is left-padded by 3 spaces (matches displayLine1LeftPad = 3 in the Mixxx script).
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
import { useSettings } from "../../state/settings";

const ARTURIA_MANUFACTURER = [0x00, 0x20, 0x6b];
/** Send to all mode variants for max compatibility. 0x02=DAW, 0x00=User, 0x01=ARTURIA. */
const DISPLAY_MODES = [0x02, 0x00, 0x01];
const LINE1_PAD = 3; // left-padding spaces for the top line
const ROW1 = 0x01;
const ROW2 = 0x02;
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

function asciiBytes(text: string): number[] {
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
  const l1 = asciiBytes(" ".repeat(LINE1_PAD) + line1);
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
      ROW1,
      ...l1,
      0x00,
      ROW2,
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
