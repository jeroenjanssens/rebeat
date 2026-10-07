import { describe, expect, it } from "vitest";
import { detectBpm, detectOnsets, guessCategory } from "./analysis";

function clickTrack(bpm: number, beats: number, sampleRate = 22050) {
  const beat = 60 / bpm;
  const data = new Float32Array(Math.round(beats * beat * sampleRate));
  for (let b = 0; b < beats; b++) {
    const start = Math.round(b * beat * sampleRate);
    const amp = b % 4 === 0 ? 1 : 0.6;
    for (let i = 0; i < 800 && start + i < data.length; i++)
      data[start + i] = amp * Math.exp(-i / 120) * Math.sin(i * 0.3);
  }
  return { data, sampleRate };
}

describe("detectBpm", () => {
  it.each([90, 112, 128, 140])("finds %i BPM in a 2-bar click loop", (bpm) => {
    expect(detectBpm(clickTrack(bpm, 8))).toBeCloseTo(bpm, 0);
  });

  it("returns nothing for one-shots", () => {
    expect(detectBpm(clickTrack(120, 1))).toBeUndefined();
  });
});

describe("detectOnsets", () => {
  it("finds every click", () => {
    const onsets = detectOnsets(clickTrack(120, 8));
    expect(onsets).toHaveLength(8);
    expect(onsets[1]).toBeCloseTo(0.5, 1);
  });
});

describe("guessCategory", () => {
  it.each([
    ["Kick 01.wav", "kick"],
    ["RolandTR808_bd", "kick"],
    ["snare-tight.wav", "snare"],
    ["Closed Hat.wav", "hat"],
    ["vox hook.mp3", "vocal"],
    ["thing.wav", "perc"],
  ])("%s → %s", (name, cat) => {
    expect(guessCategory(name)).toBe(cat);
  });
});
