/**
 * E2E: the synth wizard (D169, D170): plain questions, a decision tree, a try, a new synth in Your
 * sounds, on the keys and in the synth editor's Advanced view.
 */
import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("the wizard makes a synth from a few questions (D170)", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("library-wizard").click();
  const wizard = page.getByTestId("synth-wizard");
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId("wizard-question")).toContainText(/what/i);
  // a bass: the wizard asks about a sub later
  await wizard.locator('[data-testid="wizard-answer"][data-answer="bass"]').click();
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId("wizard-name").isVisible()) break;
    seen.push((await page.getByTestId("wizard-question").textContent()) ?? "");
    await page.getByTestId("wizard-next").click();
  }
  expect(seen.some((q) => /sub/i.test(q))).toBe(true);
  // try it: a preview starts
  const before = await page.evaluate(() =>
    (window as never as { __rebeat: { previews(): number } }).__rebeat.previews(),
  );
  await page.getByTestId("wizard-try").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as never as { __rebeat: { previews(): number } }).__rebeat.previews(),
      ),
    )
    .toBeGreaterThan(before);
  // name it and create it
  await page.getByTestId("wizard-name").fill("My Wizard Bass");
  await page.getByTestId("wizard-create").click();
  await expect(wizard).toHaveCount(0);
  await expect(page.getByTestId("keys-chip")).toContainText("My Wizard Bass");
  await expect(page.locator(".dv-tab", { hasText: "My Wizard Bass" })).toBeVisible();
  await expect(page.getByTestId("synth-editor")).toBeVisible();
});
