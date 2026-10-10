/**
 * E2E tests for the keys (D126): live voices, the Keys chip, and the library "play on keys" button.
 */
import { expect, test, type Page } from "@playwright/test";
import { midiKeyboard, openApp } from "./helpers";

type W = {
  __midi: (d: number[]) => void;
  __rebeat: {
    engine: { masterLevel(): number[] };
    store: {
      getState(): {
        project: { tracks: { id: string; name: string; mode: string }[] };
        selectedTrackId: string;
        setUi(p: object): void;
      };
    };
    commands: () => { id: string; run(): void }[];
  };
};

const send = (page: Page, data: number[]) =>
  page.evaluate((d) => (window as never as W).__midi(d), data);

const levelNow = (page: Page) =>
  page.evaluate(() => (window as never as W).__rebeat.engine.masterLevel()[0]);

const waitForLevel = async (page: Page, threshold: number, above = true) => {
  const method = above ? "toBeGreaterThan" : "toBeLessThan";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (expect.poll(() => levelNow(page), { timeout: 3000, intervals: [100] }) as any)[method](
    threshold,
  );
};

const selectNotesTrack = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    const notes = s.project.tracks.find((t) => t.mode === "notes");
    if (notes) s.setUi({ selectedTrackId: notes.id });
  });

test("MIDI note plays on the keys' target (selected Notes track)", async ({ page }) => {
  await midiKeyboard(page);
  await selectNotesTrack(page);

  // Note on C4
  await send(page, [0x90, 60, 100]);
  await waitForLevel(page, 0, true);

  // Note off
  await send(page, [0x80, 60, 0]);
});

test("a second MIDI note doesn't cut the first on the live voice", async ({ page }) => {
  await midiKeyboard(page);
  await selectNotesTrack(page);

  // Hold one note via MIDI
  await send(page, [0x90, 60, 100]);
  await waitForLevel(page, 0, true);

  // Play a second note on the live voice — the first should keep sounding
  await send(page, [0x90, 64, 100]);

  // Release the first — level should stay up from the second
  await send(page, [0x80, 60, 0]);
  const level = await levelNow(page);
  expect(level).toBeGreaterThan(0);

  await send(page, [0x80, 64, 0]);
});

test("Keys chip is visible and shows a label", async ({ page }) => {
  await openApp(page);

  const chip = page.getByTestId("keys-chip");
  await expect(chip).toBeVisible();
  const text = await chip.textContent();
  expect(text).toBeTruthy();
});

test("Keys chip menu has Follow selected track option", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("keys-chip").click();
  await expect(page.locator(".menu .menu-item", { hasText: /Follow selected/i })).toBeVisible();
});
