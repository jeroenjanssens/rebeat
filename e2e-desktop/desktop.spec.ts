import { _electron as electron, expect, test } from "@playwright/test";

test("the desktop app starts, uses the Electron platform and plays", async () => {
  const app = await electron.launch({ args: ["."], env: { ...process.env, REBEAT_NO_MIC_PROMPT: "1" } });
  const win = await app.firstWindow();
  const errors: string[] = [];
  win.on("pageerror", (e) => errors.push(String(e)));
  await expect(win).toHaveTitle("Rebeat");
  expect(win.url()).toBe("rebeat://app/index.html");
  await win.getByTestId("audio-overlay").click();
  await win.locator('[data-testid="audio-status"][data-status="running"]').waitFor();
  const kind = await win.evaluate(() => typeof (window as never as { rebeatNative?: unknown }).rebeatNative);
  expect(kind).toBe("object");
  // the welcome shows on the first run
  await win.getByTestId("welcome-demo").click();
  await win.keyboard.press("Space");
  await expect(win.getByTestId("play")).toHaveText(/Stop/);
  // menus are native
  const items = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label));
  expect(items).toContain("File");
  expect(errors).toEqual([]);
  await app.close();
});
