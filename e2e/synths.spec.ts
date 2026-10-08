import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

interface Level {
  id: string;
  peak: number;
  finite: boolean;
}

test("every factory synth plays through the AudioWorklet: audible, finite, no clipping", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openApp(page);
  const levels: Level[] = await page.evaluate(async () => {
    type Synth = { id: string; group: string; patch: { voice: { mode: string } } };
    const r = (
      window as never as {
        __rebeat: {
          synths: Synth[];
          renderPatch: (
            patch: unknown,
            notes: [number, number, number][],
            seconds: number,
          ) => Promise<AudioBuffer>;
        };
      }
    ).__rebeat;
    const out: Level[] = [];
    for (const s of r.synths) {
      const root = s.group === "Bass" ? 36 : 60;
      const notes: [number, number, number][] =
        s.patch.voice.mode !== "poly"
          ? [
              [root, 0.05, 0.4],
              [root + 7, 0.55, 1.2],
            ]
          : [
              [root, 0.05, 1],
              [root + 4, 0.05, 1],
              [root + 7, 0.05, 1],
            ];
      const buf = await r.renderPatch(s.patch, notes, 2);
      let peak = 0;
      let finite = true;
      for (let c = 0; c < buf.numberOfChannels; c++)
        for (const v of buf.getChannelData(c)) {
          if (!Number.isFinite(v)) finite = false;
          peak = Math.max(peak, Math.abs(v));
        }
      out.push({ id: s.id, peak, finite });
    }
    return out;
  });
  expect(levels).toHaveLength(37);
  for (const l of levels) {
    expect(l.finite, l.id).toBe(true);
    expect(l.peak, `${l.id} is silent`).toBeGreaterThan(0.03);
    expect(l.peak, `${l.id} clips`).toBeLessThan(1);
  }
});
