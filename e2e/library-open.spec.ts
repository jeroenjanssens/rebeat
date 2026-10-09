import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

type T = { id: string; name: string; mode: string; sound?: { preset: string } };
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

test("double-clicking a synth edits the library sound itself, without adding a track", async ({
  page,
}) => {
  await goTo(page, "Synths");
  const before = (await state(page)).tracks.length;
  const reese = library(page).locator("[data-instrument]", { hasText: "Reese Bass" });
  await reese.dblclick();
  const editor = page.locator('[data-testid="synth-editor"][data-library]');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId("synth-library-note")).toContainText("your first change");
  expect((await state(page)).tracks.length).toBe(before);
  // play it: through the preview, no track needed
  const key = editor.getByTestId("keyboard").locator('[data-key="36"]');
  await key.hover();
  await page.mouse.down();
  await page.mouse.up();
  // the first change makes your copy, in Your sounds; still no track
  await editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();
  await editor.locator('[data-hint="synth.osc.retrigger"]').first().click();
  await expect(editor.getByTestId("synth-library-note")).toContainText("saved as you go");
  await expect(page.locator(".dv-tab", { hasText: "Reese Bass copy · synth" })).toHaveCount(1);
  expect((await state(page)).tracks.length).toBe(before);
  await editor.locator('[data-section="Oscillator 1"] [aria-label="Pulse"]').click();
  await page.waitForTimeout(900);
  await goTo(page, "Your sounds");
  const copy = library(page).locator("[data-instrument]", { hasText: "Reese Bass copy" });
  await expect(copy).toHaveCount(1);
  // it keeps your edits: put it on a track to check
  await copy.dragTo(page.locator("[data-track-row]", { hasText: "CHORDS" }));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as never as {
              __rebeat: {
                store: {
                  getState(): {
                    project: {
                      tracks: {
                        name: string;
                        sound?: { patch?: { osc: { shape: number }[] } };
                      }[];
                    };
                  };
                };
              };
            }
          ).__rebeat.store
            .getState()
            .project.tracks.find((t) => t.name === "Chords")?.sound?.patch?.osc[0].shape,
      ),
    )
    .toBe(3);
  // double-clicking the copy opens the same editor again
  await copy.dblclick();
  await expect(page.locator(".dv-tab", { hasText: "Reese Bass copy · synth" })).toHaveCount(1);
  // its own undo
  await editor.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(
    editor.locator('[data-section="Oscillator 1"] [aria-label="Pulse"]'),
  ).toHaveAttribute("aria-checked", "false");
});

test("a sampled instrument has no editor of its own", async ({ page }) => {
  await goTo(page, "Pianos & keys");
  const before = (await state(page)).tracks.length;
  const first = library(page).locator("[data-instrument]").first();
  await first.click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Open in Inspector" }).click();
  await expect(page.getByText("has no editor of its own").first()).toBeVisible();
  expect((await state(page)).tracks.length).toBe(before);
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
  const edit = async (name: string) => {
    await page
      .locator("[data-track-row]", { hasText: name })
      .locator('[data-hint="dm.track.name"]')
      .click({ button: "right" });
    await page.locator(".menu").getByRole("button", { name: "Edit synth…" }).click();
  };
  await edit("BASS");
  await edit("CHORDS");
  await expect(page.locator(".dv-tab", { hasText: "Bass · synth" })).toHaveCount(1);
  await expect(page.locator(".dv-tab", { hasText: "Chords · synth" })).toHaveCount(1);
  // switch back: the first tab still edits its own track
  await page.locator(".dv-tab", { hasText: "Bass · synth" }).click();
  const visible = page.locator('[data-testid="synth-editor"]:visible');
  await expect(visible).toHaveCount(1);
  await expect(visible.locator(".label").first()).toHaveText("Bass");
  // renaming the track renames its tab
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState() as unknown as {
      commit(fn: (p: { tracks: T[] }) => void): void;
    };
    s.commit((p) => void (p.tracks.find((t) => t.name === "Bass")!.name = "Low End"));
  });
  await expect(page.locator(".dv-tab", { hasText: "Low End · synth" })).toHaveCount(1);
});
