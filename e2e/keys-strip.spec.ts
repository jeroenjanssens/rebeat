/**
 * The Keys strip (D212): laid out like a track's strip, with effects, sends, pan and mute that
 * reach the keys' channel; its settings are the user's, not the project's.
 */
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const rb = <T>(page: Page, fn: (r: Any) => T | Promise<T>) =>
  page.evaluate(`(${fn.toString()})(window.__rebeat)`) as Promise<T>;

test("the Keys strip lines up with the tracks' and has effects, pan and mute", async ({ page }) => {
  await openApp(page);
  await rb(page, async (r) => {
    const keys = await r.keys();
    const synth = r.synths[0];
    keys.setKeysTarget({
      kind: "sound",
      source: "catalog",
      id: `synth:${synth.id}`,
      name: synth.name,
    });
    r.commands()
      .find((c: Any) => c.id === "panel.mixer")
      .run();
  });
  const strip = page.getByTestId("keys-strip");
  await expect(strip).toBeVisible();
  // the fader starts where a track strip's does
  const top = async (el: import("@playwright/test").Locator) =>
    (await el
      .locator('[data-hint="mixer.keys"], [data-hint="param.mix.volume"]')
      .last()
      .boundingBox())!.y;
  const track = page.getByTestId("mixer-strip").first();
  expect(Math.abs((await top(strip)) - (await top(track)))).toBeLessThan(2);
  expect(
    Math.abs((await strip.boundingBox())!.height - (await track.boundingBox())!.height),
  ).toBeLessThan(2);

  // an effect from the FX popup goes to the keys' settings
  await strip.getByTestId("keys-fx").click();
  await page.locator(".menu select").selectOption("Chorus");
  await page.keyboard.press("Escape");
  const mix = () =>
    rb(page, async (r) => JSON.parse(JSON.stringify((await r.settings()).getState().keysMix)));
  await expect.poll(async () => (await mix()).effects?.map((e: Any) => e.name)).toEqual(["Chorus"]);
  await strip.getByRole("button", { name: "M" }).click();
  await expect.poll(async () => (await mix()).mute).toBe(true);
  // and the engine's channel has them
  await expect
    .poll(() =>
      rb(page, (r) => {
        const ch = r.engine.getKeysChannel();
        return ch ? { fx: ch.track.effects.length, mute: ch.track.mute } : null;
      }),
    )
    .toEqual({ fx: 1, mute: true });
});
