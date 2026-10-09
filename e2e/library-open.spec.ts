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

test("a double-click only opens the editor; a single click previews", async ({ page }) => {
  await library(page).getByRole("button", { name: "All samples" }).click();
  await page.locator(".menu").getByRole("button", { name: "909 kit" }).click();
  const kick = library(page).locator("[data-sample]", { hasText: "909 Kick" });
  const previews = () =>
    page.evaluate(() =>
      (window as never as { __rebeat: { previews(): number } }).__rebeat.previews(),
    );
  await kick.dblclick();
  await expect(page.getByTestId("sample-editor")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await previews()).toBe(0);
  await library(page).locator("[data-sample]", { hasText: "909 Snare" }).click();
  await expect.poll(previews).toBe(1);
  // instruments too
  await goTo(page, "Synths");
  const reese = library(page).locator("[data-instrument]", { hasText: "Reese Bass" });
  await reese.dblclick();
  await expect(page.getByTestId("synth-editor")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await previews()).toBe(1);
});

test("each synth track gets its own synth editor tab", async ({ page }) => {
  await goTo(page, "Synths");
  await library(page).locator("[data-instrument]", { hasText: "Reese Bass" }).dblclick();
  await library(page).locator("[data-instrument]", { hasText: "Supersaw" }).dblclick();
  const editors = page.getByTestId("synth-editor");
  await expect(page.locator(".dv-tab", { hasText: "Reese Bass · synth" })).toHaveCount(1);
  await expect(page.locator(".dv-tab", { hasText: "Supersaw · synth" })).toHaveCount(1);
  // switch back: the first tab still edits its own track
  await page.locator(".dv-tab", { hasText: "Reese Bass · synth" }).click();
  await expect(editors.locator(":visible").getByTestId("synth-start").first()).toBeVisible();
  const visible = page.locator('[data-testid="synth-editor"]:visible');
  await expect(visible).toHaveCount(1);
  await expect(visible.locator(".label").first()).toHaveText("Reese Bass");
  // renaming the track renames its tab
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState() as unknown as {
      commit(fn: (p: { tracks: T[] }) => void): void;
      selectedTrackId: string;
    };
    const id = s.selectedTrackId;
    s.commit((p) => void (p.tracks.find((t) => t.id === id)!.name = "Low End"));
  });
  await expect(page.locator(".dv-tab", { hasText: "Low End · synth" })).toHaveCount(1);
});
