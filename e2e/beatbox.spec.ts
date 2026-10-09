import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { fixtureFiles, oneShot, wav } from "./fixtures";
import { openApp } from "./helpers";

const RATE = 44100;

/** A noise burst with a fast decay (a hat-like click), or a low thump (a kick-like one). */
function hit(out: Float32Array, at: number, kind: "low" | "noise", gain = 0.8) {
  const a = Math.round(at * RATE);
  let seed = Math.round(at * 1000) + 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const n = Math.round(RATE * (kind === "low" ? 0.18 : 0.06));
  for (let i = 0; i < n && a + i < out.length; i++) {
    const env = Math.exp(-i / (RATE * (kind === "low" ? 0.05 : 0.012)));
    out[a + i] += gain * env * (kind === "low" ? Math.sin((2 * Math.PI * 70 * i) / RATE) : rnd());
  }
}

/** Two bars at 120 BPM: a low hit on every beat, a noise hit on every offbeat 8th. */
function take(bars = 2) {
  const beat = 0.5;
  const out = new Float32Array(Math.round((bars * 4 * beat + 0.4) * RATE));
  for (let b = 0; b < bars * 4; b++) {
    hit(out, 0.1 + b * beat, "low");
    hit(out, 0.1 + b * beat + beat / 2, "noise", 0.5);
  }
  return out;
}

async function openBeatbox(page: Page) {
  await page.evaluate(() => {
    const r = (window as never as { __rebeat: { commands(): { id: string; run(): void }[] } })
      .__rebeat;
    r.commands()
      .find((c) => c.id === "panel.beatbox")!
      .run();
  });
  await expect(page.getByTestId("beatbox")).toBeVisible();
}

async function addFiles(page: Page, files: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("beatbox-add").click();
  await page
    .locator(".menu")
    .getByRole("button", { name: /Audio files/ })
    .click();
  await (await chooser).setFiles(files);
}

const modelReady = (page: Page) =>
  expect(page.locator('[data-testid="beatbox-model-status"][data-status="ready"]')).toBeVisible({
    timeout: 30_000,
  });

test("the model downloads only when the Beatbox panel is used, and classifies hits", async ({
  page,
}) => {
  const fetched: string[] = [];
  page.on("request", (r) => {
    if (/model\.onnx|ort-wasm/.test(r.url())) fetched.push(r.url());
  });
  await openApp(page);
  await page.waitForTimeout(500);
  expect(fetched).toEqual([]);
  await openBeatbox(page);
  await modelReady(page);
  expect(fetched.some((u) => u.includes("model.onnx"))).toBe(true);
  expect(fetched.some((u) => u.includes("ort-wasm"))).toBe(true);

  await addFiles(page, fixtureFiles({ "Groove.wav": wav(take()) }));
  await expect(page.locator("[data-recording='Groove']")).toBeVisible();
  // every hit gets the model's guess, shown in the list with its confidence
  await page
    .getByTestId("beatbox-recording")
    .getByRole("button", { name: "Hits", exact: true })
    .click();
  const rows = page.getByTestId("beatbox-hits").locator("tbody tr");
  await expect(rows).toHaveCount(16);
  await expect(rows.first()).toContainText("%");
});

test("adds labeled files, then labels, relabels, trims, adds and removes hits", async ({
  page,
}) => {
  await openApp(page);
  await openBeatbox(page);
  await addFiles(
    page,
    fixtureFiles({ "kick1.wav": wav(oneShot(60, 0.4)), "Groove.wav": wav(take()) }),
  );
  // a file named after a class is single sounds, labeled
  const kick = page.locator("[data-recording='kick1']");
  await expect(kick).toContainText("Kick 1");

  await page.locator("[data-recording='Groove']").click();
  const view = page.getByTestId("beatbox-recording");
  await view.getByRole("button", { name: "Hits", exact: true }).click();
  const rows = page.getByTestId("beatbox-hits").locator("tbody tr");
  await expect(rows).toHaveCount(16);

  // label the first hit Kick (1), relabel it Snare (2)
  await rows.nth(0).click();
  await page.keyboard.press("1");
  await expect(rows.nth(0)).toContainText("Kick");
  await page.keyboard.press("2");
  await expect(rows.nth(0)).toContainText("Snare");
  await expect(page.getByTestId("beatbox-selection")).toContainText("yours: Snare");

  // several at once: shift-click, then Closed hi-hat (3)
  await rows.nth(1).click();
  await rows.nth(3).click({ modifiers: ["Shift"] });
  await page.keyboard.press("3");
  await expect(rows.nth(1)).toContainText("Closed hi-hat");
  await expect(rows.nth(3)).toContainText("Closed hi-hat");

  // remove one
  await rows.nth(5).click();
  await page.keyboard.press("Delete");
  await expect(rows).toHaveCount(15);

  // trim: drag the first hit's end edge to the left
  const wave = page.getByTestId("beatbox-wave");
  const box = (await wave.boundingBox())!;
  const dur = 4.4;
  const end0 = await page.evaluate(async () => {
    const m = await (
      window as never as {
        __rebeat: {
          beatbox(): Promise<{
            useBeatbox: { getState(): { hits: { start: number; end: number }[] } };
          }>;
        };
      }
    ).__rebeat.beatbox();
    return [...m.useBeatbox.getState().hits].sort((a, b) => a.start - b.start)[1].end;
  });
  const x = (t: number) => box.x + (t / dur) * box.width;
  await page.mouse.move(x(end0), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x(end0 - 0.08), box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const m = await (
          window as never as {
            __rebeat: {
              beatbox(): Promise<{
                useBeatbox: { getState(): { hits: { start: number; end: number }[] } };
              }>;
            };
          }
        ).__rebeat.beatbox();
        return [...m.useBeatbox.getState().hits].sort((a, b) => a.start - b.start)[1].end;
      }),
    )
    .toBeLessThan(end0 - 0.05);

  // add a hit by dragging over empty space at the end
  await page.mouse.move(x(4.25), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x(4.38), box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(rows).toHaveCount(16);

  // labels survive a reload (IndexedDB)
  await page.reload();
  await page.getByTestId("audio-overlay").click();
  await openBeatbox(page);
  await page.locator("[data-recording='Groove']").click();
  await page
    .getByTestId("beatbox-recording")
    .getByRole("button", { name: "Hits", exact: true })
    .click();
  await expect(page.getByTestId("beatbox-hits").locator("tbody tr").first()).toContainText("Snare");
});

test("records single sounds from the microphone, labeled with their class", async ({ page }) => {
  await page.addInitScript(() => {
    // after openApp's script: bursts that start and fade, like beatboxed hits
    setTimeout(() => ((window as { __REBEAT_TEST_MIC__?: unknown }).__REBEAT_TEST_MIC__ = "beats"));
  });
  await openApp(page);
  await openBeatbox(page);
  await page.getByTestId("beatbox-record").click();
  await page.getByTestId("beatbox-record-class-snare").click();
  await page.getByTestId("beatbox-record-count").selectOption("4");
  await page.getByTestId("beatbox-record-start").click();
  await expect(page.getByTestId("beatbox-session")).toBeVisible();
  await expect(page.getByTestId("beatbox-session")).toBeHidden({ timeout: 15_000 });
  const rec = page.locator("[data-recording='Snare ×4']");
  await expect(rec).toBeVisible();
  // the test microphone beeps twice a second: every beep is a hit, labeled Snare
  await expect(rec).toContainText(/Snare [2-9]/);
});

test("converts a take into step tracks, with options, and undoes it", async ({ page }) => {
  await openApp(page);
  await openBeatbox(page);
  await addFiles(page, fixtureFiles({ "Groove.wav": wav(take()) }));
  await page.locator("[data-recording='Groove']").click();
  // label: the low hits Kick, the noise hits Closed hi-hat
  await page.evaluate(async () => {
    const m = (await (
      window as never as { __rebeat: { beatbox(): Promise<unknown> } }
    ).__rebeat.beatbox()) as {
      useBeatbox: { getState(): { hits: { id: string; start: number }[] } };
      labelHits(ids: string[], c: string): Promise<void>;
    };
    const hits = [...m.useBeatbox.getState().hits].sort((a, b) => a.start - b.start);
    await m.labelHits(
      hits.filter((_, i) => i % 2 === 0).map((h) => h.id),
      "kick",
    );
    await m.labelHits(
      hits.filter((_, i) => i % 2 === 1).map((h) => h.id),
      "hihat",
    );
  });
  const convert = page.getByTestId("beatbox-convert");
  await expect(convert).toBeVisible();
  // a free take: the tempo comes from the hits (120 BPM), and two bars fold into one
  await expect(convert).toContainText("120.0 BPM");
  await expect(page.getByTestId("beatbox-convert-summary")).toContainText("2× played");
  await page.getByTestId("beatbox-sound-kick").selectOption("kit");
  await page.getByTestId("beatbox-velocity-constant").click();

  const before = await page.evaluate(
    () =>
      (
        window as never as {
          __rebeat: { store: { getState(): { project: { tracks: unknown[] } } } };
        }
      ).__rebeat.store.getState().project.tracks.length,
  );
  await page.getByTestId("beatbox-create").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as never as {
              __rebeat: { store: { getState(): { project: { tracks: unknown[] } } } };
            }
          ).__rebeat.store.getState().project.tracks.length,
      ),
    )
    .toBe(before + 2);
  const steps = await page.evaluate(() => {
    const s = (
      window as never as {
        __rebeat: {
          store: {
            getState(): {
              editSlotId: string;
              project: {
                tracks: { id: string; name: string; sound?: { sampleId?: string } }[];
                slots: { id: string; patternId: string }[];
                patterns: Record<
                  string,
                  {
                    lanes: Record<
                      string,
                      { steps: { on: boolean; velocity: number }[]; stepCountOverride?: number }
                    >;
                  }
                >;
              };
            };
          };
        };
      }
    ).__rebeat.store.getState();
    const pat = s.project.patterns[s.project.slots.find((x) => x.id === s.editSlotId)!.patternId];
    const [kick, hat] = s.project.tracks.slice(-2);
    const on = (id: string) =>
      pat.lanes[id].steps.slice(0, 16).flatMap((st, i) => (st.on ? [i] : []));
    return {
      kick: on(kick.id),
      hat: on(hat.id),
      kickSound: kick.sound?.sampleId,
      hatSound: hat.sound?.sampleId,
      velocity: pat.lanes[kick.id].steps[0].velocity,
    };
  });
  expect(steps.kick).toEqual([0, 4, 8, 12]);
  expect(steps.hat).toEqual([2, 6, 10, 14]);
  expect(steps.kickSound).toBe("kit:808:kick");
  // the hat plays your own hit, cut from the take into the library
  expect(steps.hatSound).toMatch(/^[0-9a-f]{64}/);
  expect(steps.velocity).toBe(0.8);

  // the new tracks are audible
  await page.keyboard.press("Space");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as never as { __rebeat: { engine: { masterLevel(): number[] } } }
            ).__rebeat.engine.masterLevel()[0],
        ),
      { timeout: 8000 },
    )
    .toBeGreaterThan(0.02);
  await page.keyboard.press("Space");

  // one undo step takes it all back
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as never as {
              __rebeat: { store: { getState(): { project: { tracks: unknown[] } } } };
            }
          ).__rebeat.store.getState().project.tracks.length,
      ),
    )
    .toBe(before);
});

test("exports a dataset in the ml/ format and imports it again", async ({ page }) => {
  await openApp(page);
  await openBeatbox(page);
  await addFiles(page, fixtureFiles({ "kick1.wav": wav(oneShot(60, 0.4)) }));
  await expect(page.locator("[data-recording='kick1']")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByTestId("beatbox-menu").click();
  await page
    .locator(".menu")
    .getByRole("button", { name: /Export “Me”/ })
    .click();
  const file = await (await download).path();
  const zip = unzipSync(new Uint8Array(readFileSync(file)));
  const csv = strFromU8(zip["hits.csv"]);
  expect(csv.split("\n")[0]).toBe("file,start,end,label,voice");
  expect(csv).toContain("kick1.wav");
  expect(csv).toMatch(/,kick,Me/);
  expect(zip["kick1.wav"]).toBeDefined();

  // importing it adds the recording again, with its labels
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("beatbox-menu").click();
  await page.locator(".menu").getByRole("button", { name: "Import a dataset…" }).click();
  await (await chooser).setFiles(file);
  await expect(page.locator("[data-recording='kick1']")).toHaveCount(2);
});

test("the Model view counts your examples and says what to record", async ({ page }) => {
  await openApp(page);
  await openBeatbox(page);
  await modelReady(page);
  await addFiles(page, fixtureFiles({ "kick1.wav": wav(oneShot(60, 0.4)) }));
  await expect(page.locator("[data-recording='kick1']")).toBeVisible();
  await page.getByTestId("beatbox-model-view").click();
  const model = page.getByTestId("beatbox-model");
  await expect(model).toContainText("Version 1");
  await expect(page.getByTestId("beatbox-class-table")).toContainText("Kick");
  await expect(page.getByTestId("beatbox-advice")).toContainText("9 kicks");
});
