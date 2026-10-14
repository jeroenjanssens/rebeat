import { expect, test, type Page } from "@playwright/test";
import { midiKeyboard } from "./helpers";

type W = {
  __midi: (d: number[]) => void;
  __rebeat: {
    store: {
      getState(): { project: { tracks: { id: string; name: string }[] }; setUi(p: object): void };
    };
    settings: () => Promise<{ getState(): { set(p: object): void } }>;
    commands: () => { id: string; run(): void }[];
  };
};

const send = (page: Page, d: number[]) => page.evaluate((d) => (window as never as W).__midi(d), d);

async function openEditor(page: Page) {
  await page.evaluate(() => {
    const r = (window as never as W).__rebeat;
    const s = r.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.name === "Bass")!.id });
    r.commands()
      .find((c) => c.id === "panel.synth-editor")!
      .run();
  });
  return page.getByTestId("synth-editor");
}

test("the synth editor's piano lights what a MIDI keyboard plays, follows its octave and wheels", async ({
  page,
}) => {
  await midiKeyboard(page);
  const editor = await openEditor(page);
  const keyboard = editor.getByTestId("keyboard");
  // (the editor loads when it opens: its piano listens from then on)
  await expect(keyboard).toBeVisible();
  // the Bass editor's keyboard starts at C1: C2 is on it
  await send(page, [0x90, 36, 100]);
  await expect(keyboard.locator('[data-key="36"][data-lit]')).toHaveCount(1);
  await send(page, [0x80, 36, 0]);
  await expect(keyboard.locator("[data-lit]")).toHaveCount(0);

  // a note far above: the keyboard moves there
  await send(page, [0x90, 76, 90]);
  await expect(keyboard.locator('[data-key="76"][data-lit]')).toHaveCount(1);
  await send(page, [0x80, 76, 0]);
  await expect(keyboard.locator("[data-lit]")).toHaveCount(0);

  // the device's pitch bend moves the editor's wheel, and springs back with it
  const bend = editor.getByTestId("bend-wheel").locator("div");
  const middle = await bend.evaluate((e) => (e as HTMLElement).style.bottom);
  await send(page, [0xe0, 0x7f, 0x7f]);
  await expect.poll(() => bend.evaluate((e) => (e as HTMLElement).style.bottom)).not.toBe(middle);
  await send(page, [0xe0, 0x00, 0x40]);
  await expect.poll(() => bend.evaluate((e) => (e as HTMLElement).style.bottom)).toBe(middle);
});

test("the synth editor's keyboard can hide while a MIDI keyboard is connected", async ({
  page,
}) => {
  await midiKeyboard(page);
  const editor = await openEditor(page);
  await expect(editor.getByTestId("keyboard")).toBeVisible();
  await page.getByTestId("open-settings").click();
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  await page.getByTestId("synth-keyboard-setting").selectOption("noMidi");
  await page.keyboard.press("Escape");
  await expect(editor.getByTestId("keyboard")).toHaveCount(0);
  await expect(editor.getByTestId("bend-wheel")).toHaveCount(0);
});
