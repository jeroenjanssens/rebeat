import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173");
await page.getByTestId("audio-overlay").click();
await page.waitForTimeout(1500);
const client = await page.context().newCDPSession(page);
await client.send("Profiler.enable");
await client.send("Profiler.start");
await page.keyboard.press("Space");
await page.waitForTimeout(4000);
const { profile } = await client.send("Profiler.stop");
// aggregate self time by function
const self = new Map();
const dt = profile.timeDeltas; const samples = profile.samples;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
for (let i = 0; i < samples.length; i++) {
  const n = byId.get(samples[i]);
  const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`;
  self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
}
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join("\n"));
await browser.close();
