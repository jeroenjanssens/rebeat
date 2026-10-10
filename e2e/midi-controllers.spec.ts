import { expect, test, type Page } from "@playwright/test";
import { midiDevices } from "./helpers";

type Track = {
  id: string;
  name: string;
  mode: string;
  params: Record<string, number>;
  volume: number;
};
type W = {
  __midiFrom: (name: string, d: number[]) => void;
  __rebeat: {
    store: {
      getState(): {
        playing: boolean;
        selectedTrackId: string | null;
        project: { tracks: Track[]; midiMappings: { target: string; mode?: string }[] };
        setUi(p: Record<string, unknown>): void;
      };
    };
    midi(): Promise<{ getState(): { monitor: { action: string; text: string }[] } }>;
    settings(): Promise<{
      getState(): { midiMappings: { target: string; mode?: string; slot?: string }[] };
    }>;
  };
};

const send = (page: Page, device: string, bytes: number[]) =>
  page.evaluate(
    ([d, b]) => (window as never as W).__midiFrom(d as string, b as number[]),
    [device, bytes],
  );

const tracks = (page: Page) =>
  page.evaluate(() => (window as never as W).__rebeat.store.getState().project.tracks);

const select = (page: Page, index: number) =>
  page.evaluate((i) => {
    const s = (window as never as W).__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks[i].id });
  }, index);

const lastAction = (page: Page) =>
  page.evaluate(
    async () => (await (window as never as W).__rebeat.midi()).getState().monitor[0]?.action,
  );

test("a MiniLab 3 is recognized; its map turns the selected track's knobs in every project", async ({
  page,
}) => {
  await midiDevices(page, ["MiniLab3 MIDI", "MiniLab3 MCU"]);
  await expect(page.getByTestId("midi-settings")).toContainText("Arturia MiniLab 3 is connected");
  await page.getByTestId("midi-use-detected").click();
  await expect(page.getByTestId("midi-map-slots")).toContainText("CC 74 · ch 1");
  await page.keyboard.press("Escape");

  // knob 1 (CC 74) moves the selected track's first SOUND knob, whichever track that is
  const before = await tracks(page);
  await select(page, 0);
  await send(page, "MiniLab3 MIDI", [0xb0, 74, 127]);
  await expect(lastAction(page)).resolves.toContain("Knob 1");
  await select(page, 1);
  await send(page, "MiniLab3 MIDI", [0xb0, 74, 0]);
  const after = await tracks(page);
  const changed = (i: number) =>
    Object.keys(after[i].params).filter((k) => after[i].params[k] !== before[i].params[k]);
  expect(changed(0)).toHaveLength(1);
  expect(after[0].params[changed(0)[0]]).toBe(1);
  expect(changed(1)).toHaveLength(1);
  expect(after[1].params[changed(1)[0]]).toBe(0);
  expect(changed(0)[0].startsWith("sound.")).toBe(true);

  // fader 1 (CC 82): the selected track's volume
  await send(page, "MiniLab3 MIDI", [0xb0, 82, 64]);
  expect((await tracks(page))[1].volume).toBeCloseTo(64 / 127, 3);

  // it's in the settings, so a new project (or a reload) keeps it
  await page.reload();
  await page.getByTestId("audio-overlay").click();
  const n = await page.evaluate(
    async () => (await (window as never as W).__rebeat.settings()).getState().midiMappings.length,
  );
  expect(n).toBe(12);
});

test("an endless knob that sends relative steps is recognized and steps the value", async ({
  page,
}) => {
  await midiDevices(page, ["MiniLab3 MIDI"]);
  await page.getByTestId("midi-controller").selectOption("minilab3");
  await page.keyboard.press("Escape");
  await select(page, 0);
  // offset-64 encoding: 65 = one step clockwise
  for (let i = 0; i < 4; i++) await send(page, "MiniLab3 MIDI", [0xb0, 74, 65]);
  const mode = await page.evaluate(
    async () =>
      (await (window as never as W).__rebeat.settings())
        .getState()
        .midiMappings.find((m) => m.slot === "knob1")?.mode,
  );
  expect(mode).toBe("rel64");
  const key = Object.keys((await tracks(page))[0].params).find((k) => k.startsWith("sound."))!;
  const read = async () => {
    const t = (await tracks(page))[0];
    return Object.values(t.params).length ? t.params : {};
  };
  const p0 = await read();
  for (let i = 0; i < 3; i++) await send(page, "MiniLab3 MIDI", [0xb0, 74, 63]); // three steps back
  const p1 = await read();
  const moved = Object.keys(p1).filter((k) => p1[k] !== p0[k]);
  expect(moved).toHaveLength(1);
  expect(p1[moved[0]]).toBeCloseTo(p0[moved[0]] - (3 * 2) / 127, 4);
  expect(key).toBeTruthy();
});

test("pads on channel 10 play the drum tracks while a Notes track is selected", async ({
  page,
}) => {
  await midiDevices(page, ["Pad Keys"]);
  await page.keyboard.press("Escape");
  const ts = await tracks(page);
  const notesIndex = ts.findIndex((t) => t.mode === "notes");
  expect(notesIndex).toBeGreaterThanOrEqual(0);
  await select(page, notesIndex);
  await send(page, "Pad Keys", [0x99, 36, 100]);
  await expect(lastAction(page)).resolves.toBe(`Pad: ${ts[0].name}`);
  await send(page, "Pad Keys", [0x89, 36, 0]);
  // the keys (channel 1) play the selected track
  await send(page, "Pad Keys", [0x90, 60, 100]);
  await expect(lastAction(page)).resolves.toBe(`Played on ${ts[notesIndex].name}`);
  await send(page, "Pad Keys", [0x80, 60, 0]);
});

test("Mackie Control transport buttons play and stop", async ({ page }) => {
  await midiDevices(page, ["MiniLab3 MIDI", "MiniLab3 MCU"]);
  await page.keyboard.press("Escape");
  const playing = () =>
    page.evaluate(() => (window as never as W).__rebeat.store.getState().playing);
  await send(page, "MiniLab3 MCU", [0x90, 94, 127]);
  await expect.poll(playing).toBe(true);
  await send(page, "MiniLab3 MCU", [0x90, 93, 127]);
  await expect.poll(playing).toBe(false);
  // the same note on the keys' port is just a note
  await send(page, "MiniLab3 MIDI", [0x90, 94, 100]);
  await expect.poll(playing).toBe(false);
});

test("faders, knobs for every project and command buttons learn from the UI", async ({ page }) => {
  await midiDevices(page, ["Knobs"]);
  await page.keyboard.press("Escape");

  // a mixer fader, in this project
  await page.evaluate(() =>
    (window as never as { __rebeat: { commands(): { id: string; run(): void }[] } }).__rebeat
      .commands()
      .find((c) => c.id === "panel.mixer")!
      .run(),
  );
  await page
    .getByTestId("mixer-strip")
    .first()
    .locator("[data-hint='param.mix.volume']")
    .click({ button: "right" });
  await page.locator(".menu").getByRole("button", { name: "MIDI learn (in this project)" }).click();
  await send(page, "Knobs", [0xb0, 7, 100]);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as never as W).__rebeat.store.getState().project.midiMappings.length,
      ),
    )
    .toBe(1);
  await send(page, "Knobs", [0xb0, 7, 0]);
  expect((await tracks(page))[0].volume).toBe(0);

  // an encoder strip knob as "the selected track's SOUND knob 1", in every project
  await select(page, 0);
  await page.getByTestId("encoder-strip").locator("svg").first().click({ button: "right" });
  await page
    .locator(".menu")
    .getByRole("button", { name: /SOUND knob 1 \(every project\)/ })
    .click();
  for (const v of [10, 11, 12, 13]) await send(page, "Knobs", [0xb0, 21, v]);
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await (window as never as W).__rebeat.settings())
          .getState()
          .midiMappings.map((m) => m.target),
      ),
    )
    .toContain("selected:sound:1");
  await select(page, 1);
  const before = (await tracks(page))[1].params;
  await send(page, "Knobs", [0xb0, 21, 127]);
  const after = (await tracks(page))[1].params;
  expect(Object.keys(after).filter((k) => after[k] !== before[k])).toHaveLength(1);

  // a button for Play / stop, from the Shortcuts dialog
  await page.evaluate(() =>
    (window as never as { __rebeat: { commands(): { id: string; run(): void }[] } }).__rebeat
      .commands()
      .find((c) => c.id === "app.shortcuts")!
      .run(),
  );
  await page.getByTestId("midi-learn-transport.toggle").click();
  await send(page, "Knobs", [0x90, 48, 127]);
  await expect(page.getByTestId("midi-learn-transport.toggle")).toContainText("Note 48");
  await page.keyboard.press("Escape");
  await send(page, "Knobs", [0x90, 48, 127]);
  await expect
    .poll(() => page.evaluate(() => (window as never as W).__rebeat.store.getState().playing))
    .toBe(true);
  await send(page, "Knobs", [0x80, 48, 0]);
  await send(page, "Knobs", [0x90, 48, 127]);
  await expect
    .poll(() => page.evaluate(() => (window as never as W).__rebeat.store.getState().playing))
    .toBe(false);
});

test("the monitor says what came in and what Rebeat did", async ({ page }) => {
  await midiDevices(page, ["Knobs"]);
  await send(page, "Knobs", [0xb0, 99, 5]);
  const monitor = page.getByTestId("midi-monitor");
  await expect(monitor).toContainText("CC 99 = 5");
  await expect(monitor).toContainText("Nothing (not mapped");
});

test("MIDI Start and Stop play and stop (a Launchkey Mini MK4's Play button)", async ({ page }) => {
  await midiDevices(page, ["Launchkey Mini 25 MK4"]);
  await page.keyboard.press("Escape");
  const playing = () =>
    page.evaluate(() => (window as never as W).__rebeat.store.getState().playing);
  await send(page, "Launchkey Mini 25 MK4", [0xfa]);
  await expect.poll(playing).toBe(true);
  await send(page, "Launchkey Mini 25 MK4", [0xfc]);
  await expect.poll(playing).toBe(false);
});

test("Learn every control walks through a map's slots", async ({ page }) => {
  await midiDevices(page, ["Launchkey Mini 25 MK4"]);
  await page.getByTestId("midi-use-detected").click();
  await page.getByTestId("midi-learn-all").click();
  const step = page.getByTestId("midi-learn-all-step");
  for (let i = 0; i < 8; i++) {
    await expect(step).toContainText(`(${i + 1} of 8)`);
    // an endless encoder: offset-64 steps
    for (let k = 0; k < 4; k++) await send(page, "Launchkey Mini 25 MK4", [0xb0, 85 + i, 65]);
  }
  await expect(step).toBeHidden();
  const learned = await page.evaluate(async () =>
    (await (window as never as W).__rebeat.settings())
      .getState()
      .midiMappings.filter((m) => m.slot?.startsWith("knob"))
      .map((m) => m.mode),
  );
  expect(learned).toEqual(Array(8).fill("rel64"));
});
