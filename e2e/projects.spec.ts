import { expect, test } from "@playwright/test";
import { openApp, waitForProject } from "./helpers";

test.beforeEach(async ({ page }) => openApp(page));

const pad = (page: import("@playwright/test").Page) =>
  page.locator('[data-panel="drum-machine"] [data-pad][data-i="1"]').first();

test("autosaves edits and reopens the last project after a reload", async ({ page }) => {
  await expect(pad(page)).not.toHaveClass(/\bon\b/);
  await pad(page).click();
  await expect(pad(page)).toHaveClass(/\bon\b/);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", {
    timeout: 5000,
  });
  await page.reload();
  await page.getByTestId("audio-overlay").click();
  await waitForProject(page);
  await expect(pad(page)).toHaveClass(/\bon\b/);
});

test("creates a project from a template and switches back", async ({ page }) => {
  await page.getByTestId("project-name").click();
  await expect(page.getByTestId("project-browser")).toBeVisible();
  await page.getByRole("button", { name: /808 starter/ }).click();
  await expect(page.getByTestId("project-browser")).toBeHidden();
  await expect(page.getByTestId("project-name")).toContainText("808 starter");
  await page.keyboard.press("ControlOrMeta+O");
  // the example isn't a stored project; the new one is
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await page.getByTestId("example-card").filter({ hasText: "Night Drive" }).click();
  await expect(page.getByTestId("project-name")).toContainText("Night Drive");
});

test("exports a .rebeat file and imports it again", async ({ page }) => {
  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+Shift+E");
  const file = await download;
  expect(file.suggestedFilename()).toBe("Night Drive.rebeat");
  const path = await file.path();
  await page.keyboard.press("ControlOrMeta+O");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Import .rebeat/ }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByTestId("project-browser")).toBeHidden();
  await page.keyboard.press("ControlOrMeta+O");
  await expect(page.getByTestId("project-card")).toHaveCount(1);
});

test("examples are read-only: the first change makes a copy", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+O");
  await page.getByTestId("example-card").filter({ hasText: "Blue Monday" }).click();
  await expect(page.getByTestId("project-name")).toContainText("Blue Monday");
  await expect(page.getByTestId("example-badge")).toBeVisible();
  const pad = page.locator('[data-panel="drum-machine"] [data-pad][data-i="1"]').first();
  await expect(pad).not.toHaveClass(/\bon\b/);
  await pad.click();
  await expect(page.getByTestId("project-name")).toContainText("Blue Monday (copy)");
  await expect(page.getByTestId("example-badge")).toHaveCount(0);
  await expect(pad).toHaveClass(/\bon\b/);
  // the copy is one of your projects; the example itself is unchanged
  await page.keyboard.press("ControlOrMeta+O");
  await expect(
    page.getByTestId("project-card").filter({ hasText: "Blue Monday (copy)" }),
  ).toHaveCount(1);
  await page.getByTestId("example-card").filter({ hasText: "Blue Monday" }).click();
  await expect(page.getByTestId("example-badge")).toBeVisible();
  await expect(pad).not.toHaveClass(/\bon\b/);
});

test("undo after the first change keeps working in the copy", async ({ page }) => {
  const pad = page.locator('[data-panel="drum-machine"] [data-pad][data-i="1"]').first();
  await pad.click();
  await expect(page.getByTestId("project-name")).toContainText("Night Drive (copy)");
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(pad).not.toHaveClass(/\bon\b/);
  await expect(page.getByTestId("example-badge")).toHaveCount(0);
});
