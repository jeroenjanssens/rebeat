import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

type W = {
  __rebeat: { commands: () => { id: string; run(): void }[] };
};

test.beforeEach(async ({ page }) => openApp(page));

test("every theme applies and the canvases draw in it (D102)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ids = await page.evaluate(() =>
    (window as never as W).__rebeat
      .commands()
      .filter((c) => c.id.startsWith("theme.") && c.id !== "theme.system")
      .map((c) => c.id.slice(6)),
  );
  expect(ids).toHaveLength(20);
  for (const id of ids) {
    await page.evaluate(
      (id) =>
        (window as never as W).__rebeat
          .commands()
          .find((c) => c.id === `theme.${id}`)!
          .run(),
      id,
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    // the page strip's thumbnails are drawn from the theme's tokens
    const drawn = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-panel="drum-machine"] canvas');
      if (!c) return false;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
      return false;
    });
    expect(drawn, id).toBe(true);
  }
  expect(errors).toEqual([]);
});
