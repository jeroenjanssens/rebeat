import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type R = {
  store: {
    getState(): Record<string, never> & {
      setUi(p: object): void;
      commit(fn: (p: never) => void): void;
    };
  };
};
const state = (page: Page, expr: string) =>
  page.evaluate((e) => {
    const s = (window as never as { __rebeat: R }).__rebeat.store.getState();
    return new Function("s", `return ${e}`)(s);
  }, expr);

test("a queued page starts when the current page ends", async ({ page }) => {
  await page.evaluate(() => {
    const s = (window as never as { __rebeat: R }).__rebeat.store.getState();
    s.commit((p: { bpm: number }) => void (p.bpm = 300));
  });
  await page.keyboard.press("Space");
  const thumbs = page.locator('[data-panel="drum-machine"] .page-thumb');
  await thumbs.nth(2).click();
  await expect(thumbs.nth(2)).toHaveClass(/queued/);
  await expect.poll(() => state(page, "s.playSlotId"), { timeout: 5000 }).toBe("slot-fill");
  await expect(thumbs.nth(2)).not.toHaveClass(/queued/);
});

test("song mode without looping stops after the last page", async ({ page }) => {
  await page.evaluate(() => {
    const s = (window as never as { __rebeat: R }).__rebeat.store.getState();
    s.commit((p: { bpm: number; slots: { repeats: number }[] }) => {
      p.bpm = 300;
      p.slots.forEach((x) => (x.repeats = 1));
    });
    s.setUi({ playMode: "song", songLoop: false, editSlotId: "slot-fill" });
  });
  await page.keyboard.press("Space");
  await expect.poll(() => state(page, "s.playing"), { timeout: 10000 }).toBe(false);
});

test("a clone shares its pattern; unlinking makes it independent", async ({ page }) => {
  const thumbs = page.locator('[data-panel="drum-machine"] .page-thumb');
  await thumbs.first().click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Clone page (linked)" }).click();
  await expect(thumbs).toHaveCount(6);
  const ids = await state(page, "s.project.slots.slice(0, 2).map((x) => x.patternId)");
  expect(ids[0]).toBe(ids[1]);
  await thumbs.nth(1).click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Unlink" }).click();
  const after = await state(page, "s.project.slots.slice(0, 2).map((x) => x.patternId)");
  expect(after[0]).not.toBe(after[1]);
});
