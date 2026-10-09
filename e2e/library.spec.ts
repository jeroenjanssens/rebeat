import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { clickLoop, fixtureFiles, oneShot, wav } from "./fixtures";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

async function importSamples(page: import("@playwright/test").Page, files: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("library-import").click();
  await (await chooser).setFiles(files);
}

test("imports files, detects loop tempo and dedupes by content", async ({ page }) => {
  const files = fixtureFiles({
    "Big Kick.wav": wav(oneShot()),
    "Drum loop.wav": wav(clickLoop(100, 8)),
  });
  await importSamples(page, files);
  const list = page.getByTestId("library-list");
  await expect(list.locator("[data-sample]")).toHaveCount(2);
  await expect(list.locator("[data-sample]", { hasText: "Drum loop" })).toContainText("100");
  await importSamples(page, files);
  await expect(page.getByText("Imported 2 samples").first()).toBeVisible();
  await expect(list.locator("[data-sample]")).toHaveCount(2);
});

test("adds a library sample as a track and plays it", async ({ page }) => {
  await importSamples(page, fixtureFiles({ "Big Kick.wav": wav(oneShot()) }));
  const item = page.getByTestId("library-list").locator("[data-sample]").first();
  await item.click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Add as new track" }).click();
  const row = page.locator("[data-track-row]", { hasText: "BIG KICK" });
  await expect(row).toBeVisible();
  await expect(page.getByTestId("inspector")).toContainText("Big Kick");
});

test("drags a sample onto a track to replace its sound", async ({ page }) => {
  await importSamples(page, fixtureFiles({ "Tight Snare.wav": wav(oneShot(220, 0.2)) }));
  const item = page.getByTestId("library-list").locator("[data-sample]").first();
  const target = page.locator("[data-track-row]").nth(1);
  await item.dragTo(target);
  await target.click({ position: { x: 60, y: 12 } });
  await expect(page.getByTestId("inspector")).toContainText("Tight Snare");
});

test("filters by search and shows built-in kits", async ({ page }) => {
  await importSamples(
    page,
    fixtureFiles({ "Alpha.wav": wav(oneShot()), "Beta.wav": wav(oneShot(90)) }),
  );
  await page.getByTestId("library-search").fill("bet");
  await expect(page.getByTestId("library-list").locator("[data-sample]")).toHaveCount(1);
  await page.getByTestId("library-search").fill("");
  // the library is narrow in the default layout: locations are in a dropdown
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: "909 kit" }).click();
  await expect(page.getByTestId("library-list").locator("[data-sample]")).toHaveCount(8);
});

test("the library lists one sample per row, also when it's wider", async ({ page }) => {
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: "909 kit" }).click();
  const items = page.getByTestId("library-list").locator("[data-sample]");
  await expect(items).toHaveCount(8);
  // the width that used to show two columns
  await page.evaluate(() => {
    const w = window as never as {
      __rebeat: { dock: { api: { getPanel(id: string): { api: { setSize(s: object): void } } } } };
    };
    w.__rebeat.dock.api.getPanel("library").api.setSize({ width: 520 });
  });
  await expect
    .poll(() => page.getByTestId("library-list").evaluate((el) => el.clientWidth))
    .toBeGreaterThan(400);
  const lefts = await items.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().left)),
  );
  expect(new Set(lefts).size).toBe(1);
});

test("used in project lists the built-in sounds the tracks play", async ({ page }) => {
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: "Used in project" }).click();
  const items = page.getByTestId("library-list").locator("[data-sample]");
  // Night Drive: kick, snare, clap, two hats, rim and the vox hook
  await expect(items.filter({ hasText: "Kick" })).toHaveCount(1);
  expect(await items.count()).toBeGreaterThanOrEqual(6);
  await expect(items.filter({ hasText: "Vox hook" })).toHaveCount(1);
  // the bass and chords play synths: they're listed too
  await expect(
    page.getByTestId("library-list").locator('[data-instrument="synth:acid"]'),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("library-list").locator('[data-instrument="synth:warm-pad"]'),
  ).toHaveCount(1);
});

test("sorts by name and duration in both directions, also in a kit", async ({ page }) => {
  await importSamples(
    page,
    fixtureFiles({
      "b medium.wav": wav(oneShot(80, 1)),
      "a long.wav": wav(oneShot(70, 2)),
      "c short.wav": wav(oneShot(90, 0.2)),
    }),
  );
  const list = page.getByTestId("library-list");
  await expect(list.locator("[data-sample]")).toHaveCount(3);
  const names = () =>
    list
      .locator("[data-sample]")
      .evaluateAll((els) => els.map((e) => e.textContent!.trim().split(/\s/)[0]));
  const pick = async (label: string) => {
    await page.getByTestId("library-sort").click();
    await page.locator(".menu").getByRole("button", { name: label }).click();
  };
  await pick("Name");
  await expect(page.getByTestId("library-sort")).toHaveText("Name ↑");
  expect(await names()).toEqual(["a", "b", "c"]);
  await pick("Z → A");
  expect(await names()).toEqual(["c", "b", "a"]);
  await pick("Duration");
  await expect(page.getByTestId("library-sort")).toHaveText("Duration ↑");
  expect(await names()).toEqual(["c", "b", "a"]);
  await pick("Longest first");
  expect(await names()).toEqual(["a", "b", "c"]);

  // a built-in kit, by name
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: "909 kit" }).click();
  await pick("Name");
  const kit = await list
    .locator("[data-sample]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-sample")));
  const sorted = await list
    .locator("[data-sample]")
    .evaluateAll((els) => els.map((e) => e.querySelector(".truncate")?.textContent ?? ""));
  expect(kit).toHaveLength(8);
  expect(sorted.every((n) => /909/.test(n))).toBe(true);
  expect(
    [...sorted].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    ),
  ).toEqual(sorted);
});

test("the track menu shows the current sound and replaces it with a library sample", async ({
  page,
}) => {
  await importSamples(page, fixtureFiles({ "Big Kick.wav": wav(oneShot()) }));
  const name = page.locator('[data-panel="drum-machine"] [data-hint="dm.track.name"]').first();
  await name.click({ button: "right" });
  const picker = page.getByTestId("sound-picker");
  await expect(picker.getByTestId("current-sound")).toHaveText("909 Kick");
  await expect(page.getByTestId("sound-search")).toBeFocused();
  // typing doesn't trigger shortcuts (d = draw tool, space = play)
  await page.keyboard.type("big d");
  await expect(page.getByTestId("sound-search")).toHaveValue("big d");
  expect(
    await page.evaluate(
      () =>
        (
          window as never as { __rebeat: { store: { getState(): { playing: boolean } } } }
        ).__rebeat.store.getState().playing,
    ),
  ).toBe(false);
  await page.getByTestId("sound-search").fill("big");
  await expect(picker.locator("[data-sound]")).toHaveCount(1);
  await picker.locator("[data-sound]").click();
  await expect(picker).toBeHidden();
  const source = () =>
    page.evaluate(
      () =>
        (
          window as never as {
            __rebeat: { store: { getState(): { project: { tracks: { source: string }[] } } } };
          }
        ).__rebeat.store.getState().project.tracks[0].source,
    );
  expect(await source()).toBe("Big Kick");
  await name.click({ button: "right" });
  await expect(picker.getByTestId("current-sound")).toHaveText("Big Kick");
  await expect(picker.locator('[data-sound][data-active="true"]')).toHaveText("Big Kick");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(source).toBe("909 Kick");
});

test("exports a library sample's original file from the sample editor", async ({ page }) => {
  const data = wav(oneShot());
  await importSamples(page, fixtureFiles({ "Big Kick.wav": data }));
  await page.getByTestId("library-list").locator("[data-sample]").first().dblclick();
  await page.getByTestId("editor-export").click();
  const dialog = page.getByTestId("sample-export");
  await dialog.getByRole("button", { name: "Original file" }).click();
  const download = page.waitForEvent("download");
  await dialog.getByTestId("sample-export-run").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Big Kick.wav");
  expect(readFileSync(await file.path()).equals(data)).toBe(true);
});
