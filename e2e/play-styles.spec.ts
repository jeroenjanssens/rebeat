/**
 * E2E: the keys' play styles (PLAN-playstyles.md, D149–D154): what the arpeggiator and a strum
 * record (record the result), Latch, and the knobs and the Play row in the Controller panel.
 */
import { expect, test, type Page } from "@playwright/test";
import { midiDevices, midiKeyboard } from "./helpers";

type Note = { pitch: number; length: number; velocity: number; offset?: number };
type Project = {
  slots: { id: string; patternId: string }[];
  tracks: { id: string; mode: string; name: string }[];
  patterns: Record<
    string,
    { lanes: Record<string, { steps: { on?: boolean; notes?: Note[] }[] }> }
  >;
};
type W = {
  __midi(d: number[]): void;
  __midiFrom(name: string, d: number[]): void;
  __rebeat: {
    store: {
      getState(): {
        project: Project;
        playSlotId: string;
        playing: boolean;
        setUi(u: Record<string, unknown>): void;
        commit(fn: (p: Project) => void): void;
      };
    };
    commands(): { id: string; run(): void }[];
    settings(): Promise<{ getState(): { set(p: object): void; playStyle: unknown } }>;
  };
};

const midi = (page: Page, d: number[]) => page.evaluate((d) => (window as never as W).__midi(d), d);

/** The first Notes track, selected, its notes cleared, recording on and playing. */
async function recordOnNotesTrack(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    const t = s.project.tracks.find((x) => x.mode === "notes")!;
    s.commit((p) => {
      for (const pat of Object.values(p.patterns)) {
        const lane = pat.lanes[t.id];
        if (lane) for (const st of lane.steps) Object.assign(st, { on: false, notes: undefined });
      }
    });
    s.setUi({ recording: true, selectedTrackId: t.id });
    return t.id;
  });
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.evaluate(() => (window as never as W).__rebeat.store.getState().playing))
    .toBe(true);
  return id;
}

async function recorded(page: Page, trackId: string) {
  return page.evaluate((id) => {
    const s = (window as never as W).__rebeat.store.getState();
    const slot = s.project.slots.find((x) => x.id === s.playSlotId) ?? s.project.slots[0];
    const lane = s.project.patterns[slot.patternId].lanes[id];
    return lane.steps.map((st, i) => ({ i, notes: st.notes ?? [] })).filter((x) => x.notes.length);
  }, trackId);
}

async function setStyle(page: Page, playStyle: object, more: object = {}) {
  await page.evaluate(
    async ([playStyle, more]) =>
      (await (window as never as W).__rebeat.settings()).getState().set({ playStyle, ...more }),
    [playStyle, more] as const,
  );
}

test("the arpeggiator plays held keys one at a time and records each note (D151)", async ({
  page,
}) => {
  await midiKeyboard(page);
  await setStyle(page, { arp: { on: true, rate: "1/16", mode: "up" } });
  const trackId = await recordOnNotesTrack(page);
  for (const n of [60, 64, 67]) await midi(page, [0x90, n, 100]);
  await page.waitForTimeout(1200);
  for (const n of [60, 64, 67]) await midi(page, [0x80, n, 0]);
  await page.keyboard.press("Space");
  const steps = await recorded(page, trackId);
  // one note per step, on several steps, from the keys held
  expect(steps.length).toBeGreaterThanOrEqual(4);
  for (const s of steps) {
    expect(s.notes).toHaveLength(1);
    expect([60, 64, 67]).toContain(s.notes[0].pitch);
  }
  expect(new Set(steps.flatMap((s) => s.notes.map((n) => n.pitch))).size).toBe(3);
});

test("a strummed chord records its spread, kept with Snap on (D150)", async ({ page }) => {
  await midiKeyboard(page);
  await setStyle(
    page,
    { strum: { on: true, time: 0.09, direction: "up" } },
    { padMode: "chord", snap: true },
  );
  const trackId = await recordOnNotesTrack(page);
  await midi(page, [0x99, 38, 100]); // pad 3: Maj
  await midi(page, [0x90, 60, 100]);
  await page.waitForTimeout(500);
  await midi(page, [0x80, 60, 0]);
  await midi(page, [0x89, 38, 0]);
  await page.keyboard.press("Space");
  const notes = (await recorded(page, trackId)).flatMap((s) =>
    s.notes.map((n) => ({ ...n, at: s.i + (n.offset ?? 0) })),
  );
  const at = (p: number) => notes.find((n) => n.pitch === p)!.at;
  expect(notes.map((n) => n.pitch).sort()).toEqual([60, 64, 67]);
  // low to high, the top note about 90 ms after the root
  expect(at(64)).toBeGreaterThan(at(60));
  expect(at(67)).toBeGreaterThan(at(64));
});

test("Latch keeps the chord after the key is let go; knobs 3, 4, 7 set the styles (D151–D153)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "panel.controller")!
      .run(),
  );
  await page.getByTestId("controller-panel").waitFor();
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.mode === "notes")!.id });
  });
  const send = (d: number[]) =>
    page.evaluate((d) => (window as never as W).__midiFrom("Minilab3 MIDI", d), d);
  const line = page.getByTestId("controller-notes");

  // Latch: the note goes on after the key is up, until Latch goes off
  await page.getByTestId("play-latch").click();
  await expect(page.getByTestId("ml3-hold")).toHaveAttribute("data-lit", "true");
  await send([0x90, 60, 100]);
  await send([0x80, 60, 0]);
  await expect(line).toHaveText(/C\d/);
  await page.getByTestId("play-latch").click();
  await expect(line).not.toHaveText(/C\d/);

  // Chord mode: knob 3 (CC 76) all the way right is the longest strum, left is off
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  const strum = page.getByTestId("play-strum");
  await send([0xb0, 76, 127]);
  await expect(strum).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("strum-time-value")).toHaveText("250 ms");
  await send([0xb0, 76, 0]);
  await expect(strum).toHaveAttribute("aria-pressed", "false");
  // knob 4 (CC 77): the arp's rate; knob 7 (CC 19): a pattern
  await send([0xb0, 77, 127]);
  await expect(page.getByTestId("play-arp")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("arp-rate")).toContainText("1/32");
  await send([0xb0, 19, 127]);
  await expect(page.getByTestId("pattern-name")).toContainText("Travis picking");
  await send([0xb0, 19, 0]);
  await expect(page.getByTestId("play-pattern")).toHaveAttribute("aria-pressed", "false");
  await send([0xb0, 77, 0]);
  await expect(page.getByTestId("play-arp")).toHaveAttribute("aria-pressed", "false");
});

test("the keys light up as their notes sound: a strum one by one, an arpeggio a step at a time (D156)", async ({
  page,
}) => {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "panel.controller")!
      .run(),
  );
  await page.getByTestId("controller-panel").waitFor();
  await page.evaluate(() => {
    const s = (window as never as W).__rebeat.store.getState();
    s.setUi({ selectedTrackId: s.project.tracks.find((t) => t.mode === "notes")!.id });
  });
  const send = (d: number[]) =>
    page.evaluate((d) => (window as never as W).__midiFrom("Minilab3 MIDI", d), d);
  // record when each key starts sounding, and how many sound at once
  await page.evaluate(() => {
    const w = window as never as { __lit: { key: string; at: number }[]; __most: number };
    w.__lit = [];
    w.__most = 0;
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as SVGElement;
        if (el.dataset.sounding === "true" && m.oldValue !== "true")
          w.__lit.push({ key: el.dataset.key!, at: performance.now() });
      }
      w.__most = Math.max(
        w.__most,
        document.querySelectorAll('[data-key][data-sounding="true"]').length,
      );
    }).observe(document.querySelector('[aria-label="MiniLab 3 controller"]')!, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-sounding"],
      attributeOldValue: true,
    });
  });
  const lit = () =>
    page.evaluate(() => (window as never as { __lit: { key: string; at: number }[] }).__lit);

  // a slow strum on a C major chord (Chord mode, pad 3 = Maj): C, then E, then G
  await page.getByTestId("pad-mode").getByRole("button", { name: "Chord" }).click();
  await setStyle(page, { strum: { on: true, time: 0.25, direction: "up" } }, { padMode: "chord" });
  await send([0x99, 38, 100]);
  await send([0x90, 60, 100]);
  await expect.poll(async () => (await lit()).length).toBeGreaterThanOrEqual(3);
  const strum = await lit();
  const order = strum.map((l) => Number(l.key));
  expect(order.slice(0, 3)).toEqual([...order.slice(0, 3)].sort((a, b) => a - b));
  expect(strum[2].at - strum[0].at).toBeGreaterThan(120);
  await send([0x80, 60, 0]);
  await send([0x89, 38, 0]);
  await expect(page.locator('[data-key][data-sounding="true"]')).toHaveCount(0);

  // the arpeggiator over three held keys: one key lit at a time
  await page.getByTestId("pad-mode").getByRole("button", { name: "Drum" }).click();
  await setStyle(page, { arp: { on: true, rate: "1/8", gate: 0.6 } }, { padMode: "drum" });
  await page.evaluate(() => ((window as never as { __most: number }).__most = 0));
  for (const n of [60, 64, 67]) await send([0x90, n, 100]);
  await page.waitForTimeout(1200);
  for (const n of [60, 64, 67]) await send([0x80, n, 0]);
  expect(await page.evaluate(() => (window as never as { __most: number }).__most)).toBe(1);
  expect(new Set((await lit()).slice(3).map((l) => l.key)).size).toBe(3);
});

/** The Controller panel in Next mode on the Royal road in C major, the keys on a Notes track. */
async function autoSetup(page: Page, more: object = {}) {
  await midiDevices(page, ["Minilab3 MIDI"]);
  await page.getByTestId("midi-use-detected").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .find((c) => c.id === "panel.controller")!
      .run(),
  );
  await page.getByTestId("controller-panel").waitFor();
  const trackId = await page.evaluate(async (more) => {
    const r = (window as never as W).__rebeat;
    const s = r.store.getState();
    const t = s.project.tracks.find((x) => x.mode === "notes")!;
    s.setUi({ selectedTrackId: t.id });
    (await r.settings()).getState().set({
      keyModeKey: { root: 0, scale: "major" },
      padMode: "next",
      nextProgression: "royalroad",
      autoEvery: 1,
      ...more,
    });
    return t.id;
  }, more);
  return trackId;
}

test("Auto walks the progression by itself and stops (D162)", async ({ page }) => {
  await autoSetup(page, { autoSync: false });
  await page.evaluate(() => {
    (window as never as W).__rebeat.store
      .getState()
      .commit((p) => void ((p as unknown as { bpm: number }).bpm = 240));
  });
  const line = page.getByTestId("controller-notes");
  await page.getByTestId("auto").click();
  await expect(page.getByTestId("auto")).toHaveText(/Stop/);
  for (const chord of [/=\s*F$/, /=\s*G$/, /=\s*Em$/, /=\s*Am$/])
    await expect(line).toHaveText(chord, { timeout: 4000 });
  await page.getByTestId("auto").click();
  await expect(page.getByTestId("auto")).toHaveText(/Auto/);
  await expect(page.locator('[data-key][data-sounding="true"]')).toHaveCount(0);
});

test("Auto armed starts with Play after the count-in and records a chord per bar (D163)", async ({
  page,
}) => {
  const trackId = await autoSetup(page, { autoSync: true, countInBars: 1, snap: true });
  // a four-bar page, its Notes lane empty, a count-in, a fast tempo
  await page.evaluate((id) => {
    const s = (window as never as W).__rebeat.store.getState();
    s.commit((p) => {
      const pp = p as unknown as { bpm: number; countIn: boolean; playMode: string };
      pp.bpm = 200;
      pp.countIn = true;
      pp.playMode = "loop";
      for (const pat of Object.values(p.patterns)) {
        (pat as unknown as { stepCount: number; stepSize: string }).stepCount = 64;
        (pat as unknown as { stepSize: string }).stepSize = "1/16";
        const lane = pat.lanes[id];
        if (lane) for (const st of lane.steps) Object.assign(st, { on: false, notes: undefined });
      }
    });
    s.setUi({ recording: true });
  }, trackId);
  await page.getByTestId("auto").click();
  await expect(page.getByTestId("auto")).toHaveAttribute("data-armed", "true");
  await page.keyboard.press("Space");
  // four bars at 200 bpm: 4.8 s after the count-in (1.2 s)
  await page.waitForTimeout(6500);
  await page.keyboard.press("Space");
  const steps = await recorded(page, trackId);
  // a chord per bar, nothing else (the first one not twice, D164)
  expect(steps.map((x) => x.i)).toEqual([0, 16, 32, 48]);
  const at = (step: number) =>
    steps
      .find((s) => s.i === step)
      ?.notes.map((n) => n.pitch % 12)
      .sort((a, b) => a - b);
  expect(at(0)).toEqual([0, 5, 9]); // F A C
  expect(at(16)).toEqual([2, 7, 11]); // G B D
  expect(at(32)).toEqual([4, 7, 11]); // E G B
  expect(at(48)).toEqual([0, 4, 9]); // A C E
  // stopped with the song: armed again for the next take
  await expect(page.getByTestId("auto")).toHaveAttribute("data-armed", "true");
});

test("room for a take: Fit the page, or in song mode Add pages and record a chord per page (D163, D164)", async ({
  page,
}) => {
  const trackId = await autoSetup(page, { autoSync: true, snap: true });
  // one one-bar page, its Notes lane empty, no count-in, a fast tempo
  const reset = (mode: string) =>
    page.evaluate(
      ([id, mode]) => {
        const s = (window as never as W).__rebeat.store.getState();
        s.commit((p) => {
          const pp = p as unknown as {
            bpm: number;
            countIn: boolean;
            playMode: string;
            slots: { id: string; patternId: string; repeats: number }[];
          };
          pp.bpm = 200;
          pp.countIn = false;
          pp.playMode = mode;
          pp.slots = [{ ...pp.slots[0], repeats: 1 }];
          const pat = p.patterns[pp.slots[0].patternId] as unknown as {
            stepCount: number;
            stepSize: string;
            lanes: Record<string, { steps: object[] }>;
          };
          pat.stepCount = 16;
          pat.stepSize = "1/16";
          for (const st of pat.lanes[id].steps) Object.assign(st, { on: false, notes: undefined });
        });
        s.setUi({ editSlotId: (s.project as unknown as { slots: { id: string }[] }).slots[0].id });
      },
      [trackId, mode] as const,
    );
  await reset("loop");
  const room = page.getByTestId("take-room");
  await expect(room).toContainText("Takes 4 bars; the page has 1 bar");
  await page.getByTestId("fit-page").click();
  await expect(room).toHaveCount(0);

  // song mode: add the pages, then record across them
  await reset("song");
  await expect(room).toContainText("the song has 1 bar from here");
  await page.getByTestId("add-pages").click();
  await expect(room).toHaveCount(0);
  await page.evaluate(() =>
    (window as never as W).__rebeat.store.getState().setUi({ recording: true }),
  );
  await page.getByTestId("auto").click();
  await page.keyboard.press("Space");
  await page.waitForTimeout(5600);
  await page.keyboard.press("Space");
  const perPage = await page.evaluate((id) => {
    const s = (window as never as W).__rebeat.store.getState();
    return s.project.slots.map((sl) =>
      s.project.patterns[sl.patternId].lanes[id].steps
        .map((st, i) => ({
          i,
          pcs: (st.notes ?? []).map((n) => n.pitch % 12).sort((a, b) => a - b),
        }))
        .filter((x) => x.pcs.length),
    );
  }, trackId);
  expect(perPage.map((p) => p.map((x) => x.i))).toEqual([[0], [0], [0], [0]]);
  expect(perPage.map((p) => p[0].pcs)).toEqual([
    [0, 5, 9],
    [2, 7, 11],
    [4, 7, 11],
    [0, 4, 9],
  ]);
});
