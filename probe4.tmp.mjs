import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERR " + String(e.stack || e)));
page.on("console", (m) => (m.type() === "error") && errors.push(m.text()));
await page.goto("http://localhost:5173");
await page.getByTestId("audio-overlay").click();
await page.waitForTimeout(1200);
await page.evaluate(() => window.__rebeat.store.getState().setUi({ editSlotId: "slot-verse" }));
await page.keyboard.press("ControlOrMeta+Alt+2");
await page.keyboard.press("Space");
await page.waitForTimeout(1200);
const box = await page.getByTestId("platter").boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.4;
await page.mouse.move(cx + r, cy);
await page.mouse.down();
const vox = await page.evaluate(() => window.__rebeat.store.getState().project.tracks.find((t) => t.name === "Vox").id);
let peak = 0;
for (let i = 0; i < 40; i++) {
  const a = Math.sin(i / 4) * 1.2;
  await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
  await page.waitForTimeout(15);
  peak = Math.max(peak, await page.evaluate((id) => window.__rebeat.engine.level(id), vox));
}
await page.mouse.up();
console.log("vox peak while scratching:", peak.toFixed(3));
console.log(errors.join("\n") || "no errors");
await browser.close();
