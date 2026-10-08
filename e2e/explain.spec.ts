import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

interface Debug {
  __rebeat: {
    hints: Record<string, { command?: string }>;
    commands: () => { id: string }[];
  };
}

/** Hint ids on screen without an entry, and entries whose command doesn't exist. */
const problems = (page: Page) =>
  page.evaluate(() => {
    const { hints, commands } = (window as unknown as Debug).__rebeat;
    const ids = new Set(commands().map((c) => c.id));
    const shown = [...document.querySelectorAll<HTMLElement>("[data-hint]")].map(
      (e) => e.dataset.hint!,
    );
    return {
      missing: [...new Set(shown)].filter((id) => !hints[id]),
      badCommands: Object.entries(hints)
        .filter(([, h]) => h.command && !ids.has(h.command))
        .map(([id, h]) => `${id} → ${h.command}`),
    };
  });

test("explain mode shows a card with the explanation and the shortcut", async ({ page }) => {
  await openApp(page);
  const card = page.getByTestId("hint-card");

  // off: no cards
  await page.getByRole("button", { name: /play/i }).first().hover();
  await page.waitForTimeout(500);
  await expect(card).toHaveCount(0);

  await page.getByTestId("toggle-explain").click();
  await expect(page.getByTestId("toggle-explain")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("open-settings").hover();
  await expect(card).toBeVisible();
  await expect(card.locator("kbd").first()).toBeVisible();
  // the native tooltip is parked while the card shows
  await expect(page.getByTestId("open-settings")).not.toHaveAttribute("title");
  await page.mouse.move(5, 500);
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId("open-settings")).toHaveAttribute("title", /Settings/);

  // F1 over a hinted button opens the guide at its section
  await page.getByTestId("toggle-explain").hover();
  await expect(card).toBeVisible();
  await page.keyboard.press("F1");
  await expect(page.getByTestId("guide")).toBeVisible();

  // Shift+F1 turns it off again
  await page.mouse.move(5, 500);
  await page.keyboard.press("Shift+F1");
  await expect(page.getByTestId("toggle-explain")).toHaveAttribute("aria-pressed", "false");
});

test("every hint on screen has an entry and a real command", async ({ page }) => {
  await openApp(page);
  const run = (id: string) =>
    page.evaluate((cmd) => {
      const w = window as unknown as {
        __rebeat: { commands: () => { id: string; run(): void }[] };
      };
      w.__rebeat
        .commands()
        .find((c) => c.id === cmd)
        ?.run();
    }, id);
  const none = { missing: [], badCommands: [] };
  expect(await problems(page)).toEqual(none);
  for (const id of ["piano-roll", "sample-editor", "performance", "master-scope", "guide"]) {
    await run(`panel.${id}`);
    await page.waitForTimeout(300);
    expect(await problems(page)).toEqual(none);
  }
  // the synth editor, with a synth track selected
  await page.evaluate(() => {
    const w = window as unknown as {
      __rebeat: {
        store: {
          getState(): {
            project: { tracks: { id: string; kind: string }[] };
            setUi(p: object): void;
          };
        };
      };
    };
    const s = w.__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.kind === "instrument")!.id });
  });
  await run("panel.synth-editor");
  await page.getByTestId("synth-editor").waitFor();
  expect(await problems(page)).toEqual(none);
  // its Advanced view
  await page.getByTestId("synth-view").getByRole("button", { name: "Advanced" }).click();
  expect(await problems(page)).toEqual(none);
  // the pad view
  await run("dm.view");
  await page.waitForTimeout(200);
  expect(await problems(page)).toEqual(none);
  // dialogs
  for (const id of ["app.settings", "project.home", "project.exportAudio"]) {
    await run(id);
    await page.waitForTimeout(300);
    expect(await problems(page)).toEqual(none);
    await page.keyboard.press("Escape");
  }
});
