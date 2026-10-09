import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

type T = {
  id: string;
  name: string;
  mode: string;
  mute: boolean;
  sound?: { source: string; preset?: string; sampleId?: string };
};
type W = {
  __rebeat: {
    engine: { masterLevel(): number[] };
    transport: { play(): void; stop(): void };
    store: {
      getState(): {
        project: { tracks: T[] };
        setUi(p: object): void;
        commit(fn: (p: { tracks: T[] }) => void): void;
      };
    };
  };
};

const tracks = (page: Page) =>
  page.evaluate(() => (window as never as W).__rebeat.store.getState().project.tracks);
const byName = async (page: Page, name: string) =>
  (await tracks(page)).find((t) => t.name === name)!;
const select = (page: Page, name: string) =>
  page.evaluate((name) => {
    const s = (window as never as W).__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.name === name)!.id });
  }, name);

test.beforeEach(async ({ page }) => openApp(page));

test("+ Step track adds a track that plays hits, notes or a clip", async ({ page }) => {
  const before = (await tracks(page)).length;
  for (const [item, mode] of [
    ["Hits · a drum sound", "hits"],
    ["Notes · a synth", "notes"],
    ["Clip · record or drop audio", "clip"],
  ]) {
    await page.getByTestId("add-step-track").click();
    await page.locator(".menu").getByRole("button", { name: item }).click();
    await expect.poll(async () => (await tracks(page)).at(-1)?.mode).toBe(mode);
  }
  expect((await tracks(page)).length).toBe(before + 3);
});

test("a synth switched to Hits plays a note on every hit, and you can switch back", async ({
  page,
}) => {
  await select(page, "Bass");
  const display = page.getByTestId("display-mode");
  // synths have no clip mode
  await expect(display.getByRole("button", { name: "Clip", exact: true })).toBeDisabled();
  await display.getByRole("button", { name: "Hits", exact: true }).click();
  await expect.poll(async () => (await byName(page, "Bass")).mode).toBe("hits");
  expect((await byName(page, "Bass")).sound?.source).toBe("synth");
  // the Bass alone: hits of the synth
  await page.evaluate(() => {
    const r = (window as never as W).__rebeat;
    r.store.getState().commit((p) => {
      for (const t of p.tracks) t.mute = t.name !== "Bass";
    });
    r.transport.play();
  });
  await expect
    .poll(
      async () =>
        Math.max(
          ...(await page.evaluate(() => (window as never as W).__rebeat.engine.masterLevel())),
        ),
      { timeout: 8000 },
    )
    .toBeGreaterThan(0.01);
  await page.evaluate(() => (window as never as W).__rebeat.transport.stop());
  await display.getByRole("button", { name: "Notes", exact: true }).click();
  await expect.poll(async () => (await byName(page, "Bass")).mode).toBe("notes");
});

test("the Inspector shows one Sound section: mode, family, hit note, save", async ({ page }) => {
  await select(page, "Kick");
  const section = page.getByTestId("sound-section");
  const modes = section.getByTestId("mode-switch");
  await expect(modes.getByRole("button", { name: "Hits" })).toHaveAttribute("data-active", "true");
  // a sample can be a clip
  await expect(modes.getByRole("button", { name: "Clip" })).toBeEnabled();
  // a synth on the kick: still hits, at a hit note you can set
  await section.getByTestId("sound-family").getByRole("button", { name: "Synth" }).click();
  await expect.poll(async () => (await byName(page, "Kick")).sound?.source).toBe("synth");
  expect((await byName(page, "Kick")).mode).toBe("hits");
  await expect(modes.getByRole("button", { name: "Clip" })).toBeDisabled();
  await section.getByTestId("hit-note").selectOption({ label: "C2" });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            (window as never as W).__rebeat.store
              .getState()
              .project.tracks.find((t) => t.name === "Kick") as T & { hitNote?: number }
          ).hitNote,
      ),
    )
    .toBe(36);
  // samples and synths alike go to Your sounds
  await section.getByTestId("save-to-your-sounds").click();
  await expect(page.getByText(/Saved “.+” to Your sounds/)).toBeVisible();
});

test("Edit sound… opens the sound's editor", async ({ page }) => {
  const menuOf = (name: string) =>
    page
      .locator("[data-track-row]", { hasText: name })
      .locator('[data-hint="dm.track.name"]')
      .click({ button: "right" });
  await menuOf("BASS");
  await page.locator(".menu").getByRole("button", { name: "Edit sound…" }).click();
  await expect(page.getByTestId("synth-editor")).toBeVisible();
  // a built-in kit sound opens as your copy in the sample editor
  await menuOf("KICK");
  await page.locator(".menu").getByRole("button", { name: "Edit sound…" }).click();
  await expect(page.locator(".dv-tab", { hasText: "909 Kick" })).toBeVisible();
});
