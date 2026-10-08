import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

test("renders the current page to a WAV file offline", async ({ page }) => {
  // offline rendering takes a while on a busy machine
  test.setTimeout(90_000);
  await page.keyboard.press("ControlOrMeta+E");
  await page.getByRole("button", { name: "Current page" }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-wav").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.wav$/);
  const bytes = readFileSync(await file.path());
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  // 24-bit stereo at 44.1 kHz: a 1-bar intro at 112 BPM plus a 2 s tail
  const seconds = (bytes.length - 44) / (44100 * 2 * 3);
  expect(seconds).toBeGreaterThan(3.5);
  // not silent
  let peak = 0;
  for (let i = 44; i < bytes.length - 3; i += 3)
    peak = Math.max(peak, Math.abs(bytes.readIntLE(i, 3)));
  expect(peak).toBeGreaterThan(100000);
});

test("exports MIDI", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+E");
  const download = page.waitForEvent("download");
  await page.getByTestId("export-midi").click();
  const bytes = readFileSync(await (await download).path());
  expect(bytes.subarray(0, 4).toString()).toBe("MThd");
});

const isMp3 = (b: Buffer) =>
  b.subarray(0, 3).toString() === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);

test("exports the current page as MP3", async ({ page }) => {
  test.setTimeout(90_000);
  await page.keyboard.press("ControlOrMeta+E");
  await page.getByRole("button", { name: "Current page" }).click();
  await page.getByTestId("export-format").getByRole("button", { name: "MP3" }).click();
  await page.getByRole("button", { name: "192 kbit/s" }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-wav").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.mp3$/);
  const bytes = readFileSync(await file.path());
  expect(isMp3(bytes)).toBe(true);
  // ~3.6 s at 192 kbit/s is about 85 kB
  expect(bytes.length).toBeGreaterThan(50_000);
  expect(bytes.length).toBeLessThan(150_000);
});

test.describe("exporting a sample", () => {
  async function exportKick(page: import("@playwright/test").Page, format: string) {
    await page.getByTestId("library").getByRole("button", { name: "All samples" }).click();
    await page.locator(".menu").getByRole("button", { name: "909 kit" }).click();
    await page
      .getByTestId("library-list")
      .locator("[data-sample]", { hasText: "909 Kick" })
      .click({ button: "right" });
    await page.locator(".menu").getByRole("button", { name: "Export…" }).click();
    const dialog = page.getByTestId("sample-export");
    // built-in sounds have no stored file
    await expect(dialog.getByRole("button", { name: "Original file" })).toHaveCount(0);
    await dialog.getByTestId("export-format").getByRole("button", { name: format }).click();
    const download = page.waitForEvent("download");
    await dialog.getByTestId("sample-export-run").click();
    const file = await download;
    await expect(dialog).toBeHidden();
    return { name: file.suggestedFilename(), bytes: readFileSync(await file.path()) };
  }

  test("as WAV", async ({ page }) => {
    const { name, bytes } = await exportKick(page, "WAV");
    expect(name).toBe("909 Kick.wav");
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  });

  test("as MP3", async ({ page }) => {
    const { name, bytes } = await exportKick(page, "MP3");
    expect(name).toBe("909 Kick.mp3");
    expect(isMp3(bytes)).toBe(true);
  });

  test("as OGG", async ({ page }) => {
    const { name, bytes } = await exportKick(page, "OGG");
    expect(name).toBe("909 Kick.ogg");
    expect(bytes.subarray(0, 4).toString()).toBe("OggS");
  });
});

for (const [song, busiest] of [
  ["Neon Horizon", "Chorus A"],
  ["Hyperdrive", "Chorus A"],
  ["Liquid Ladder", "Peak A"],
] as const)
  test(`the synth song ${song} renders loud and clean`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.keyboard.press("ControlOrMeta+O");
    await page.getByTestId("example-card").filter({ hasText: song }).click();
    await expect(page.getByTestId("project-name")).toContainText(song);
    // the busiest page: every synth plays
    await page.evaluate((name) => {
      const s = (
        window as never as {
          __rebeat: {
            store: {
              getState(): {
                project: {
                  slots: { id: string; patternId: string }[];
                  patterns: Record<string, { name: string }>;
                };
                setUi(p: object): void;
              };
            };
          };
        }
      ).__rebeat.store.getState();
      const slot = s.project.slots.find((x) => s.project.patterns[x.patternId].name === name)!;
      s.setUi({ editSlotId: slot.id });
    }, busiest);
    await page.keyboard.press("ControlOrMeta+E");
    await page.getByRole("button", { name: "Current page" }).click();
    const download = page.waitForEvent("download");
    await page.getByTestId("export-wav").click();
    const bytes = readFileSync(await (await download).path());
    let peak = 0;
    for (let i = 44; i < bytes.length - 3; i += 3)
      peak = Math.max(peak, Math.abs(bytes.readIntLE(i, 3)));
    const full = 2 ** 23;
    console.log(song, "peak dBFS", (20 * Math.log10(peak / full)).toFixed(1));
    expect(peak / full).toBeGreaterThan(0.2);
    expect(peak / full).toBeLessThan(1);
  });
