import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

type W = {
  __rebeat: {
    store: { getState(): { project: { tracks: { id: string }[] }; selectedTrackId: string } };
  };
};

test("the scopes sit in the top bar when they fit", async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 800 });
  await openApp(page);
  const tracks = await page.evaluate(
    () => (window as never as W).__rebeat.store.getState().project.tracks.length,
  );
  await expect(page.getByTestId("transport").getByTestId("top-scope")).toHaveCount(tracks + 2);
  await expect(page.getByTestId("scopes-row")).toHaveCount(0);
});

test("on a narrow window the scopes get their own row, which folds", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await openApp(page);
  await expect(page.getByTestId("scopes-row")).toBeVisible();
  await page.getByTestId("scopes-row").getByTestId("top-scope").nth(3).click();
  const second = await page.evaluate(
    () => (window as never as W).__rebeat.store.getState().project.tracks[1].id,
  );
  expect(
    await page.evaluate(() => (window as never as W).__rebeat.store.getState().selectedTrackId),
  ).toBe(second);
  await page.getByTestId("scopes-fold").click();
  await expect(page.getByTestId("scopes-row")).toHaveCount(0);
  await page.getByTestId("scopes-fold").click();
  await expect(page.getByTestId("scopes-row")).toBeVisible();
});
