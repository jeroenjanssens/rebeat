import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chromium", args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ permissions: ["microphone"] }); const page = await ctx.newPage();
await page.goto("http://localhost:5173");
await page.getByTestId("audio-overlay").click();
await page.waitForTimeout(1000);
for (const c of ["{audio:true}", "{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}", "{audio:{channelCount:{ideal:2}}}", "{audio:{deviceId: undefined, echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:{ideal:2}}}"]) {
  const r = await Promise.race([page.evaluate(`navigator.mediaDevices.getUserMedia(${c}).then(s => "ok " + s.getAudioTracks()[0].label, e => "ERR " + e)`), new Promise((r) => setTimeout(() => r("TIMEOUT"), 4000))]);
  console.log(c, r);
}
await browser.close();
