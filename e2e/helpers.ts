import type { Page } from "@playwright/test";

/** Open the app (each test has fresh browser storage), start audio, wait for the project. */
export async function openApp(page: Page) {
  await page.addInitScript(() => {
    (window as { __REBEAT_TEST_MIC__?: boolean }).__REBEAT_TEST_MIC__ = true;
    // skip the first-run welcome (it has its own test)
    if (!localStorage.getItem("rebeat.settings"))
      localStorage.setItem(
        "rebeat.settings",
        JSON.stringify({ state: { onboarded: true }, version: 1 }),
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
