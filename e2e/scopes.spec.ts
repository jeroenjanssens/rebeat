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

test("the expand button puts large scopes on a row under the bar", async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 800 });
  await openApp(page);
  await page.getByTestId("scopes-expand").click();
  const row = page.getByTestId("scopes-row");
  await expect(row).toBeVisible();
  await expect(page.getByTestId("transport").getByTestId("top-scope")).toHaveCount(0);
  expect((await row.getByTestId("top-scope").first().boundingBox())!.height).toBeGreaterThan(60);
  await page.getByTestId("scopes-expand").click();
  await expect(row).toHaveCount(0);
  await expect(page.getByTestId("transport").getByTestId("top-scope").first()).toBeVisible();
});

test("Play and Stop are as wide, so the bar doesn't shift", async ({ page }) => {
  await openApp(page);
  const play = page.getByTestId("play");
  const before = (await play.boundingBox())!.width;
  await play.click();
  await expect(play).toHaveText(/Stop/);
  expect((await play.boundingBox())!.width).toBe(before);
  await play.click();
});
