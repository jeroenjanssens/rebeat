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
  await expect(page.getByTestId("project-card")).toHaveCount(2);
  await page.getByTestId("project-card").filter({ hasText: "Night Drive" }).locator("img").click();
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
  await expect(page.getByTestId("project-card")).toHaveCount(2);
});
