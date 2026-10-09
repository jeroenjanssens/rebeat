import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

type P = {
  bpm: number;
  tracks: { id: string; name: string; mute: boolean; effects: object[] }[];
  slots: { id: string }[];
};
type W = {
  __rebeat: {
    examples: { id: string; create(): unknown }[];
    deserializeProject(d: unknown): P;
    renderProject(p: unknown, o: object): Promise<AudioBuffer>;
  };
};

test.beforeEach(async ({ page }) => openApp(page));

test("Pump ducks a held chord on every beat, in an offline render too (D104)", async ({ page }) => {
  test.setTimeout(120_000);
  const ratio = (pump: boolean) =>
    page.evaluate(async (pump) => {
      const r = (window as never as W).__rebeat;
      const e = r.examples.find((x) => x.id === "night-drive")!;
      const p = r.deserializeProject(JSON.parse(JSON.stringify(e.create())));
      const chords = p.tracks.find((t) => t.name === "Chords")!;
      // the dry chords alone, so the beats of the other tracks don't count
      chords.effects = pump
        ? [{ id: "fx-pump", name: "Pump", params: { rate: 0.5, depth: 1, release: 0.5, mix: 1 } }]
        : [];
      for (const t of p.tracks) t.mute = t !== chords;
      // the verse: a chord held for six steps from the start of the page
      const b = await r.renderProject(p, { range: "page", slotId: p.slots[1].id, tail: 0 });
      const d = b.getChannelData(0);
      const sr = b.sampleRate;
      const beat = 60 / p.bpm;
      const rms = (from: number, to: number) => {
        let s = 0;
        const a = Math.round(from * sr);
        const z = Math.round(to * sr);
        for (let i = a; i < z; i++) s += d[i] * d[i];
        return Math.sqrt(s / (z - a));
      };
      // the second beat of the held chord: just after it, and late in it
      return rms(beat + 0.015, beat + 0.04) / rms(beat + 0.6 * beat, beat + 0.8 * beat);
    }, pump);
  const steady = await ratio(false);
  const pumped = await ratio(true);
  expect(steady).toBeGreaterThan(0.7);
  expect(pumped).toBeLessThan(0.6 * steady);
});
