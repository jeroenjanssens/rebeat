import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.addInitScript(() => {
  if (!localStorage.getItem("rebeat.settings"))
    localStorage.setItem("rebeat.settings", JSON.stringify({ state: { theme: "studio-dark" }, version: 1 }));
});
await page.goto("http://localhost:5173");
await page.getByTestId("audio-overlay").click();
await page.waitForTimeout(1200);
const step = process.argv[2] ?? "";
if (step.includes("wide")) {
  // make the library wider by dragging the sash
  const lib = page.locator('[data-panel="library"]');
  const box = await lib.boundingBox();
  await page.mouse.move(box.x + box.width + 3, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 300, box.y + 200, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
await page.getByTestId("library").getByRole("button", { name: /All samples|909 kit/ }).first().click().catch(() => {});
await page.waitForTimeout(200);
const m = page.locator(".menu").getByRole("button", { name: "909 kit" });
if (await m.count()) await m.click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/shots/lib.png" });
console.log(errors.join("\n") || "no errors");
await browser.close();
