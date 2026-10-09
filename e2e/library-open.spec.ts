import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

type T = { id: string; name: string; kind: string; instrument?: { preset: string } };
type W = {
  __rebeat: {
    store: { getState(): { project: { tracks: T[] }; selectedTrackId: string } };
  };
};

test.beforeEach(async ({ page }) => openApp(page));

const library = (page: Page) => page.getByTestId("library");
const goTo = async (page: Page, label: string) => {
  await library(page).locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: label, exact: true }).click();
};
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    return { tracks: s.project.tracks, selected: s.selectedTrackId };
  });

test("double-clicking a synth opens it in the synth editor, on a track that plays it", async ({
  page,
}) => {
  await goTo(page, "Synths");
  const before = (await state(page)).tracks.length;
  const reese = library(page).locator("[data-instrument]", { hasText: "Reese Bass" });
  await reese.dblclick();
  await expect(page.getByTestId("synth-editor")).toBeVisible();
  let s = await state(page);
  // no track played it: a new one does now, selected, in the editor
  expect(s.tracks.length).toBe(before + 1);
  const t = s.tracks.find((x) => x.id === s.selected)!;
  expect(t.instrument?.preset).toBe("reese");
  // the editor shows that track
  await expect(page.getByTestId("synth-editor").locator(".label").first()).toHaveText(t.name);
  // again: the same track, no new one
  await reese.dblclick();
  s = await state(page);
  expect(s.tracks.length).toBe(before + 1);
  // the right-click menu says where it opens
  await reese.click({ button: "right" });
  await expect(
    page.locator(".menu").getByRole("button", { name: "Open in synth editor" }),
  ).toBeVisible();
});

test("a sampled instrument opens in the Inspector", async ({ page }) => {
  await goTo(page, "Pianos & keys");
  const first = library(page).locator("[data-instrument]").first();
  await first.click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Open in Inspector" }).click();
  await expect(page.locator('[data-panel="inspector"]')).toBeVisible();
  const s = await state(page);
  expect(s.tracks.find((x) => x.id === s.selected)?.kind).toBe("instrument");
});

test("double-clicking a built-in sound edits a copy in the sample editor", async ({ page }) => {
  await library(page).getByRole("button", { name: "All samples" }).click();
  await page.locator(".menu").getByRole("button", { name: "909 kit" }).click();
  await library(page).locator("[data-sample]", { hasText: "909 Kick" }).dblclick();
  await expect(page.getByTestId("sample-editor")).toBeVisible();
  await expect(page.getByText("editing a copy in your library").first()).toBeVisible();
});
