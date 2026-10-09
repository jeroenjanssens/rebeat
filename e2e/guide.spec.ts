import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("the guide opens, links resolve and search finds sections", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("open-guide").click();
  const guide = page.getByTestId("guide");
  await expect(guide.getByRole("heading", { name: "Getting started", level: 1 })).toBeVisible();
  await expect(guide.locator("h1")).toHaveCount(16);

  // placeholders are filled in, and the play shortcut shows up as a key
  const text = await guide.innerText();
  expect(text).not.toContain("{{");
  expect(text).not.toContain("{#");
  await expect(guide.locator("kbd", { hasText: "Space" }).first()).toBeVisible();
  // every shortcut placeholder points at a command that has a key
  await expect(guide.locator(".guide .guide-nokey")).toHaveCount(0);

  // every in-guide link has a target
  const missing = await guide.evaluate((el) =>
    [...el.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute("href")!.slice(1))
      .filter((id) => !el.querySelector(`#guide-${CSS.escape(id)}`)),
  );
  expect(missing).toEqual([]);
  const panelIds = await guide.evaluate((el) =>
    [...el.querySelectorAll('a[href^="panel:"]')].map((a) => a.getAttribute("href")!.slice(6)),
  );
  for (const id of new Set(panelIds))
    expect([
      "drum-machine",
      "library",
      "inspector",
      "mixer",
      "sample-editor",
      "piano-roll",
      "performance",
      "master-scope",
      "beatbox",
      "guide",
    ]).toContain(id);

  // search, then jump to a section
  await page.getByTestId("guide-search").fill("speaker mode");
  await page.getByTestId("guide-result").filter({ hasText: "Audio · Settings" }).click();
  await expect(guide.locator("#guide-settings-audio")).toBeInViewport();

  // a command link runs the command
  await page.getByTestId("guide-search").fill("");
  await guide.locator('a[href="command:app.shortcuts"]').first().click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");

  // F1 opens the guide at the front again
  await page.getByTestId("guide-search").blur();
  await page.keyboard.press("F1");
  await expect(guide).toBeVisible();
});
