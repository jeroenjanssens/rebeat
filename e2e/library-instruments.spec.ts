import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

type W = {
  __rebeat: {
    store: {
      getState(): {
        project: {
          tracks: {
            id: string;
            name: string;
            mode: string;
            sound?: { source: string; preset: string };
            params: Record<string, number>;
          }[];
        };
      };
    };
  };
};
const tracks = (page: Page) =>
  page.evaluate(() => (window as never as W).__rebeat.store.getState().project.tracks);

const go = async (page: Page, location: string) => {
  await page.getByTestId("library").locator('[data-hint="library.location"]').click();
  await page.locator(".menu").getByRole("button", { name: location, exact: true }).click();
};
const list = (page: Page) => page.getByTestId("library-list");

test("the library lists synths and sampled instruments with their source", async ({ page }) => {
  await go(page, "Synths");
  await expect(list(page).locator("[data-instrument]")).toHaveCount(37);
  await expect(page.getByTestId("family-header")).toContainText("Rebeat factory synths");
  await go(page, "General MIDI");
  await expect(list(page).locator("[data-instrument]")).toHaveCount(128);
  await expect(page.getByTestId("family-header")).toContainText("CC BY-SA 3.0");
  // streamed instruments show they still need downloading
  await expect(
    list(page).locator("[data-instrument]").first().locator(".lucide-cloud"),
  ).toHaveCount(1);
});

test("dragging a synth onto a Hits track plays it as hits (D93)", async ({ page }) => {
  await go(page, "Synths");
  const sub = list(page).locator('[data-instrument="synth:sub"]');
  await sub.dragTo(page.locator('[data-panel="drum-machine"] [data-track-row]').first());
  await expect.poll(async () => (await tracks(page))[0].sound?.source).toBe("synth");
  const kick = (await tracks(page))[0];
  expect(kick.mode).toBe("hits");
  expect(kick.sound).toEqual({ source: "synth", preset: "sub" });
  // what you heard in the library: the filter open
  expect(kick.params["sound.cutoff"]).toBe(1);
});

test("Enter adds an instrument track; favorites and search include instruments", async ({
  page,
}) => {
  await go(page, "Pianos & keys");
  const piano = list(page).locator('[data-instrument="smplr:piano"]');
  await piano.click();
  const before = (await tracks(page)).length;
  await list(page).press("Enter");
  await expect.poll(async () => (await tracks(page)).length).toBe(before + 1);
  expect((await tracks(page)).at(-1)!.sound).toEqual({ source: "smplr", preset: "piano" });

  await piano.hover();
  await piano.getByTitle("Favorite").click();
  await go(page, "Favorites");
  await expect(list(page).locator('[data-instrument="smplr:piano"]')).toHaveCount(1);

  await go(page, "All samples");
  await page.getByTestId("library-search").fill("trumpet");
  await expect(list(page).locator('[data-instrument="smplr:sf:trumpet"]')).toHaveCount(1);
  await expect(list(page).locator('[data-instrument="smplr:sf:muted_trumpet"]')).toHaveCount(1);
});

test("the keyboard plays the selected instrument without moving the step cursor", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await go(page, "Synths");
  await list(page).locator('[data-instrument="synth:juno-strings"]').click();
  for (const k of ["a", "d", "g", "x", "a"]) await page.keyboard.press(k);
  // the drum machine's draw tool (D) wasn't triggered
  const tool = await page.evaluate(
    () =>
      (
        window as never as { __rebeat: { store: { getState(): { tool: string } } } }
      ).__rebeat.store.getState().tool,
  );
  expect(tool).toBe("draw");
  expect(errors).toEqual([]);
});

test("every track shows an icon for what it plays", async ({ page }) => {
  const kind = (name: string) =>
    page
      .locator("[data-track-row]", { hasText: name })
      .getByTestId("track-sound-kind")
      .locator("[data-sound-kind]")
      .getAttribute("data-sound-kind");
  expect(await kind("KICK")).toBe("oneshot");
  expect(await kind("BASS")).toBe("synth");
  expect(await kind("VOX")).toBe("loop");
  await go(page, "Pianos & keys");
  await list(page)
    .locator('[data-instrument="smplr:piano"]')
    .dragTo(page.locator("[data-track-row]", { hasText: "BASS" }));
  await expect.poll(() => kind("BASS")).toBe("instrument");
});
