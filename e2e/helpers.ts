import type { Page } from "@playwright/test";

/** Open the app (each test has fresh browser storage), start audio, wait for the project. */
export async function openApp(page: Page) {
  await page.addInitScript(() => {
    (window as { __REBEAT_TEST_MIC__?: boolean }).__REBEAT_TEST_MIC__ = true;
    // skip the first-run welcome (it has its own test)
    if (!localStorage.getItem("rebeat.settings"))
      localStorage.setItem(
        "rebeat.settings",
        // the keys follow the selected track, as most tests expect (the default is the piano)
        JSON.stringify({
          state: { onboarded: true, keysTarget: { kind: "selected" } },
          version: 1,
        }),
      );
  });
  await page.goto("/");
  await page.getByTestId("audio-overlay").click();
  await page.locator('[data-testid="audio-status"][data-status="running"]').waitFor();
  await waitForProject(page);
}

export async function waitForProject(page: Page) {
  await page.waitForFunction(() => {
    const r = (window as never as { __rebeat?: { store: { getState(): { projectId: string } } } })
      .__rebeat;
    return !!r?.store.getState().projectId;
  });
}

/** A fake MIDI keyboard. */
export async function midiKeyboard(page: Page) {
  await page.addInitScript(() => {
    const input = {
      id: "kb",
      name: "Test Keys",
      onmidimessage: null as null | ((e: { data: Uint8Array }) => void),
    };
    const access = { inputs: new Map([["kb", input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => access });
    Object.assign(window, {
      __midi: (d: number[]) => input.onmidimessage?.({ data: new Uint8Array(d) }),
    });
  });
  await openApp(page);
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  await page.getByRole("button", { name: "Enable MIDI" }).click();
  await page.keyboard.press("Escape");
}

/** Fake MIDI inputs with these names; send bytes with `window.__midiFrom(name, [0xb0, 74, 64])`.
 * Each name also gets a matching fake output that records sent bytes in `window.__midiSent[name]`.
 * Opens the app and enables MIDI. */
export async function midiDevices(page: Page, names: string[]) {
  await page.addInitScript((names: string[]) => {
    const inputs = new Map(
      names.map((name, i) => [
        `in${i}`,
        { id: `in${i}`, name, onmidimessage: null as null | ((e: { data: Uint8Array }) => void) },
      ]),
    );
    // Fake outputs: each records bytes sent to window.__midiSent[name]
    const sentLog: Record<string, number[][]> = {};
    const outputs = new Map(
      names.map((name, i) => [
        `out${i}`,
        {
          id: `out${i}`,
          name,
          send: (data: Uint8Array | number[]) => {
            if (!sentLog[name]) sentLog[name] = [];
            sentLog[name].push(Array.from(data));
          },
        },
      ]),
    );
    Object.assign(window, { __midiSent: sentLog });
    const access = { inputs, outputs, onstatechange: null };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      value: async (_opts?: unknown) => access,
    });
    Object.assign(window, {
      __midiFrom: (name: string, d: number[]) =>
        [...inputs.values()]
          .find((x) => x.name === name)
          ?.onmidimessage?.({ data: new Uint8Array(d) }),
    });
  }, names);
  await openApp(page);
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  await page.getByRole("button", { name: "Enable MIDI" }).click();
}
