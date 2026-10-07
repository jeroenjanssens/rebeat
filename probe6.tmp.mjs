import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ permissions: ["microphone"] });
const page = await ctx.newPage();
await page.goto("http://localhost:5173/popout.html");
const r = await Promise.race([page.evaluate(`navigator.mediaDevices.getUserMedia({audio:true}).then(s => "ok " + s.getAudioTracks()[0].label, e => "ERR " + e)`), new Promise((r) => setTimeout(() => r("TIMEOUT"), 5000))]);
console.log("blank page:", r);
await browser.close();
