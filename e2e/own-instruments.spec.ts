import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { fixtureFiles, oneShot, soundfont, wav } from "./fixtures";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type T = {
  name: string;
  sound?: { source: string; preset: string; sampleId?: string; zones?: { note: number }[] };
  id: string;
};
type W = {
  __rebeat: {
    store: { getState(): { project: { tracks: T[] } } };
    engine: { instrumentState(id: string): string };
  };
};
const track = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (window as never as W).__rebeat.store.getState().project.tracks.find((t) => t.name === n)!,
    name,
  );
const yours = async (page: Page) => {
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: "Your sounds", exact: true }).click();
  return page.getByTestId("library-list").locator("[data-instrument]");
};
async function importFiles(page: Page, files: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("library-import").click();
  await (await chooser).setFiles(files);
}

test("a SoundFont becomes an instrument that plays and travels with the project", async ({
  page,
}) => {
  await importFiles(page, fixtureFiles({ "Test.sf2": soundfont() }));
  await expect(page.getByText("Added 1 instrument from Test.sf2").first()).toBeVisible();
  const items = page.getByTestId("library-list").locator("[data-instrument]");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Test");
  await items.first().dragTo(page.locator("[data-track-row]", { hasText: "BASS" }));
  await expect.poll(async () => (await track(page, "Bass")).sound?.source).toBe("sf2");
  const bass = await track(page, "Bass");
  expect(bass.sound?.preset).toBe("Test Sine");
  await expect
    .poll(
      () =>
        page.evaluate((id) => (window as never as W).__rebeat.engine.instrumentState(id), bass.id),
      {
        timeout: 15000,
      },
    )
    .toBe("ready");

  // the .rebeat file carries the SoundFont
  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+Shift+E");
  const zip = unzipSync(new Uint8Array(readFileSync(await (await download).path())));
  expect(Object.keys(zip).some((k) => k.startsWith("soundfonts/"))).toBe(true);
});

test("a folder of samples named by note becomes a multi-sample instrument", async ({ page }) => {
  const zip = zipSync({
    "Harp G4.wav": new Uint8Array(wav(oneShot(392, 0.3))),
    "Harp C4.wav": new Uint8Array(wav(oneShot(262, 0.3))),
    "Harp E4.wav": new Uint8Array(wav(oneShot(330, 0.3))),
  });
  await importFiles(page, fixtureFiles({ "Harp.zip": Buffer.from(zip) }));
  const sample = page.getByTestId("library-list").locator("[data-sample]", { hasText: "Harp C4" });
  await sample.click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "Make instrument from “Harp”" }).click();
  await expect(page.getByText("Made “Harp” from 3 samples").first()).toBeVisible();
  const items = await yours(page);
  await items
    .filter({ hasText: "Harp" })
    .dragTo(page.locator("[data-track-row]", { hasText: "CHORDS" }));
  await expect.poll(async () => (await track(page, "Chords")).sound?.zones?.length).toBe(3);
  expect((await track(page, "Chords")).sound!.zones!.map((z) => z.note)).toEqual([60, 64, 67]);
});

test("a pitched entry in a strudel.json becomes an instrument", async ({ page }) => {
  await page.route("**/tidal-drum-machines.json", (r) => r.fulfill({ json: {} }));
  await page.route("https://example.com/keys/strudel.json", (r) =>
    r.fulfill({
      json: {
        _base: "https://example.com/keys/",
        piano: { c4: "C4.wav", g4: "G4.wav" },
        clap: "clap.wav",
      },
    }),
  );
  let n = 0;
  await page.route(/example\.com\/keys\/.*\.wav$/, (r) =>
    r.fulfill({ body: wav(oneShot(200 + n++ * 50, 0.2)), contentType: "audio/wav" }),
  );
  await page.getByTestId("library-import-link").click();
  await page.getByTestId("import-link").fill("https://example.com/keys/strudel.json");
  await page.getByTestId("import-link-run").click();
  const kit = page.locator('[data-online-kit="keys"]');
  await kit.getByRole("button", { name: /keys/ }).click();
  await expect(kit.locator("[data-online-instrument]")).toHaveCount(1);
  await expect(kit.locator("[data-online-sound]")).toHaveCount(1);
  await kit.getByTestId("online-add-instrument").click();
  await expect(page.getByText("Added keys piano to Your sounds").first()).toBeVisible();
  const items = await yours(page);
  await expect(items.filter({ hasText: "keys piano" })).toHaveCount(1);
});

test("exports include sampled instruments", async ({ page }) => {
  test.setTimeout(120_000);
  await importFiles(page, fixtureFiles({ "Test.sf2": soundfont() }));
  const items = page.getByTestId("library-list").locator("[data-instrument]");
  await items.first().dragTo(page.locator("[data-track-row]", { hasText: "BASS" }));
  await expect.poll(async () => (await track(page, "Bass")).sound?.source).toBe("sf2");
  await page.keyboard.press("ControlOrMeta+E");
  await page.locator('[data-hint="app.export.source"]').selectOption({ label: "Track: Bass" });
  const download = page.waitForEvent("download");
  await page.getByTestId("export-wav").click();
  const bytes = readFileSync(await (await download).path());
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  // 24-bit: the soloed SoundFont bass is in the render
  let peak = 0;
  for (let i = 44; i < bytes.length - 3; i += 3)
    peak = Math.max(peak, Math.abs(bytes.readIntLE(i, 3)));
  expect(peak).toBeGreaterThan(100000);
});
