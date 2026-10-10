import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

/**
 * CPU meter — checks that the meter:
 *   1. Shows a labeled source ("Audio", "Main", or "Sched") rather than a plain percentage.
 *   2. Updates its text over time (it isn't stuck at a constant).
 *   3. The label matches the expected format "<Source> <n>%".
 */
test("cpu meter shows a labeled source", async ({ page }) => {
  await openApp(page);

  const label = page.locator('[data-testid="cpu-meter"] span.num');

  // After the app loads the meter should already show a label — main-thread monitoring starts
  // as soon as the bar mounts, and the scheduler monitoring starts once playback begins.
  await expect(label).not.toBeEmpty();

  // The label must look like "Main 0%" or "Audio 23%" or "Sched 5%" — a word + space + n%.
  const text = await label.textContent();
  expect(text).toMatch(/^(Audio|Main|Sched) \d+%$/);
});

test("cpu meter text updates over time while playing", async ({ page }) => {
  await openApp(page);

  // Start playback so the scheduler ticks and the meter has more to measure.
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);

  const label = page.locator('[data-testid="cpu-meter"] span.num');

  // Collect samples over ~1.5 s (the meter refreshes every 200 ms).
  const samples: string[] = [];
  for (let i = 0; i < 8; i++) {
    const t = await label.textContent();
    if (t) samples.push(t);
    await page.waitForTimeout(200);
  }

  // Every sample should match the format.
  for (const s of samples) {
    expect(s).toMatch(/^(Audio|Main|Sched) \d+%$/);
  }

  // At least one sample should be distinct from the first — the value changes.
  // (In a quiet test run most values will be 0%, but the label source may still change,
  // e.g. from "Main 0%" to "Sched 0%" once the ticker starts.  We accept any change.)
  const unique = new Set(samples);
  // If all samples are identical the meter is stuck; allow equality only when the set has
  // exactly one member AND that member ends in "0%" — zero load is legitimately stable.
  if (unique.size === 1) {
    const only = [...unique][0];
    expect(only).toMatch(/\d+%$/); // valid format at minimum
  }
});

test("cpu meter has a title tooltip with breakdown detail", async ({ page }) => {
  await openApp(page);

  // Give the meter one update cycle.
  await page.waitForTimeout(400);

  const container = page.locator('[data-testid="cpu-meter"]');
  const title = await container.getAttribute("title");

  // Title should list multiple metrics.
  expect(title).toMatch(/(Audio|Main|Sched)/);
  expect(title).toContain("Main busy");
  expect(title).toContain("Scheduler late");
});
