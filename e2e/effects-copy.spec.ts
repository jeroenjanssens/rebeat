/**
 * Copying effects (D210, D211): one effect from its menu to other tracks, a whole chain from a
 * row's FX button, and pasting a copied effect's settings onto one of the same type.
 */
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const rb = <T>(page: Page, fn: (r: Any) => T | Promise<T>) =>
  page.evaluate(`(${fn.toString()})(window.__rebeat)`) as Promise<T>;
const effects = (page: Page) =>
  rb(page, (r) =>
    r.store
      .getState()
      .project.tracks.map((t: Any) =>
        t.effects.map((e: Any) => ({ id: e.id, name: e.name, params: e.params })),
      ),
  );

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await rb(page, (r) =>
    r.store.getState().commit((p: Any) => {
      for (const t of p.tracks) t.effects = [];
      p.tracks[0].effects = [
        {
          id: "fx-a",
          name: "Tremolo",
          params: { rate: 0.9, depth: 0.6, spread: 0, mix: 1 },
          bypass: false,
        },
        { id: "fx-b", name: "Delay", params: {}, bypass: false },
      ];
      p.tracks[1].effects = [
        {
          id: "fx-c",
          name: "Tremolo",
          params: { rate: 0.1, depth: 0.2, spread: 0, mix: 1 },
          bypass: false,
        },
      ];
    }),
  );
  await rb(page, (r) =>
    r.store.getState().setUi({ selectedTrackId: r.store.getState().project.tracks[0].id }),
  );
});

test("an effect's menu copies it to other tracks", async ({ page }) => {
  await page.getByTestId("fx-menu").first().click();
  await page.locator(".menu").getByRole("button", { name: "Copy to…" }).click();
  const dialog = page.getByTestId("fx-copy-to");
  await dialog.getByText("Every track").click();
  await dialog.getByTestId("fx-copy-to-go").click();
  const fx = await effects(page);
  // every other track got a Tremolo of its own at the end of its chain
  for (const list of fx.slice(1)) {
    expect(list.at(-1).name).toBe("Tremolo");
    expect(list.at(-1).id).not.toBe("fx-a");
    expect(list.at(-1).params.rate).toBe(0.9);
  }
  expect(fx[0]).toHaveLength(2);
});

test("a row's FX button copies the chain; paste replaces another's", async ({ page }) => {
  const rows = page.locator("[data-track-row]");
  await rows.nth(0).locator('[data-hint="dm.track.fx"]').click({ button: "right" });
  await page
    .locator(".menu")
    .getByRole("button", { name: /^Copy effects/ })
    .click();
  await rows.nth(2).locator('[data-hint="dm.track.fx"]').click({ button: "right" });
  await page
    .locator(".menu")
    .getByRole("button", { name: /^Paste: replace the chain/ })
    .click();
  const fx = await effects(page);
  expect(fx[2].map((e: Any) => e.name)).toEqual(["Tremolo", "Delay"]);
  // one undo step
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await effects(page))[2]).toEqual([]);
});

test("paste settings keeps the effect (its lanes keep working)", async ({ page }) => {
  await page.getByTestId("fx-menu").first().click();
  await page.locator(".menu").getByRole("button", { name: "Copy Tremolo" }).click();
  await rb(page, (r) =>
    r.store.getState().setUi({ selectedTrackId: r.store.getState().project.tracks[1].id }),
  );
  await page.getByTestId("fx-menu").first().click();
  await page.locator(".menu").getByRole("button", { name: "Paste settings" }).click();
  const fx = await effects(page);
  expect(fx[1][0].id).toBe("fx-c");
  expect(fx[1][0].params.rate).toBe(0.9);
});
