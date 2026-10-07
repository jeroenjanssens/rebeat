import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("a Launchpad mirrors the grid and toggles steps", async ({ page }) => {
  await page.addInitScript(() => {
    const sent: number[][] = [];
    const input = {
      id: "lp-in",
      name: "Launchpad Mini MK3 LPMiniMK3 MIDI",
      onmidimessage: null as null | ((e: { data: Uint8Array }) => void),
    };
    const output = {
      id: "lp-out",
      name: "Launchpad Mini MK3 LPMiniMK3 MIDI",
      send: (d: number[]) => sent.push([...d]),
    };
    const access = {
      inputs: new Map([["lp-in", input]]),
      outputs: new Map([["lp-out", output]]),
      onstatechange: null,
    };
    Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => access });
    Object.assign(window, {
      __sent: sent,
      __pad: (d: number[]) => input.onmidimessage?.({ data: new Uint8Array(d) }),
    });
  });
  await openApp(page);
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  await page.getByRole("button", { name: "Enable MIDI" }).click();
  await page.getByRole("button", { name: "Connect Launchpad / Push" }).click();
  await expect(page.getByText("Launchpad Mini MK3 ✓")).toBeVisible();
  const sent = await page.evaluate(() => (window as never as { __sent: number[][] }).__sent);
  // programmer mode, then a full RGB frame
  expect(sent[0]).toEqual([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0d, 0x0e, 0x01, 0xf7]);
  await expect
    .poll(() => page.evaluate(() => (window as never as { __sent: number[][] }).__sent.length))
    .toBeGreaterThan(1);

  const stepOn = () =>
    page.evaluate(() => {
      const s = (
        window as never as {
          __rebeat: {
            store: {
              getState(): {
                project: {
                  tracks: { id: string }[];
                  slots: { id: string; patternId: string }[];
                  patterns: Record<string, { lanes: Record<string, { steps: { on: boolean }[] }> }>;
                };
                editSlotId: string;
              };
            };
          };
        }
      ).__rebeat.store.getState();
      const pat = s.project.patterns[s.project.slots.find((x) => x.id === s.editSlotId)!.patternId];
      return pat.lanes[s.project.tracks[0].id].steps[1].on;
    });
  const before = await stepOn();
  // top-left pad is row 1 (track 1), so note 81 + 1 column = step 2 → note 82
  await page.evaluate(() =>
    (window as never as { __pad: (d: number[]) => void }).__pad([0x90, 82, 100]),
  );
  await expect.poll(stepOn).toBe(!before);
});
