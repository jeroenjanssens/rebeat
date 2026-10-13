/**
 * Editing automation as a table in the Inspector (D196–D204): it edits the same points as the
 * lane on the timeline, and shares their selection.
 */
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

// the debug handle is loosely typed here: these tests poke at many parts of it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const rb = <T>(page: Page, fn: (r: Any) => T | Promise<T>) =>
  page.evaluate(`(${fn.toString()})(window.__rebeat)`) as Promise<T>;

const points = (page: Page) =>
  rb(page, (r) => JSON.parse(JSON.stringify(r.store.getState().project.automation[0].points)));

test.beforeEach(async ({ page }) => {
  await openApp(page);
  // a master level lane with three points over the first sections
  await rb(page, (r) =>
    r.store.getState().commit((p: Any) => {
      p.automation = [
        {
          id: "lane",
          target: "master:volume",
          on: true,
          points: [
            { slotId: p.slots[0].id, at: 0, value: 0.2 },
            { slotId: p.slots[1].id, at: 0, value: 0.8 },
            { slotId: p.slots[2].id, at: 0, value: 0.4 },
          ],
        },
      ];
    }),
  );
  await rb(page, (r) =>
    r
      .commands()
      .find((c: Any) => c.id === "layout.arrange")
      .run(),
  );
  await page.getByTestId("timeline").waitFor();
});

async function openInspector(page: Page) {
  await page.locator('[data-hint="timeline.lane.menu"]').first().click();
  await page.locator(".menu").getByRole("button", { name: "Edit points in the Inspector" }).click();
  await expect(page.getByTestId("automation-inspector")).toBeVisible();
}

test("the lane's menu opens its points as a table; typing moves the point on the lane", async ({
  page,
}) => {
  await openInspector(page);
  const rows = page.getByTestId("point-row");
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("automation-inspector")).toContainText("Master · Level");

  // type a position: the second point moves to bar 2, beat 3
  await rows.nth(1).getByTestId("point-position").click();
  await page.getByTestId("point-position-input").fill("2.3.1");
  await page.keyboard.press("Enter");
  await expect(rows.nth(1).getByTestId("point-position")).toHaveText("2.3.1");

  // type a value: 50%
  await rows.nth(1).getByTestId("point-value").click();
  await page.getByTestId("point-value-input").fill("50%");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await points(page))[1].value).toBe(0.5);
});

test("insert between two points lands halfway, on the curve; off points are skipped", async ({
  page,
}) => {
  await openInspector(page);
  const rows = page.getByTestId("point-row");
  await rows.nth(1).hover();
  await rows.nth(1).getByTestId("insert-between").click();
  await expect(rows).toHaveCount(4);
  const pts = await points(page);
  // halfway between 0.2 and 0.8 on a straight line: 0.5
  expect(pts[3].value).toBeCloseTo(0.5, 2);

  // turn the middle point (0.8) off: the curve skips it, it's hollow on the lane
  const middle = page.locator('[data-testid="point-row"][data-index="1"]');
  await expect(middle).toBeVisible();
  await middle.getByTestId("point-on").click();
  await expect.poll(async () => (await points(page))[1].on).toBe(false);
  await expect(page.locator('[data-testid="lane-point"][data-index="1"]')).toHaveAttribute(
    "data-on",
    "false",
  );
});

test("eases: picking one changes the line; delete removes a row", async ({ page }) => {
  await openInspector(page);
  const path = page.getByTestId("lane-path").first();
  const before = await path.getAttribute("points");
  const rows = page.getByTestId("point-row");
  await rows.nth(0).getByTestId("ease-out-type").click();
  await page.locator(".menu").getByRole("button", { name: "Smooth" }).click();
  await expect.poll(async () => (await points(page))[0].out?.type).toBe("smooth");
  await expect.poll(() => path.getAttribute("points")).not.toBe(before);

  // its strength, by scrolling
  const strength = rows.nth(0).getByTestId("ease-out-strength");
  await expect(strength).toHaveText("50%");
  await strength.hover();
  await page.mouse.wheel(0, -100);
  await expect(strength).toHaveText("55%");

  await rows.nth(2).getByTestId("point-delete").click();
  await expect(rows).toHaveCount(2);
});

test("a point selected on the lane is the row selected in the table", async ({ page }) => {
  await openInspector(page);
  await page.locator('[data-testid="lane-point"][data-index="2"]').click();
  await expect(page.locator('[data-testid="point-row"][data-index="2"]')).toHaveAttribute(
    "data-selected",
    "true",
  );
  // and the other way round
  await page
    .locator('[data-testid="point-row"][data-index="0"]')
    .click({ position: { x: 4, y: 4 } });
  await expect(page.locator('[data-testid="lane-point"][data-index="0"]')).toHaveAttribute(
    "data-selected",
    "true",
  );
  // ← Back to the track
  await page.getByTestId("inspector-back").click();
  await expect(page.getByTestId("automation-inspector")).toHaveCount(0);
});

test("the tempo changes as a table: jump or ramp, and every control has a hint", async ({
  page,
}) => {
  await rb(page, (r) =>
    r.store.getState().commit((p: Any) => {
      p.tempo = [{ slotId: p.slots[1].id, at: 0, bpm: 140 }];
    }),
  );
  await page.getByTestId("tempo-lane-toggle").click();
  await page.getByTestId("tempo-menu").click();
  await page
    .locator(".menu")
    .getByRole("button", { name: "Edit tempo changes in the Inspector" })
    .click();
  const rows = page.getByTestId("point-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByTestId("point-value")).toHaveText("140 BPM");
  await rows.first().getByTestId("point-ramp").click();
  await expect.poll(() => rb(page, (r) => r.store.getState().project.tempo[0].ramp)).toBe(true);

  const missing = await rb(page, (r) =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="automation-inspector"] [data-hint]')]
      .map((e) => e.dataset.hint!)
      .filter((id) => !r.hints[id]),
  );
  expect(missing).toEqual([]);
});
