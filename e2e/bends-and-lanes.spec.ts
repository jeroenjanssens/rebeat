/**
 * Bends per note, every synth knob and switch on the timeline, stepped lanes, folding lanes and
 * moving many points (PLAN-bend-and-lanes.md, D220–D239).
 */
import { expect, test, type Page } from "@playwright/test";
import { midiKeyboard, openApp } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const rb = <T>(page: Page, fn: (r: Any) => T | Promise<T>) =>
  page.evaluate(`(${fn.toString()})(window.__rebeat)`) as Promise<T>;

/** A song of one synth track: one long note of A3 on step 0 (with a bend), rendered offline, and
 * its pitch in Hz from rising zero crossings, over a stretch of seconds. */
const renderPitch = (page: Page, bend: object | null, from: number, to: number) =>
  page.evaluate(
    async ([bend, from, to]) => {
      const r = (window as Any).__rebeat;
      const project = JSON.parse(JSON.stringify(r.store.getState().project));
      const track = project.tracks.find((t: Any) => t.name === "Bass");
      track.sound = { source: "synth", preset: "init" };
      track.effects = [];
      project.automation = [];
      project.playMode = "song";
      const slot = project.slots[0];
      project.slots = [slot];
      const lane = project.patterns[slot.patternId].lanes[track.id];
      for (const s of lane.steps) {
        s.on = false;
        delete s.notes;
      }
      lane.steps[0] = {
        ...lane.steps[0],
        on: true,
        notes: [{ pitch: 57, length: 15, velocity: 0.8, ...(bend ? { bend } : {}) }],
      };
      const b: AudioBuffer = await r.renderProject(project, {
        range: "song",
        soloTrackId: track.id,
        tail: 0,
        sampleRate: 22050,
      });
      const x = b.getChannelData(0).subarray(Math.round(from * 22050), Math.round(to * 22050));
      const ups: number[] = [];
      for (let i = 1; i < x.length; i++) if (x[i - 1] <= 0 && x[i] > 0) ups.push(i);
      return ((ups.length - 1) * 22050) / (ups[ups.length - 1] - ups[0]);
    },
    [bend, from, to] as const,
  );

test.describe("bends per note (D220–D225)", () => {
  test("a Rise renders an octave up; without it the note stays", async ({ page }) => {
    await openApp(page);
    const plain = await renderPitch(page, null, 0.5, 1);
    const risen = await renderPitch(
      page,
      { shape: "rise", amount: 12, time: 0.1, delay: 0, unit: "s" },
      0.5,
      1,
    );
    expect(plain).toBeGreaterThan(200);
    expect(plain).toBeLessThan(240);
    expect(risen / plain).toBeGreaterThan(1.9);
    expect(risen / plain).toBeLessThan(2.1);
  });

  test("the Bend card's bend is written with the note a MIDI key plays", async ({ page }) => {
    await midiKeyboard(page);
    await rb(page, async (r) => {
      const settings = await r.settings();
      const s = settings.getState();
      s.set({ playStyle: { ...s.playStyle, bend: { on: true, shape: "fall" } } });
      const st = r.store.getState();
      const bass = st.project.tracks.find((t: Any) => t.name === "Bass");
      st.setUi({ selectedTrackId: bass.id, cursor: { trackId: bass.id, index: 0 } });
    });
    await page.evaluate(() => (window as Any).__midi([0x90, 60, 100]));
    await page.waitForTimeout(100);
    await page.evaluate(() => (window as Any).__midi([0x80, 60, 0]));
    await expect
      .poll(() =>
        rb(page, (r) => {
          const st = r.store.getState();
          const bass = st.project.tracks.find((t: Any) => t.name === "Bass");
          const slot = st.project.slots.find((x: Any) => x.id === st.editSlotId);
          const notes = st.project.patterns[slot.patternId].lanes[bass.id].steps[0].notes ?? [];
          return notes.find((n: Any) => n.pitch === 60)?.bend?.shape;
        }),
      )
      .toBe("fall");
  });
});

/** Open the Bass's synth editor in its Advanced view. */
async function openAdvanced(page: Page) {
  await rb(page, (r) => {
    const s = r.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t: Any) => t.name === "Bass").id });
    r.commands()
      .find((c: Any) => c.id === "panel.synth-editor")
      .run();
  });
  const editor = page.getByTestId("synth-editor");
  const advanced = editor.getByTestId("synth-view").getByRole("button", { name: "Advanced" });
  if ((await advanced.getAttribute("data-active")) !== "true") await advanced.click();
  return editor;
}

const lanes = (page: Page) =>
  rb(page, (r) => (r.store.getState().project.automation ?? []).map((l: Any) => l.target));

test.describe("a synth's knobs and switches on the timeline (D226–D231)", () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test("Automate from a knob's and a switch's menu; the switch's lane is stepped, without eases", async ({
    page,
  }) => {
    const editor = await openAdvanced(page);
    // a knob: Filter 1's cutoff
    const filter = editor.locator('[data-section="Filter 1"]');
    await filter.scrollIntoViewIfNeeded();
    await filter
      .locator('[data-hint="synth.filters.cutoff"] svg')
      .first()
      .click({ button: "right" });
    await page.getByRole("button", { name: "Automate" }).click();
    await expect
      .poll(() => lanes(page))
      .toContainEqual(expect.stringMatching(/:synth:filters\.0\.cutoff$/));
    // Automate shows the timeline: back to the editor
    await openAdvanced(page);
    await filter.scrollIntoViewIfNeeded();
    // a switch: Filter 1's model
    await filter.locator('[data-switch="filters.0.model"]').click({ button: "right" });
    await page.getByRole("button", { name: "Automate" }).click();
    await expect
      .poll(() => lanes(page))
      .toContainEqual(expect.stringMatching(/:synth:filters\.0\.model$/));
    // both show their A in the editor
    await openAdvanced(page);
    await filter.scrollIntoViewIfNeeded();
    await expect(filter.getByTestId("automated-mark")).toHaveCount(2);

    // on the timeline: the switch's lane has bands with names, and its point no eases
    await rb(page, (r) =>
      r
        .commands()
        .find((c: Any) => c.id === "panel.timeline")
        .run(),
    );
    const stepped = page.locator('[data-testid="automation-lane"][data-steps="2"]');
    await expect(stepped).toHaveCount(1);
    await expect(stepped.getByTestId("step-label")).toHaveText(["Ladder", "SVF"]);
    await stepped.scrollIntoViewIfNeeded();
    // a click adds a point on a band; its menu has no eases
    const box = (await stepped.boundingBox())!;
    await page.mouse.click(box.x + 200, box.y + box.height * 0.3);
    await expect(stepped.getByTestId("lane-point")).toHaveCount(2);
    const values = await rb(page, (r) =>
      r.store
        .getState()
        .project.automation.find((l: Any) => l.target.endsWith("filters.0.model"))
        .points.map((x: Any) => x.value),
    );
    for (const v of values) expect([0, 1]).toContain(v);
    await stepped.getByTestId("lane-point").last().click({ button: "right" });
    await expect(page.getByText("Turn off")).toBeVisible();
    await expect(page.getByText(/Ease in/)).toHaveCount(0);
  });

  test("a synth knob's lane changes the export", async ({ page }) => {
    const render = (values: number[] | null) =>
      page.evaluate(async (values) => {
        const r = (window as Any).__rebeat;
        const project = JSON.parse(JSON.stringify(r.store.getState().project));
        const bass = project.tracks.find((t: Any) => t.name === "Bass");
        project.playMode = "song";
        // a section where the bass plays
        const slot = project.slots.find((s: Any) =>
          project.patterns[s.patternId].lanes[bass.id].steps.some((x: Any) => x.on),
        );
        project.slots = [slot];
        project.automation = values
          ? [
              {
                id: "cut",
                target: `track:${bass.id}:synth:output.volume`,
                on: true,
                points: values.map((value: number, i: number) => ({
                  slotId: project.slots[0].id,
                  at: i * 2,
                  value,
                })),
              },
            ]
          : [];
        const random = Math.random;
        let seed = 1;
        Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        try {
          const b: AudioBuffer = await r.renderProject(project, {
            range: "song",
            soloTrackId: bass.id,
            tail: 0,
            sampleRate: 22050,
          });
          const x = b.getChannelData(0).subarray(0, 22050 * 4);
          return Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
        } finally {
          Math.random = random;
        }
      }, values);
    // the synth's own volume, −40 dB and +6 dB, against no lane
    const quiet = await render([0, 0]);
    const loud = await render([1, 1]);
    const none = await render(null);
    expect(quiet).toBeLessThan(none / 10);
    expect(loud).toBeGreaterThan(none * 1.5);
  });
});

/** Two lanes on the first track, with three points each, and the timeline open. */
async function twoLanes(page: Page) {
  await rb(page, (r) => {
    const s = r.store.getState();
    s.commit((p: Any) => {
      const t = p.tracks[0];
      const slotId = p.slots[0].id;
      const pts = (vs: number[]) => vs.map((value, i) => ({ slotId, at: i + 0.5, value }));
      p.automation = [
        { id: "pan", target: `track:${t.id}:mix.pan`, on: true, points: pts([0.2, 0.5, 0.8]) },
        { id: "wid", target: `track:${t.id}:mix.width`, on: true, points: pts([0.8, 0.5, 0.2]) },
      ];
    });
    r.commands()
      .find((c: Any) => c.id === "panel.timeline")
      .run();
    r.settings().then((m: Any) => m.getState().set({ timelineZoom: 40 }));
  });
  await expect(page.getByTestId("automation-lane")).toHaveCount(2);
}

const pointsOf = (page: Page, id: string) =>
  page.evaluate(
    (id) =>
      (window as Any).__rebeat.store.getState().project.automation.find((l: Any) => l.id === id)
        .points as {
        at: number;
        value: number;
      }[],
    id,
  );

test.describe("folding lanes and moving many points (D233–D238)", () => {
  test.beforeEach(async ({ page }) => openApp(page));

  test("fold a lane, a track's lanes, all of them; they stay folded after a reload", async ({
    page,
  }) => {
    await twoLanes(page);
    await page.getByTestId("lane-fold").first().click();
    await expect(page.getByTestId("lane-folded")).toHaveCount(1);
    // the track's row hides both, with their count
    await page.getByTestId("owner-fold").first().click();
    await expect(page.getByTestId("automation-lane")).toHaveCount(0);
    await expect(page.getByTestId("owner-fold").first()).toContainText("2");
    await page.getByTestId("owner-fold").first().click();
    await expect(page.getByTestId("lane-folded")).toHaveCount(1);
    // Lanes ▾: unfold all, fold all
    await page.getByTestId("timeline-lanes").click();
    await page.getByRole("button", { name: "Unfold all lanes", exact: true }).click();
    await expect(page.getByTestId("lane-folded")).toHaveCount(0);
    await page.getByTestId("timeline-lanes").click();
    await page.getByRole("button", { name: "Fold all lanes", exact: true }).click();
    await expect(page.getByTestId("automation-lane")).toHaveCount(0);
    // not undo steps
    expect(await rb(page, (r) => r.store.getState().past.length)).toBe(1);
    // saved with the project
    await page.waitForTimeout(1500);
    await page.reload();
    await page.getByTestId("audio-overlay").click();
    await rb(page, (r) =>
      r
        .commands()
        .find((c: Any) => c.id === "panel.timeline")
        .run(),
    );
    await expect(page.getByTestId("owner-fold").first()).toContainText("2");
  });

  test("Follow the selected track opens only its lanes", async ({ page }) => {
    await twoLanes(page);
    await rb(page, (r) => {
      const s = r.store.getState();
      s.setUi({ selectedTrackId: s.project.tracks[1].id });
    });
    await page.getByTestId("timeline-lanes").click();
    await page.getByRole("button", { name: "Follow the selected track" }).click();
    await expect(page.getByTestId("automation-lane")).toHaveCount(0);
    await rb(page, (r) => {
      const s = r.store.getState();
      s.setUi({ selectedTrackId: s.project.tracks[0].id });
    });
    await expect(page.getByTestId("automation-lane")).toHaveCount(2);
  });

  test("a rectangle over two lanes selects in both; a drag moves them all; one undo", async ({
    page,
  }) => {
    await twoLanes(page);
    const [a, b] = await page.getByTestId("automation-lane").all();
    const ra = (await a.boundingBox())!;
    const rbx = (await b.boundingBox())!;
    const p0 = (await a.getByTestId("lane-point").nth(1).boundingBox())!;
    // from empty space left of the first points, down over both lanes, past the second points
    await page.mouse.move(ra.x + 2, ra.y + 2);
    await page.mouse.down();
    await page.mouse.move(p0.x + p0.width + 4, rbx.y + rbx.height - 2, { steps: 6 });
    await expect(page.getByTestId("selection-box")).toBeVisible();
    await page.mouse.up();
    const sel = await rb(page, (r) => r.store.getState().pointSelection.lanes);
    expect(sel.pan).toEqual([0, 1]);
    expect(sel.wid).toEqual([0, 1]);
    // drag the first lane's second point right by a beat: all four move
    const before = { pan: await pointsOf(page, "pan"), wid: await pointsOf(page, "wid") };
    const h = (await a.getByTestId("lane-point").nth(1).boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    // Alt: only in time
    await page.keyboard.down("Alt");
    await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2 + 10, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    const after = { pan: await pointsOf(page, "pan"), wid: await pointsOf(page, "wid") };
    const moved = after.pan[0].at - before.pan[0].at;
    expect(moved).toBeGreaterThan(0.4);
    expect(after.wid[0].at - before.wid[0].at).toBeCloseTo(moved, 5);
    expect(after.pan[1].at - before.pan[1].at).toBeCloseTo(moved, 5);
    // the third points didn't move, and nothing moved in value
    expect(after.pan[2].at).toBe(before.pan[2].at);
    expect(after.wid[0].value).toBeCloseTo(before.wid[0].value, 5);
    await rb(page, (r) => r.store.getState().undo());
    expect((await pointsOf(page, "pan"))[0].at).toBeCloseTo(before.pan[0].at, 5);
    expect((await pointsOf(page, "wid"))[1].at).toBeCloseTo(before.wid[1].at, 5);
  });

  test("Shift adds to the selection in another lane; Delete deletes in both", async ({ page }) => {
    await twoLanes(page);
    const [a, b] = await page.getByTestId("automation-lane").all();
    await a.getByTestId("lane-point").nth(0).click();
    await b
      .getByTestId("lane-point")
      .nth(2)
      .click({ modifiers: ["Shift"] });
    await page.keyboard.press("Delete");
    expect((await pointsOf(page, "pan")).length).toBe(2);
    expect((await pointsOf(page, "wid")).length).toBe(2);
  });
});
