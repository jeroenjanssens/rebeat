/**
 * Every effect knob can be automated (D206, D207): the engine has an audio-time path for every
 * knob but the ones that rebuild an effect, and a lane changes what an export sounds like.
 */
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const rb = <T>(page: Page, fn: (r: Any) => T | Promise<T>) =>
  page.evaluate(`(${fn.toString()})(window.__rebeat)`) as Promise<T>;

test.beforeEach(async ({ page }) => openApp(page));

test("every effect knob has an audio-time path", async ({ page }) => {
  expect(await rb(page, (r) => r.missingAutomation())).toEqual([]);
});

/** The right side of the first two bars with an effect on track 1 and, maybe, a lane on one knob. */
const render = (page: Page, fx: string, param: string, values: number[] | null) =>
  page.evaluate(
    async ([fx, param, values]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = (window as any).__rebeat;
      const project = JSON.parse(JSON.stringify(r.store.getState().project));
      const track = project.tracks[0];
      const fxId = "fx-test";
      const defaults: Record<string, Record<string, number>> = {
        Tremolo: { rate: 0.5, depth: 1, spread: 0, mix: 1 },
        Chorus: { rate: 0.35, depth: 0.6, delay: 0.4, mix: 1 },
        Phaser: { rate: 0.3, octaves: 0.5, base: 0.4, q: 0.3, mix: 1 },
      };
      track.effects = [{ id: fxId, name: fx, params: defaults[fx as string], bypass: false }];
      project.playMode = "song";
      project.automation = values
        ? [
            {
              id: "lane",
              target: `track:${track.id}:fx:${fxId}:${param}`,
              on: true,
              points: (values as number[]).map((value, i) => ({
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
          soloTrackId: track.id,
          tail: 0,
          sampleRate: 22050,
        });
        // the right side: where a tremolo's spread and a chorus's swing show
        const n = Math.min(b.length, 22050 * 4);
        return Array.from(b.getChannelData(b.numberOfChannels - 1).subarray(0, n));
      } finally {
        Math.random = random;
      }
    },
    [fx, param, values] as const,
  );

for (const [fx, param, knob, moved] of [
  ["Tremolo", "spread", 0, [0, 1, 1, 1]],
  ["Chorus", "depth", 0.6, [0, 1, 0, 1]],
  ["Phaser", "octaves", 0.5, [0, 1, 0, 1]],
] as const)
  test(`${fx} ${param}: a flat lane at the knob sounds like no lane; a moving one doesn't`, async ({
    page,
  }) => {
    const plain = await render(page, fx, param, null);
    const flat = await render(page, fx, param, [knob, knob]);
    const moving = await render(page, fx, param, [...moved]);
    // how far a render is from the plain one, relative to the plain one's level
    const rms = (x: number[]) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    const apart = (x: number[]) => rms(x.map((v, i) => v - plain[i])) / rms(plain);
    expect(rms(plain)).toBeGreaterThan(0.001);
    expect(apart(flat)).toBeLessThan(0.01);
    expect(apart(moving)).toBeGreaterThan(0.1);
  });

test("the knob picker: search an effect's knob, then move the lane from the Inspector (D208)", async ({
  page,
}) => {
  await rb(page, (r) => {
    r.store.getState().commit((p: Any) => {
      p.tracks[0].effects = [
        {
          id: "fx-trem",
          name: "Tremolo",
          params: { rate: 0.5, depth: 0.6, spread: 0, mix: 1 },
          bypass: false,
        },
      ];
    });
    r.commands()
      .find((c: Any) => c.id === "layout.arrange")
      .run();
  });
  await page.getByTestId("timeline-automate").click();
  await expect(page.getByTestId("knob-picker")).toBeVisible();
  await page.getByTestId("knob-picker-search").fill("trem rate");
  await page.keyboard.press("Enter");
  const target = () => rb(page, (r) => r.store.getState().project.automation?.[0]?.target);
  await expect.poll(target).toMatch(/:fx:fx-trem:rate$/);

  // the lane's menu → Edit points in the Inspector → its knob → Spread
  await page.locator('[data-hint="timeline.lane.menu"]').first().click();
  await page.locator(".menu").getByRole("button", { name: "Edit points in the Inspector" }).click();
  await page.getByTestId("inspector-knob").click();
  const picker = page.getByTestId("knob-picker");
  // opened on the lane's track, with the Tremolo open: its knobs and its On
  await expect(picker.locator('[data-knob$=":fx:fx-trem:on"]')).toBeVisible();
  await picker.locator('[data-knob$=":fx:fx-trem:spread"]').click();
  await expect.poll(target).toMatch(/:fx:fx-trem:spread$/);
  await expect(page.getByTestId("inspector-knob")).toContainText("Tremolo Spread");
});
