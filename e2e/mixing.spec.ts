import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

/** Feed a 1 kHz sine into a fresh channel strip; returns the left/right output level in dB. */
async function stripLevels(page: import("@playwright/test").Page, setup: string, freq = 1000) {
  return page.evaluate(
    async ([setup, freq]) => {
      const imp = (p: string) => import(/* @vite-ignore */ p);
      const { TrackChannel } = await imp("/src/engine/channel.ts");
      const { makeTrack } = await imp("/src/model/project.ts");
      const { makeEffect } = await imp("/src/model/effects.ts");
      const { audioContext } = await imp("/src/engine/context.ts");
      const ctx: AudioContext = audioContext();
      const sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination);
      const ch = new TrackChannel(sink);
      const track = makeTrack("drum", "perc", "t", "t");
      new Function("track", "makeEffect", setup)(track, makeEffect);
      ch.update(track, true, 120);
      const split = ctx.createChannelSplitter(2);
      ch.output.connect(split);
      const probes = [0, 1].map((c) => {
        const a = ctx.createAnalyser();
        a.fftSize = 4096;
        split.connect(a, c);
        return a;
      });
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      osc.connect(g).connect(ch.input.input);
      osc.start();
      await new Promise((r) => setTimeout(r, 400));
      const levels = probes.map((a) => {
        const b = new Float32Array(4096);
        a.getFloatTimeDomainData(b);
        let p = 0;
        for (const v of b) p = Math.max(p, Math.abs(v));
        return Math.round(20 * Math.log10(p / 0.25) * 10) / 10;
      });
      osc.stop();
      ch.dispose();
      return levels;
    },
    [setup, freq] as const,
  );
}

test("a mono sound comes out centered with an equal-power pan law (no level lost)", async ({
  page,
}) => {
  expect(await stripLevels(page, "")).toEqual([-3, -3]);
  expect(await stripLevels(page, 'track.params["mix.pan"] = 0;')).toEqual([0, -Infinity]);
});

test("the channel EQ is flat at 0 dB", async ({ page }) => {
  // the old crossover EQ cut 17 dB at its crossover points, 400 Hz and 2.5 kHz
  for (const f of [400, 2500]) expect(await stripLevels(page, "", f)).toEqual([-3, -3]);
});

test("effects on a track change its sound: distortion at zero drive is clean gain", async ({
  page,
}) => {
  const levels = await stripLevels(
    page,
    'track.effects = [makeEffect("Distortion", { drive: 0, tone: 1, output: 0.75 })];',
  );
  expect(levels[0]).toBeCloseTo(3, 0); // −3 dB pan law + 6 dB output
});
