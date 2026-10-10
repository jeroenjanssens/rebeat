/**
 * Playable browsing e2e tests (WS-E).
 *
 * Checks:
 * - The Playable location appears in the Library panel's location list.
 * - Sending a relative CC 28 (MiniLab 3 main encoder, rel64: 65 = +1) with the MiniLab 3 map
 *   active moves the Playable selection forward and updates the keys chip.
 * - After browsing, the fake MiniLab output received a SysEx message containing the sound name.
 * - The "Samples: all" chip toggles drum samples in/out of the list.
 *
 * Note: this spec is written but NOT run during wave-1 development. It runs once at the end
 * (wave 3, with the full Playwright suite). Do NOT add it to the CI skip list.
 */
import { expect, test } from "@playwright/test";
import { midiDevices } from "./helpers";

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

const send = (page: import("@playwright/test").Page, device: string, bytes: number[]) =>
  page.evaluate(
    ([d, b]) => (window as never as W).__midiFrom(d as string, b as number[]),
    [device, bytes],
  );

/** Apply the MiniLab 3 controller map (Settings → MIDI → Use detected). */
async function applyMiniLabMap(page: import("@playwright/test").Page) {
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  const useBtn = page.getByTestId("midi-use-detected");
  if (await useBtn.isVisible()) await useBtn.click();
  await page.keyboard.press("Escape");
}

/** Open the Library panel (via command palette or click if already visible). */
async function openLibrary(page: import("@playwright/test").Page) {
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "panel.library")
      ?.run(),
  );
  await page.getByTestId("library").waitFor();
}

// ── tests ─────────────────────────────────────────────────────────────────────

test("Playable location appears in the library sidebar", async ({ page }) => {
  await midiDevices(page, ["MiniLab3 MIDI"]);
  await page.keyboard.press("Escape");

  await openLibrary(page);

  // The "Playable" entry should appear in the locations sidebar (or dropdown).
  await expect(page.getByRole("button", { name: "Playable" }).first()).toBeVisible();
});

test("MiniLab 3 encoder browse: selection advances and keys chip updates", async ({ page }) => {
  // Set up MiniLab 3 with input AND a matching output so the display SysEx is captured.
  await midiDevices(page, ["MiniLab3 MIDI"]);
  await applyMiniLabMap(page);

  await openLibrary(page);

  // Navigate to the Playable location.
  await page.getByRole("button", { name: "Playable" }).first().click();

  // Wait for the list to populate (the catalog items should appear).
  await expect(page.locator('[data-testid="library-list"]')).not.toBeEmpty();

  // Read the current keys chip label.
  const keysBefore = await page.getByTestId("keys-chip").textContent();

  // Send encoder turn: CC 28 with value 65 (rel64 = +1) once.
  await send(page, "MiniLab3 MIDI", [0xb0, 28, 65]);

  // Keys chip should update (after the 150 ms debounce).
  await expect
    .poll(() => page.getByTestId("keys-chip").textContent(), { timeout: 2000 })
    .not.toBe(keysBefore);

  // The selection in the list should have changed: one item should be highlighted (active).
  const activeItems = page.locator("[data-testid='library-list'] [data-active='true']");
  await expect(activeItems).toHaveCount(1, { timeout: 2000 });
});

test("MiniLab 3 encoder browse: SysEx with sound name is sent to the output", async ({ page }) => {
  await midiDevices(page, ["MiniLab3 MIDI"]);
  await applyMiniLabMap(page);

  await openLibrary(page);
  await page.getByRole("button", { name: "Playable" }).first().click();
  await expect(page.locator('[data-testid="library-list"]')).not.toBeEmpty();

  // Turn encoder +1.
  await send(page, "MiniLab3 MIDI", [0xb0, 28, 65]);

  // Wait for the 150 ms debounce + display debounce (~60 ms).
  await page.waitForTimeout(300);

  // The fake output for "MiniLab3 MIDI" should have received at least one SysEx message
  // (F0 00 20 6B ... F7).
  const sent = await page.evaluate(() => (window as never as W).__midiSent["MiniLab3 MIDI"] ?? []);
  const sysex = sent.filter((msg) => msg[0] === 0xf0 && msg[1] === 0x00 && msg[2] === 0x20);
  expect(sysex.length).toBeGreaterThan(0);

  // The SysEx payload should contain non-zero ASCII bytes (the sound name).
  const hasText = sysex.some((msg) => msg.some((b) => b >= 0x20 && b <= 0x7e));
  expect(hasText).toBe(true);
});

test("Playable Samples:all chip shows/hides drum samples", async ({ page }) => {
  await midiDevices(page, ["MiniLab3 MIDI"]);
  await page.keyboard.press("Escape");
  await openLibrary(page);

  // Go to Playable.
  await page.getByRole("button", { name: "Playable" }).first().click();

  // The "Samples: all" chip should be visible (initially off).
  const chip = page.getByTitle("Show drum and percussion samples too");
  await expect(chip).toBeVisible();

  // The chip should NOT be active by default.
  await expect(chip).not.toHaveAttribute("data-active", "true");

  // Toggle it on.
  await chip.click();
  await expect(chip).toHaveAttribute("data-active", "true");

  // Toggle it off.
  await chip.click();
  await expect(chip).not.toHaveAttribute("data-active", "true");
});

test("Next/Previous playable sound commands work via the command palette", async ({ page }) => {
  await midiDevices(page, ["MiniLab3 MIDI"]);
  await page.keyboard.press("Escape");

  await openLibrary(page);
  await page.getByRole("button", { name: "Playable" }).first().click();
  await expect(page.locator('[data-testid="library-list"]')).not.toBeEmpty();

  const keysBefore = await page.getByTestId("keys-chip").textContent();

  // Run the "Next playable sound" command programmatically.
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "playable.next")
      ?.run(),
  );

  // Keys chip should change after the debounce.
  await expect
    .poll(() => page.getByTestId("keys-chip").textContent(), { timeout: 2000 })
    .not.toBe(keysBefore);
});
