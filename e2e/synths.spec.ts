import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

interface Level {
  id: string;
  peak: number;
  rms: number;
  finite: boolean;
  /** Fades in slowly: too quiet in a short render to compare. */
  slow: boolean;
}

test("every factory synth renders: not silent, not clipping, roughly balanced", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openApp(page);
  const levels: Level[] = await page.evaluate(async () => {
    type Synth = { id: string; group: string; patch: { mono: boolean; amp: { attack: number } } };
    const r = (
      window as never as {
        __rebeat: {
          synths: Synth[];
          patchSynth: (
            dest: { input: AudioNode },
            patch: unknown,
            bpm: number,
          ) => { play(n: unknown[], t: number, step: number): void };
        };
      }
    ).__rebeat;
    const out: Level[] = [];
    for (const s of r.synths) {
      const rate = 44100;
      const ctx = new OfflineAudioContext(2, rate * 3, rate);
      const g = ctx.createGain();
      g.connect(ctx.destination);
      const synth = r.patchSynth({ input: g }, s.patch, 120);
      const root = s.group === "Bass" ? 36 : 60;
      const note = (pitch: number, length = 2) => ({ pitch, length, velocity: 0.8 });
      // a short phrase in the instrument's range (a chord for poly sounds)
      const phrase = s.patch.mono
        ? [[note(root)], [note(root + 7)], [note(root + 12, 4)]]
        : [
            [note(root), note(root + 4), note(root + 7)],
            [note(root + 5, 4), note(root + 9, 4)],
          ];
      phrase.forEach((notes, i) => synth.play(notes, 0.05 + i * 0.5, 0.125));
      const buf = await ctx.startRendering();
      let peak = 0;
      let sum = 0;
      let finite = true;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const v = d[i];
          if (!Number.isFinite(v)) finite = false;
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
        }
      }
      // loudness over the part where it plays
      const rms = Math.sqrt(sum / (buf.numberOfChannels * rate * 1.6));
      out.push({ id: s.id, peak, rms, finite, slow: s.patch.amp.attack > 0.5 });
    }
    return out;
  });
  const db = (v: number) => Math.round(20 * Math.log10(Math.max(v, 1e-9)));
  console.log(
    levels.map((l) => `${l.id.padEnd(16)} peak ${db(l.peak)} dB  rms ${db(l.rms)} dB`).join("\n"),
  );
  for (const l of levels) {
    expect(l.finite, l.id).toBe(true);
    expect(db(l.peak), `${l.id} is silent`).toBeGreaterThan(-30);
    expect(db(l.peak), `${l.id} clips`).toBeLessThanOrEqual(0);
  }
  // balanced: every synth's loudness within 6 dB of the median
  const sorted = levels.map((l) => db(l.rms)).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (const l of levels.filter((x) => !x.slow))
    expect(Math.abs(db(l.rms) - median), l.id).toBeLessThanOrEqual(6);
});
