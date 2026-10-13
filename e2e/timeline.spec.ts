/**
 * The timeline (D180–D195): sections in song time, their settings, tempo changes, automation and
 * audio on the timeline. Most checks read the store; the sound ones poll the master's level.
 */
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

// the debug handle is loosely typed here: these tests poke at many parts of it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const rb = <T>(page: Page, fn: (r: Any) => T | Promise<T>) =>
  page.evaluate(`(${fn.toString()})(window.__rebeat)`) as Promise<T>;

const state = (page: Page) => rb(page, (r) => r.store.getState());
const slots = (page: Page) =>
  rb(page, (r) => r.store.getState().project.slots.map((s: Any) => ({ ...s })));

async function openTimeline(page: Page) {
  await rb(page, (r) =>
    r
      .commands()
      .find((c: Any) => c.id === "layout.arrange")
      .run(),
  );
  await page.getByTestId("timeline").waitFor();
}

async function level(page: Page) {
  return rb(page, (r) => Math.max(...r.engine.masterLevel()));
}

/** The loudest level over a while (audio comes a little late under load). */
async function loudest(page: Page, ms = 1200) {
  let max = 0;
  for (let t = 0; t < ms; t += 100) {
    max = Math.max(max, await level(page));
    await page.waitForTimeout(100);
  }
  return max;
}

test.describe("the timeline", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openTimeline(page);
  });

  test("shows the sections; drag moves, Alt+Shift+drag clones, the edge sets repeats", async ({
    page,
  }) => {
    const before = await slots(page);
    const blocks = page.getByTestId("timeline-block");
    await expect(blocks).toHaveCount(before.length);

    // drag the second section past the fourth
    const b1 = (await blocks.nth(1).boundingBox())!;
    const b3 = (await blocks.nth(3).boundingBox())!;
    await page.mouse.move(b1.x + b1.width / 2, b1.y + 30);
    await page.mouse.down();
    await page.mouse.move(b1.x + b1.width / 2 + 20, b1.y + 30, { steps: 3 });
    await page.mouse.move(b3.x + b3.width - 2, b3.y + 30, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await slots(page)).map((s: Any) => s.id))
      .toEqual([before[0], before[2], before[3], before[1], ...before.slice(4)].map((s) => s.id));
    // the song strip follows
    await expect(page.locator(".page-thumb")).toHaveCount(before.length);

    // Alt+Shift+drag the first one to the end: a clone (linked)
    const first = (await blocks.nth(0).boundingBox())!;
    const last = (await blocks.nth(before.length - 1).boundingBox())!;
    await page.keyboard.down("Alt");
    await page.keyboard.down("Shift");
    await page.mouse.move(first.x + first.width / 2, first.y + 30);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width / 2 + 20, first.y + 30, { steps: 3 });
    await page.mouse.move(last.x + last.width + 10, last.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.keyboard.up("Alt");
    const after = await slots(page);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1].patternId).toBe(after[0].patternId);

    // the first section's right edge: three repeats
    const edge = page.getByTestId("timeline-block-edge").nth(0);
    const box = (await blocks.nth(0).boundingBox())!;
    const perRepeat = box.width / after[0].repeats;
    const e = (await edge.boundingBox())!;
    await page.mouse.move(e.x + e.width / 2, e.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + perRepeat * 3 - 2, e.y + 20, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await slots(page))[0].repeats).toBe(3);
  });

  test("Shift+click selects a range, ⌘D duplicates it, Delete deletes it with a message", async ({
    page,
  }) => {
    const before = await slots(page);
    const blocks = page.getByTestId("timeline-block");
    await blocks.nth(0).click();
    await blocks.nth(1).click({ modifiers: ["Shift"] });
    await page.keyboard.press("ControlOrMeta+d");
    await expect.poll(async () => (await slots(page)).length).toBe(before.length + 2);
    // the copies are selected: delete them again
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await slots(page)).length).toBe(before.length);
    await expect(page.getByText(/Deleted 2 sections/)).toBeVisible();
  });

  test("a click on a track's cell mutes it in that section only", async ({ page }) => {
    const s = await state(page);
    const kick = s.project.tracks[0];
    const block = page.getByTestId("timeline-block").nth(1);
    const b = (await block.boundingBox())!;
    const row = page.locator(`[data-testid="timeline-track"][data-track="${kick.id}"]`);
    const r = (await row.boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, r.y + r.height / 2);
    await expect.poll(async () => (await slots(page))[1].mutes).toEqual([kick.id]);
    // its badge, and the drum machine shows it hatched while that section is edited
    await expect(block.getByTestId("section-badges")).toBeVisible();
    await block.click();
    await expect(page.locator(`[data-track-row="${kick.id}"]`)).toHaveAttribute(
      "data-muted-here",
      "true",
    );
    await expect(page.getByTestId("section-bar")).toContainText("muted");
    // its clones don't have it
    const others = (await slots(page)).filter(
      (x: Any, i: number) => i !== 1 && x.patternId === (s.project.slots[1] as Any).patternId,
    );
    for (const o of others) expect(o.mutes).toBeUndefined();
  });

  test("the ruler puts the start marker: Play starts in that section", async ({ page }) => {
    const ruler = page.getByTestId("timeline-ruler");
    const block = page.getByTestId("timeline-block").nth(2);
    const b = (await block.boundingBox())!;
    const r = (await ruler.boundingBox())!;
    await page.mouse.click(b.x + 3, r.y + r.height / 2);
    const target = (await slots(page))[2].id;
    await expect.poll(async () => (await state(page)).editSlotId).toBe(target);
    await page.keyboard.press("Space");
    await expect.poll(() => rb(page, (r) => r.transport.scheduledSteps()[0]?.slotId)).toBe(target);
    await page.keyboard.press("Space");
  });

  test("automation plays; turning the knob overrides it until Back to automation", async ({
    page,
  }) => {
    // the master's level automated down to silence over the whole song
    await rb(page, (r) =>
      r.store.getState().commit((p: Any) => {
        p.automation = [
          {
            id: "a",
            target: "master:volume",
            on: true,
            points: [{ slotId: p.slots[0].id, at: 0, value: 0 }],
          },
        ];
      }),
    );
    await expect(page.getByTestId("automation-lane")).toHaveCount(1);
    await page.keyboard.press("Space");
    await page.waitForTimeout(600);
    expect(await loudest(page)).toBeLessThan(0.01);

    // a hand on the knob: the lane is overridden, the knob's level plays
    await rb(page, (r) => r.store.getState().commit((p: Any) => void (p.master.volume = 0.79)));
    await expect(page.getByTestId("back-to-automation")).toBeVisible();
    await expect.poll(() => loudest(page, 600), { timeout: 8000 }).toBeGreaterThan(0.02);

    await page.getByTestId("back-to-automation").click();
    await expect.poll(() => loudest(page, 600), { timeout: 8000 }).toBeLessThan(0.01);
    await page.keyboard.press("Space");
  });

  test("tempo changes: steps get faster through a ramp; the BPM field shows the tempo now", async ({
    page,
  }) => {
    await rb(page, (r) =>
      r.store.getState().commit((p: Any) => {
        p.playMode = "song";
        p.bpm = 80;
        // from 80 to 200 over the first two sections
        p.tempo = [{ slotId: p.slots[2].id, at: 0, bpm: 200, ramp: true }];
      }),
    );
    await rb(page, (r) =>
      r.store
        .getState()
        .setUi({ editSlotId: r.store.getState().project.slots[0].id, startAt: null }),
    );
    await expect(page.locator('[data-hint="transport.bpm"]')).toContainText("80");
    await page.keyboard.press("Space");
    await page.waitForTimeout(2500);
    const durs: number[] = await rb(page, (r) =>
      r.transport.scheduledSteps().map((s: Any) => s.dur),
    );
    expect(durs[durs.length - 1]).toBeLessThan(durs[0] * 0.9);
    await expect
      .poll(async () =>
        Number(await page.locator('[data-hint="transport.bpm"] .num').first().textContent()),
      )
      .toBeGreaterThan(85);
    await page.keyboard.press("Space");
  });

  test("a sample dropped below the tracks is a new audio track, heard from part-way", async ({
    page,
  }) => {
    const n = (await state(page)).project.tracks.length;
    const drop = page.getByTestId("timeline-drop");
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.setData("application/x-rebeat-sample", "demo:vox-verse");
      return d;
    });
    const box = (await drop.boundingBox())!;
    await drop.dispatchEvent("dragover", {
      dataTransfer: dt,
      clientX: box.x + 5,
      clientY: box.y + 5,
    });
    await drop.dispatchEvent("drop", { dataTransfer: dt, clientX: box.x + 5, clientY: box.y + 5 });
    await expect.poll(async () => (await state(page)).project.tracks.length).toBe(n + 1);
    const s = await state(page);
    expect(s.project.regions).toHaveLength(1);
    expect(s.project.tracks[n].name).toBe("Audio 1");
    await expect(page.getByTestId("timeline-region")).toHaveCount(1);

    // solo it, start two beats into it: the vocal is heard (it started before Play)
    await rb(page, (r) => {
      const st = r.store.getState();
      const id = st.project.tracks[st.project.tracks.length - 1].id;
      st.commit((p: Any) => {
        p.playMode = "song";
        p.regions[0].start = { slotId: p.slots[0].id, at: 0 };
        p.tracks.find((t: Any) => t.id === id).solo = true;
      });
      st.setUi({
        editSlotId: st.project.slots[0].id,
        startAt: { slotId: st.project.slots[0].id, at: 2 },
      });
    });
    await page.keyboard.press("Space");
    await expect.poll(() => loudest(page, 600), { timeout: 8000 }).toBeGreaterThan(0.02);
    await page.keyboard.press("Space");
  });

  test("deleting a section with automation says so, and undo brings it all back", async ({
    page,
  }) => {
    await rb(page, (r) =>
      r.store.getState().commit((p: Any) => {
        p.automation = [
          {
            id: "a",
            target: "master:volume",
            on: true,
            points: [
              { slotId: p.slots[1].id, at: 0, value: 0.5 },
              { slotId: p.slots[1].id, at: 1, value: 0.7 },
            ],
          },
        ];
      }),
    );
    const before = await slots(page);
    await page.getByTestId("timeline-block").nth(1).click();
    await page.keyboard.press("Delete");
    await expect(page.getByText(/with 2 automation points/)).toBeVisible();
    expect((await state(page)).project.automation[0].points).toHaveLength(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await slots(page)).length).toBe(before.length);
    expect((await state(page)).project.automation[0].points).toHaveLength(2);
  });
});

test("Long Way Home: its tempo, its sections' settings, and a hint for everything", async ({
  page,
}) => {
  await openApp(page);
  await rb(page, (r) => {
    const e = r.examples.find((x: Any) => x.id === "long-way-home");
    r.store
      .getState()
      .loadProject(
        r.deserializeProject(JSON.parse(JSON.stringify(e.create()))),
        "example:long-way-home",
      );
  });
  await openTimeline(page);
  await page.getByTestId("tempo-lane-toggle").click();
  await expect(page.getByTestId("timeline-block")).toHaveCount(10);
  await expect(page.getByTestId("timeline-region")).toHaveCount(2);
  await expect(page.getByTestId("automation-lane")).toHaveCount(4);

  // every hint on the timeline has an entry
  const missing = await rb(page, (r) =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="timeline"] [data-hint]')]
      .map((e) => e.dataset.hint!)
      .filter((id) => !r.hints[id]),
  );
  expect(missing).toEqual([]);

  // the Break plays at 100 BPM
  await rb(page, (r) => {
    const st = r.store.getState();
    st.setUi({ editSlotId: st.project.slots[5].id, startAt: null });
  });
  await expect.poll(() => rb(page, (r) => Math.round(r.transport.tempoNow()))).toBe(100);
});
