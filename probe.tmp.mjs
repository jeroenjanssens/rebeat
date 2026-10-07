import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(m.text()));
await page.goto("http://localhost:5173");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByTestId("audio-overlay").click();
await page.waitForTimeout(1500);
await page.keyboard.press("Space");
const levels = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(150);
  levels.push(await page.evaluate(() => {
    const r = window.__rebeat;
    const s = r.store.getState();
    return { m: r.engine.masterLevel().map((x) => x.toFixed(2)).join("/"), kick: r.engine.level(s.project.tracks[0].id).toFixed(2), step: r.transport.position().pageStep };
  }));
}
console.log(JSON.stringify(levels));
await page.screenshot({ path: "/tmp/shots/c.png" });
console.log(errors.join("\n") || "no errors");
await browser.close();
