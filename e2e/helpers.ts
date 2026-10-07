import type { Page } from "@playwright/test";

/** Open the app (each test has fresh browser storage), start audio, wait for the project. */
export async function openApp(page: Page) {
  await page.addInitScript(
    () => ((window as { __REBEAT_TEST_MIC__?: boolean }).__REBEAT_TEST_MIC__ = true),
  );
  await page.goto("/");
  await page.getByTestId("audio-overlay").click();
  await page.locator('[data-testid="audio-status"][data-status="running"]').waitFor();
  await waitForProject(page);
}

export async function waitForProject(page: Page) {
  await page.waitForFunction(() => {
    const r = (window as never as { __rebeat?: { store: { getState(): { projectId: string } } } })
      .__rebeat;
    return !!r?.store.getState().projectId;
  });
}
