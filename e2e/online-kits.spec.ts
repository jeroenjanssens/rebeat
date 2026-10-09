import { expect, test, type Page } from "@playwright/test";
import { oneShot, wav } from "./fixtures";
import { openApp } from "./helpers";

const BASE = "https://kits.test/machines/";
const INDEX = {
  _base: BASE,
  RolandTR808_bd: ["RolandTR808/rolandtr808-bd/BD0000.wav"],
  RolandTR808_hh: ["RolandTR808/rolandtr808-hh/Hat%20Closed.wav"],
  RolandTR808_sd: [
    "RolandTR808/rolandtr808-sd/SD0000.wav",
    "RolandTR808/rolandtr808-sd/SD0010.wav",
  ],
  LinnDrum_oh: ["LinnDrum/linndrum-oh/Open.wav"],
  LinnDrum_sd: ["LinnDrum/linndrum-sd/Snarepop.wav"],
};

type W = {
  __rebeat: {
    library: { getState(): { samples: { name: string; folder: string }[] } };
    store: { getState(): { project: { tracks: { source: string }[] } } };
  };
};

const librarySamples = (page: Page) =>
  page.evaluate(() =>
    (window as never as W).__rebeat.library.getState().samples.map((s) => `${s.folder}/${s.name}`),
  );

let downloads: string[] = [];

test.beforeEach(async ({ page }) => {
  downloads = [];
  await page.route("**/tidal-drum-machines.json", (r) => r.fulfill({ json: INDEX }));
  // a different sound per file (the library dedupes identical audio)
  const files = Object.values(INDEX)
    .flat()
    .filter((u) => u.endsWith(".wav"));
  await page.route(`${BASE}**`, (r) => {
    const url = r.request().url();
    downloads.push(url);
    const i = files.findIndex((f) => url.endsWith(f));
    return r.fulfill({ body: wav(oneShot(100 + i * 40, 0.3)), contentType: "audio/wav" });
  });
  await openApp(page);
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: "Online kits" }).click();
  await expect(page.locator("[data-online-kit]")).toHaveCount(2);
});

const kit = (page: Page, name: string) => page.locator(`[data-online-kit="${name}"]`);

test("previewing a sound doesn't add it to the library; + does", async ({ page }) => {
  await kit(page, "RolandTR808")
    .getByRole("button", { name: /Roland TR808/ })
    .click();
  const sounds = kit(page, "RolandTR808").locator("[data-online-sound]");
  await expect(sounds).toHaveCount(4);
  await sounds.filter({ hasText: "Cl Hat" }).getByRole("button").first().click();
  await expect.poll(() => downloads.length).toBe(1);
  await page.waitForTimeout(300);
  expect(await librarySamples(page)).toEqual([]);

  // + adds it, from the download already made
  await sounds.filter({ hasText: "Cl Hat" }).getByTitle("Add to the library").click();
  await expect.poll(() => librarySamples(page)).toEqual(["Kits/Roland TR808/Roland TR808 Cl Hat"]);
  expect(downloads).toHaveLength(1);
});

test("the kit button adds one of each sound type", async ({ page }) => {
  await kit(page, "RolandTR808").getByTitle("Add the kit to the library").click();
  await expect.poll(async () => (await librarySamples(page)).length).toBe(3);
  expect((await librarySamples(page)).sort()).toEqual([
    "Kits/Roland TR808/Roland TR808 Cl Hat",
    "Kits/Roland TR808/Roland TR808 Kick",
    "Kits/Roland TR808/Roland TR808 Snare 1",
  ]);
});

test("search finds sounds across kits by type and file name", async ({ page }) => {
  await page.getByTestId("online-search").fill("hat");
  const results = page.getByTestId("online-kits").locator("[data-online-sound]");
  await expect(results).toHaveCount(2);
  // kits in alphabetical order
  await expect(results.nth(0)).toContainText("Linn Drum · Op Hat");
  await expect(results.nth(1)).toContainText("Roland TR808 · Cl Hat");
  await expect(results.nth(1)).toContainText("Hat Closed.wav");
  await page.getByTestId("online-search").fill("snarepop");
  await expect(results).toHaveCount(1);
  await page.getByTestId("online-search").fill("808 snare");
  await expect(results).toHaveCount(2);
  await expect(page.getByTestId("online-sound-count")).toHaveText("Sounds (2)");
});

test("dragging a sound onto a track replaces its sound", async ({ page }) => {
  await page.getByTestId("online-search").fill("snarepop");
  const sound = page.getByTestId("online-kits").locator("[data-online-sound]").first();
  const track = page.locator('[data-panel="drum-machine"] [data-track-row]').first();
  await sound.dragTo(track);
  const source = () =>
    page.evaluate(() => (window as never as W).__rebeat.store.getState().project.tracks[0].source);
  await expect.poll(source).toBe("Linn Drum Snare");
  expect(await librarySamples(page)).toEqual(["Kits/Linn Drum/Linn Drum Snare"]);
});

test("load as tracks adds a track per sound type", async ({ page }) => {
  const count = () =>
    page.evaluate(() => (window as never as W).__rebeat.store.getState().project.tracks.length);
  const before = await count();
  await kit(page, "RolandTR808").getByRole("button", { name: "Load as tracks" }).click();
  await expect.poll(count).toBe(before + 3);
  const sources = await page.evaluate(() =>
    (window as never as W).__rebeat.store
      .getState()
      .project.tracks.slice(-3)
      .map((t) => t.source),
  );
  expect(sources).toEqual(["Roland TR808 Kick", "Roland TR808 Snare 1", "Roland TR808 Cl Hat"]);
});
