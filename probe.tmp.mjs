import { chromium } from "@playwright/test";
const [,, out = "/tmp/shots/x.png", ...actions] = process.argv;
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.stack || e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.addInitScript(() => {
  if (!localStorage.getItem("rebeat.settings"))
    localStorage.setItem("rebeat.settings", JSON.stringify({ state: { theme: "studio-dark" }, version: 1 }));
});
await page.goto("http://localhost:5173");
await page.getByTestId("audio-overlay").click();
await page.waitForTimeout(800);
for (const a of actions) {
  const i = a.indexOf(":"); const kind = a.slice(0, i), arg = a.slice(i + 1);
  if (kind === "click") await page.locator(arg).first().click();
  else if (kind === "rclick") await page.locator(arg).first().click({ button: "right" });
  else if (kind === "key") await page.keyboard.press(arg);
  else if (kind === "wait") await page.waitForTimeout(Number(arg));
  else if (kind === "eval") await page.evaluate(arg);
  else if (kind === "text") await page.getByText(arg, { exact: true }).first().click();
}
await page.screenshot({ path: out });
console.log(errors.join("\n") || "no errors");
await browser.close();
