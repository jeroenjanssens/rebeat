/**
 * Golden levels: every example song and template renders offline, the mix and each track on its
 * own, and their levels must match the ones stored in `golden/<project>.json`. A safety net for changes that shouldn't
 * change how projects sound (the step tracks restructure, PLAN.md §0.6f). Projects go through
 * `deserializeProject`, the same path as loading a saved one.
 *
 * Update the stored levels (only when a change is meant to change the sound):
 *   GOLDEN_UPDATE=1 pnpm playwright test golden
 */
import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { openApp } from "./helpers";

const DIR = new URL("./golden/", import.meta.url);
const file = (key: string) => new URL(`${key.replace(":", "-")}.json`, DIR);
const UPDATE = !!process.env.GOLDEN_UPDATE;
/**
 * dB of difference allowed. Synth oscillators start at random phases inside the worklet (which has
 * its own Math.random), which moves a synth's peaks by up to about 2 dB; its RMS stays within a
 * fraction of that. RMS is the real check; peaks only catch gross changes (clipping, silence).
 */
const TOLERANCE = { rms: 0.75, peak: 3 };
/** Below this a render counts as silent (and is compared as such). */
const SILENT = -90;

interface Level {
  rms: number;
  peak: number;
}
interface Levels {
  mix: Level;
  tracks: Record<string, Level>;
}

test.beforeEach(async ({ page }) => {
  // the built-in kits are synthesized at startup from noise (and normalized to their peak), so a
  // seeded Math.random from the first line on makes them, and probability steps, the same on every
  // run; the synth worklet has its own (random oscillator phases), hence the tolerance
  await page.addInitScript(() => {
    let seed = 12345;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  });
  await openApp(page);
});

// one test per project: renders are slow, so they run in parallel
const projects = [
  ...[
    "night-drive",
    "blue-monday",
    "billie-jean",
    "planet-rock",
    "sweet-dreams",
    "neon-horizon",
    "hyperdrive",
    "liquid-ladder",
    "around-the-world",
  ].map((id) => `example:${id}`),
  // Late Night Café streams its sampled instruments, so it needs the network: left out
  ...["empty", "808", "loops"].map((id) => `template:${id}`),
];

for (const key of projects)
  test(`${key} sounds the same`, async ({ page }) => {
    // a whole song, once mixed and once per track; CI runners are several times slower
    test.setTimeout(process.env.CI ? 900_000 : 240_000);
    const levels: Levels = await page.evaluate(
      async ({ key, SILENT }) => {
        const r = (
          window as never as {
            __rebeat: {
              examples: { id: string; create(): unknown }[];
              templates: { id: string; create(): unknown }[];
              deserializeProject(d: unknown): { tracks: { id: string; name: string }[] };
              renderProject(p: unknown, o: object): Promise<AudioBuffer>;
            };
          }
        ).__rebeat;
        const [kind, id] = key.split(":");
        const list = kind === "example" ? r.examples : r.templates;
        const entry = list.find((e) => e.id === id);
        if (!entry) throw new Error(`no ${key}`);
        const project = r.deserializeProject(JSON.parse(JSON.stringify(entry.create())));
        // probability steps and random arpeggios: the same choices on every run
        const random = Math.random;
        const level = async (soloTrackId?: string) => {
          let seed = 12345;
          Math.random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 2 ** 32;
          };
          try {
            const b = await r.renderProject(project, {
              range: "song",
              soloTrackId,
              tail: 1,
              sampleRate: 22050,
            });
            let sum = 0;
            let peak = 0;
            for (let c = 0; c < b.numberOfChannels; c++)
              for (const x of b.getChannelData(c)) {
                sum += x * x;
                peak = Math.max(peak, Math.abs(x));
              }
            const db = (v: number) => Math.max(SILENT - 10, 20 * Math.log10(v));
            const round = (v: number) => Math.round(v * 100) / 100;
            return {
              rms: round(db(Math.sqrt(sum / (b.length * b.numberOfChannels)))),
              peak: round(db(peak)),
            };
          } finally {
            Math.random = random;
          }
        };
        const tracks: Record<string, { rms: number; peak: number }> = {};
        for (const [i, t] of project.tracks.entries())
          tracks[`${String(i + 1).padStart(2, "0")} ${t.name}`] = await level(t.id);
        return { mix: await level(), tracks };
      },
      { key, SILENT },
    );
    if (UPDATE) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file(key), JSON.stringify(levels, null, 2) + "\n");
      return;
    }
    expect(existsSync(file(key)), `no golden levels for ${key}: run with GOLDEN_UPDATE=1`).toBe(
      true,
    );
    const want: Levels = JSON.parse(readFileSync(file(key), "utf8"));
    const close = (got: Level, exp: Level, what: string) => {
      for (const k of ["rms", "peak"] as const) {
        if (exp[k] <= SILENT) expect(got[k], `${what} ${k} (silent)`).toBeLessThanOrEqual(SILENT);
        else
          expect(
            Math.abs(got[k] - exp[k]),
            `${what} ${k}: ${got[k]} vs ${exp[k]} dB`,
          ).toBeLessThanOrEqual(TOLERANCE[k]);
      }
    };
    expect(Object.keys(levels.tracks)).toEqual(Object.keys(want.tracks));
    close(levels.mix, want.mix, "mix");
    for (const [name, l] of Object.entries(levels.tracks)) close(l, want.tracks[name], name);
  });
