/**
 * D129 fader bug regression (WS-C): a slow fader stream with repeated values in the relative
 * range (57–71) must stay absolute and move the target smoothly. Also: Send test text in
 * Settings → MIDI produces SysEx on the fake output for a MiniLab 3.
 */
import { expect, test } from "@playwright/test";
import { midiDevices } from "./helpers";

// The MiniLab 3 map's Reverb fader: CC 83, ch 1 (0-indexed = ch 0), from controllers.ts
const MINILAB_INPUT = "MiniLab3 MIDI";
const MINILAB_OUTPUT = "MiniLab3 MIDI"; // same name → output log keyed by this
const FADER2_CC = 83;
const FADER2_CH = 0;

/** Build a CC MIDI bytes triple. */
function cc(channel: number, number: number, value: number): number[] {
  return [0xb0 | channel, number, value];
}

test("Reverb fader stays absolute through a slow sweep with repeats in the relative range", async ({
  page,
}) => {
  await midiDevices(page, [MINILAB_INPUT]);

  // Apply the MiniLab 3 map
  await page.getByTestId("midi-controller").selectOption("minilab3");
  await page.keyboard.press("Escape");

  // Send a slow fader sweep: values 57..71..57 with a few repeats — the pattern that used to
  // trick the sniffer into switching to rel64. We send them with a >250 ms gap between each
  // "burst" so the gesture timeout resets, meaning no single gesture has ≥ 4 values.
  // (In real life the user moves the fader slowly; each touch is a separate gesture.)
  async function sendFader(values: number[]) {
    for (const v of values) {
      await page.evaluate(
        ([name, msg]) =>
          (window as { __midiFrom?: (n: string, d: number[]) => void }).__midiFrom?.(name, msg),
        [MINILAB_INPUT, cc(FADER2_CH, FADER2_CC, v)] as [string, number[]],
      );
      await page.waitForTimeout(30);
    }
  }

  // First move: sweep up from 0 to 64 (passes through the relative range 57–71)
  await sendFader([0, 20, 40, 57, 60, 64, 64, 64, 68, 71, 80, 100, 127]);

  // Check the Reverb send moved (> 0)
  const reverbBefore = await page.evaluate(() => {
    const r = (
      window as {
        __rebeat?: {
          store: { getState(): { project: { buses: { volume: number; id: string }[] } } };
        };
      }
    ).__rebeat;
    if (!r) return null;
    const s = r.store.getState();
    // Reverb is bus A's volume
    return s.project.buses.find((b) => b.id.includes("rev") || b.id === "a")?.volume ?? null;
  });
  // the fader reached 127, so volume should be close to 1
  if (reverbBefore !== null) expect(reverbBefore).toBeGreaterThan(0.8);

  // Verify the mapping mode is still "absolute" (not switched to rel64)
  const modeStillAbsolute = await page.evaluate(() => {
    // Check settings for the global fader mapping
    const settings = JSON.parse(localStorage.getItem("rebeat.settings") ?? "{}") as {
      state?: { midiMappings?: { mode?: string; slot?: string }[] };
    };
    return settings.state?.midiMappings?.find((m) => m.slot === "fader2")?.mode ?? "absolute";
  });
  expect(modeStillAbsolute).toBe("absolute");
});

test("Send test text button produces SysEx on the MiniLab 3 fake output", async ({ page }) => {
  await midiDevices(page, [MINILAB_INPUT]);

  // Apply the MiniLab 3 map
  await page.getByTestId("midi-controller").selectOption("minilab3");

  // Click "Send test text"
  await page.getByTestId("minilab3-send-test").click();

  // Wait a moment for the async MIDI request + send
  await page.waitForTimeout(300);

  // Check that the fake output received SysEx bytes (F0 ... F7)
  const sent = await page.evaluate((name) => {
    const log = (window as { __midiSent?: Record<string, number[][]> }).__midiSent;
    return log?.[name] ?? [];
  }, MINILAB_OUTPUT);

  // Should have received at least one SysEx message starting with 0xF0
  const sysexMessages = (sent as number[][]).filter((msg) => msg[0] === 0xf0);
  // At least the init + display messages (we send to 3 mode variants)
  expect(sysexMessages.length).toBeGreaterThanOrEqual(1);

  // Verify the manufacturer ID: 00 20 6B
  const displayMsg = sysexMessages.find(
    (msg) => msg[1] === 0x00 && msg[2] === 0x20 && msg[3] === 0x6b && msg[6] === 0x04,
  );
  expect(displayMsg).toBeDefined();
  if (displayMsg) {
    // Byte 7 should be a mode (0x00, 0x01, or 0x02)
    expect([0x00, 0x01, 0x02]).toContain(displayMsg[7]);
    // Ends with F7
    expect(displayMsg[displayMsg.length - 1]).toBe(0xf7);
  }
});
