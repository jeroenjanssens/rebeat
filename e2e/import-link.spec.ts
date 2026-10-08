import { expect, test, type Page } from "@playwright/test";
import { oneShot, wav } from "./fixtures";
import { openApp, waitForProject } from "./helpers";

const RAW = "https://raw.githubusercontent.com/jeroenjanssens/beatbox-samples/HEAD/";
const STRUDEL = {
  _base: "https://raw.githubusercontent.com/jeroenjanssens/beatbox-samples/main/",
  bass: ["wav/bass1.wav", "wav/bass2.wav"],
  clap: "wav/clap.wav",
  kick: ["wav/kick1.wav", "wav/kick2.wav", "wav/kick3.wav"],
};

type W = { __rebeat: { library: { getState(): { samples: { name: string; folder: string }[] } } } };
const samples = (page: Page) =>
  page.evaluate(() =>
    (window as never as W).__rebeat.library.getState().samples.map((s) => `${s.folder}/${s.name}`),
  );

let served = 0;

test.beforeEach(async ({ page }) => {
  served = 0;
  await page.route("**/tidal-drum-machines.json", (r) => r.fulfill({ json: {} }));
  await page.route(`${RAW}strudel.json`, (r) => r.fulfill({ json: STRUDEL }));
  // every .wav anywhere on these hosts: a distinct sound (the library dedupes identical audio)
  await page.route(/\.wav$/, (r) => {
    served += 1;
    return r.fulfill({ body: wav(oneShot(80 + served * 37, 0.2)), contentType: "audio/wav" });
  });
  await openApp(page);
});

async function importLink(page: Page, link: string) {
  await page.getByTestId("library-import-link").click();
  await page.getByTestId("import-link").fill(link);
  await page.getByTestId("import-link-run").click();
}

test("a GitHub repository with a strudel.json becomes a source to browse", async ({ page }) => {
  await importLink(page, "https://github.com/jeroenjanssens/beatbox-samples");
  await expect(
    page.getByText("Added beatbox-samples to Online kits: 6 sounds").first(),
  ).toBeVisible();
  // the library shows Online kits, with the source at the top
  const kit = page.locator('[data-online-kit="beatbox-samples"]');
  await expect(kit).toBeVisible();
  await kit.getByRole("button", { name: /beatbox-samples/ }).click();
  await expect(kit.locator("[data-online-sound]")).toHaveCount(6);
  await expect(kit.locator("[data-online-sound]").first()).toContainText("Bass 1");
  expect(await samples(page)).toEqual([]);

  // search finds its sounds by name
  await page.getByTestId("online-search").fill("kick");
  await expect(page.getByTestId("online-kits").locator("[data-online-sound]")).toHaveCount(3);
  await page.getByTestId("online-search").fill("");

  // add all of them
  await kit.getByTitle("Add all to the library").click();
  await expect.poll(async () => (await samples(page)).length).toBe(6);
  expect(await samples(page)).toContain("Kits/beatbox-samples/beatbox-samples Kick 2");

  // it's remembered after a reload, and can be removed
  await page.reload();
  await page.getByTestId("audio-overlay").click();
  await waitForProject(page);
  await page.getByTestId("library").getByRole("button", { name: "All samples" }).click();
  await page.locator(".menu").getByRole("button", { name: "Online kits" }).click();
  await expect(kit).toBeVisible();
  await kit.getByRole("button", { name: "Remove this source" }).click();
  await expect(kit).toHaveCount(0);
});

test("github:user/repo without a strudel.json lists the repository's audio files", async ({
  page,
}) => {
  await page.route("https://raw.githubusercontent.com/someone/drums/HEAD/strudel.json", (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
  await page.route("https://api.github.com/repos/someone/drums/git/trees/HEAD?recursive=1", (r) =>
    r.fulfill({
      json: {
        tree: [
          { path: "README.md", type: "blob" },
          { path: "kicks", type: "tree" },
          { path: "kicks/deep kick.wav", type: "blob" },
          { path: "kicks/punchy.wav", type: "blob" },
          { path: "hats/closed.wav", type: "blob" },
        ],
      },
    }),
  );
  await importLink(page, "github:someone/drums");
  const kit = page.locator('[data-online-kit="drums"]');
  await kit.getByRole("button", { name: /drums/ }).click();
  const sounds = kit.locator("[data-online-sound]");
  await expect(sounds).toHaveCount(3);
  await expect(sounds.filter({ hasText: "deep kick.wav" })).toHaveCount(1);
  // folders become the sound names
  await expect(sounds.filter({ hasText: "Kicks 1" })).toHaveCount(1);
});

test("a link to an audio file imports it straight away", async ({ page }) => {
  await importLink(page, "https://example.com/sounds/Big%20Snare.wav");
  await expect.poll(() => samples(page)).toEqual(["Downloads/Big Snare"]);
});

test("a broken link explains what went wrong", async ({ page }) => {
  await page.route("https://example.com/missing.json", (r) => r.fulfill({ status: 404, body: "" }));
  await importLink(page, "https://example.com/missing.json");
  await expect(page.getByTestId("import-link-error")).toContainText("Not found");
  await page.getByTestId("import-link").fill("hello");
  await page.getByTestId("import-link-run").click();
  await expect(page.getByTestId("import-link-error")).toContainText("Paste a link");
});
