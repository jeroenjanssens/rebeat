import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

/** A fake Web MIDI device: `window.__midiSend([status, data1, data2])` delivers a message. */
async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    const input = {
      id: "fake-1",
      name: "Fake Pads",
      onmidimessage: null as null | ((e: { data: Uint8Array }) => void),
    };
    const access = {
      inputs: new Map([["fake-1", input]]),
      outputs: new Map(),
      onstatechange: null,
    };
    Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => access });
    (window as never as { __midiSend: (d: number[]) => void }).__midiSend = (d) =>
      input.onmidimessage?.({ data: new Uint8Array(d) });
  });
}

const send = (page: Page, d: number[]) =>
  page.evaluate((d) => (window as never as { __midiSend: (d: number[]) => void }).__midiSend(d), d);
type S = {
  project: {
    tracks: { name: string; mute: boolean; params: Record<string, number> }[];
    midiMappings: { number: number; target: string }[];
  };
  playing: boolean;
};
const state = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(
        JSON.stringify(
          (
            window as never as { __rebeat: { store: { getState(): unknown } } }
          ).__rebeat.store.getState(),
        ),
      ) as S,
  );

test("MIDI learn maps a controller to a knob", async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  await page.getByRole("button", { name: "Enable MIDI" }).click();
  await expect(page.getByText("Fake Pads")).toBeVisible();
  await page.keyboard.press("Escape");
  // right-click the Cutoff encoder in the inspector → MIDI learn
  await page
    .getByTestId("inspector")
    .getByText("Cutoff", { exact: true })
    .first()
    .locator("..")
    .locator("svg")
    .click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "MIDI learn" }).click();
  await send(page, [0xb0, 21, 64]);
  await expect.poll(async () => (await state(page)).project.midiMappings.length).toBe(1);
  await send(page, [0xb0, 21, 0]);
  await expect
    .poll(async () => (await state(page)).project.tracks[0].params["sound.cutoff"])
    .toBe(0);
});

test("MIDI notes play drum pads", async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await page.evaluate(async () => {
    const path = "/src/audio-io/midi.ts";
    await (await import(/* @vite-ignore */ path)).startMidi();
  });
  const peak = await page.evaluate(async () => {
    const w = window as never as {
      __midiSend: (d: number[]) => void;
      __rebeat: { engine: { masterLevel(): number[] } };
    };
    w.__midiSend([0x90, 36, 120]);
    let p = 0;
    const end = performance.now() + 400;
    while (performance.now() < end) {
      p = Math.max(p, ...w.__rebeat.engine.masterLevel());
      await new Promise((r) => setTimeout(r, 10));
    }
    return p;
  });
  expect(peak).toBeGreaterThan(0.05);
});

test("tape stop halts the transport and mute groups toggle their tracks", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("ControlOrMeta+Alt+2");
  const perf = page.getByTestId("performance");
  await perf.getByRole("button", { name: /Group 1/ }).click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Kick" }).click();
  await perf.getByRole("button", { name: /Group 1/ }).click();
  await expect.poll(async () => (await state(page)).project.tracks[0].mute).toBe(true);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await state(page)).playing).toBe(true);
  await perf.getByRole("button", { name: "Tape stop" }).click();
  // the slowdown takes 1.2 s; leave room for a busy machine
  await expect.poll(async () => (await state(page)).playing, { timeout: 15000 }).toBe(false);
});
