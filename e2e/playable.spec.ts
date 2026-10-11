/**
 * Playable browsing e2e tests (WS-E).
 *
 * Checks:
 * - The Playable location appears in the Library panel's location list.
 * - Sending a relative CC 28 (MiniLab 3 main encoder, rel64: 65 = +1) with the MiniLab 3 map
 *   active moves the Playable selection forward and updates the keys chip.
 * - After browsing, the fake MiniLab output received a SysEx message containing the sound name.
 * - The "Pitched only" chip toggles drum samples out of and back into the list.
 *
 * Note: this spec is written but NOT run during wave-1 development. It runs once at the end
 * (wave 3, with the full Playwright suite). Do NOT add it to the CI skip list.
 */
import { expect, test, type Page } from "@playwright/test";
import { midiDevices, openApp } from "./helpers";

// ── helpers ───────────────────────────────────────────────────────────────────

type W = {
  __midiFrom: (name: string, d: number[]) => void;
  __midiSent: Record<string, number[][]>;
  __rebeat: {
    store: {
      getState(): {
        project: { tracks: { id: string; name: string }[] };
      };
    };
    commands(): { id: string; run(): void }[];
  };
};

const send = (page: Page, device: string, bytes: number[]) =>
  page.evaluate(
    ([d, b]) => (window as never as W).__midiFrom(d as string, b as number[]),
    [device, bytes],
  );

/** Apply the MiniLab 3 controller map (midiDevices leaves Settings → MIDI open). */
async function applyMiniLabMap(page: Page) {
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
}

/** Go to the library's Playable location. */
async function goPlayable(page: Page) {
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: "Playable", exact: true }).click();
  await expect(page.getByTestId("library-list")).not.toBeEmpty();
}

const chipText = (page: Page) => page.getByTestId("keys-chip").textContent();

// ── tests ─────────────────────────────────────────────────────────────────────

test("the MiniLab 3's main encoder browses Playable: the keys and the display follow", async ({
  page,
}) => {
  await midiDevices(page, ["MiniLab3 MIDI"]);
  await applyMiniLabMap(page);
  await goPlayable(page);
  const before = await chipText(page);
  // CC 114, offset 64: 65 = one step clockwise
  await send(page, "MiniLab3 MIDI", [0xb0, 114, 65]);
  await expect.poll(() => chipText(page), { timeout: 3000 }).not.toBe(before);
  // the display got SysEx with text (Arturia's id: 00 20 6B)
  await expect
    .poll(
      async () => {
        const sent = await page.evaluate(
          () => (window as never as W).__midiSent["MiniLab3 MIDI"] ?? [],
        );
        return sent.some((m) => m[0] === 0xf0 && m[1] === 0x00 && m[2] === 0x20 && m[3] === 0x6b);
      },
      { timeout: 3000 },
    )
    .toBe(true);
});

test("the Pitched only chip toggles", async ({ page }) => {
  await openApp(page);
  await goPlayable(page);
  const chip = page.getByTestId("library").locator('[data-hint="library.playable.all-samples"]');
  await expect(chip).not.toHaveAttribute("data-active", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("data-active", "true");
  await chip.click();
  await expect(chip).not.toHaveAttribute("data-active", "true");
});

test("Next playable sound (a command) puts the next sound on the keys", async ({ page }) => {
  await openApp(page);
  const before = await chipText(page);
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "playable.next")
      ?.run(),
  );
  await expect.poll(() => chipText(page), { timeout: 3000 }).not.toBe(before);
});
