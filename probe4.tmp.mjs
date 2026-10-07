import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERR " + String(e.stack || e)));
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(m.text()));
await page.goto("http://localhost:5173");
await page.getByTestId("audio-overlay").click();
await page.waitForTimeout(1500);
await page.evaluate(() => { const s = window.__rebeat.store.getState(); s.commit((p) => void (p.bpm = 140)); s.setUi({ editSlotId: "slot-verse" }); });
await page.keyboard.press("Space");
await page.waitForTimeout(2500);
console.log(await page.evaluate(async () => {
  const r = window.__rebeat; const vox = r.store.getState().project.tracks.find((t) => t.name === "Vox");
  let peak = 0; const end = performance.now() + 1500;
  while (performance.now() < end) { peak = Math.max(peak, r.engine.level(vox.id)); await new Promise((res) => setTimeout(res, 20)); }
  return "vox peak " + peak.toFixed(3) + " pos " + r.engine.clipPosition(vox.id)?.toFixed(3);
}));
console.log(errors.join("\n") || "no errors");
await browser.close();
