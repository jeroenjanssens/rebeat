import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

test("renders the current page to a WAV file offline", async ({ page }) => {
  // offline rendering takes a while on a busy machine
  test.setTimeout(90_000);
  await page.keyboard.press("ControlOrMeta+E");
  await page.getByRole("button", { name: "Current page" }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-wav").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.wav$/);
  const bytes = readFileSync(await file.path());
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  // 24-bit stereo at 44.1 kHz: a 1-bar intro at 112 BPM plus a 2 s tail
  const seconds = (bytes.length - 44) / (44100 * 2 * 3);
  expect(seconds).toBeGreaterThan(3.5);
  // not silent
  let peak = 0;
  for (let i = 44; i < bytes.length - 3; i += 3)
    peak = Math.max(peak, Math.abs(bytes.readIntLE(i, 3)));
  expect(peak).toBeGreaterThan(100000);
});

test("exports MIDI", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+E");
  const download = page.waitForEvent("download");
  await page.getByTestId("export-midi").click();
  const bytes = readFileSync(await (await download).path());
  expect(bytes.subarray(0, 4).toString()).toBe("MThd");
});
