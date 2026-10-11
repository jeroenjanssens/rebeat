import { expect, test } from "@playwright/test";
import { midiKeyboard } from "./helpers";

type W = {
  __midi: (d: number[]) => void;
  __rebeat: {
    engine: { masterLevel(): number[] };
    store: {
      getState(): {
        project: { tracks: { id: string; name: string }[] };
        setUi(u: object): void;
      };
    };
  };
};

const select = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate((name) => {
    const s = (window as never as W).__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.name === name)!.id });
  }, name);

const peak = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const r = (window as never as W).__rebeat;
    let max = 0;
    const end = performance.now() + 800;
    while (performance.now() < end) {
      max = Math.max(max, ...r.engine.masterLevel());
      await new Promise((res) => setTimeout(res, 20));
    }
    return max;
  });

test("the keys follow the synth editor you're in (D132)", async ({ page }) => {
  await midiKeyboard(page);
  // open the Bass synth's own editor tab, then select a drum track
  await select(page, "Bass");
  await page.getByTestId("edit-synth").click();
  await expect(page.getByTestId("synth-editor")).toBeVisible();
  await select(page, "Kick");
  // off: a note on channel 1 goes to the pads by position (note 60: no track), so it's silent
  await page.evaluate(() => (window as never as W).__midi([0x90, 48, 100]));
  expect(await peak(page)).toBeLessThan(0.01);
  await page.evaluate(() => (window as never as W).__midi([0x80, 48, 0]));
  await page.waitForTimeout(600);

  await page.getByTestId("keys-chip").click();
  await page.locator(".menu .menu-item", { hasText: "Follow the synth editor in focus" }).click();
  await expect(page.getByTestId("keys-chip")).toContainText("Editor");
  // the menu says exactly what plays, and from where
  await page.getByTestId("keys-chip").click();
  await expect(page.getByTestId("keys-now")).toContainText(/Synth editor · Bass/i);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as never as W).__midi([0x90, 48, 100]));
  await expect.poll(() => peak(page), { timeout: 5000 }).toBeGreaterThan(0.01);
  await page.evaluate(() => (window as never as W).__midi([0x80, 48, 0]));
});
