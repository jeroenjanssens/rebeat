import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.stack || e)));
await page.goto("http://localhost:5173");
await page.getByTestId("audio-overlay").click();
await page.waitForTimeout(1500);
const measure = () => page.evaluate(async () => {
  const r = window.__rebeat; const t = r.store.getState().project.tracks;
  const peaks = {};
  const end = performance.now() + 400;
  while (performance.now() < end) {
    for (const tr of t) peaks[tr.name] = +Math.max(peaks[tr.name] ?? 0, r.engine.level(tr.id)).toFixed(3);
    await new Promise((res) => setTimeout(res, 15));
  }
  return JSON.stringify(peaks);
});
await page.keyboard.press("Space");
const t0 = Date.now();
for (let i = 0; i < 12; i++) console.log(Date.now() - t0, await measure(), await page.evaluate(() => [window.__rebeat.engine.audioNow().toFixed(2), document.querySelector('[data-testid=audio-status]')?.textContent]));
console.log(errors.slice(0, 5).join("\n") || "no errors");
await browser.close();
