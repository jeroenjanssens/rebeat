import { describe, expect, it } from "vitest";
import { detectPitchHz, detectRootNote, hzToMidi } from "./pitch";

const SR = 44100;
const tone = (hz: number, seconds = 1, harmonics = [1, 0.5, 0.25]) => {
  const x = new Float32Array(Math.round(SR * seconds));
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    let v = 0;
    harmonics.forEach((a, h) => (v += a * Math.sin(2 * Math.PI * hz * (h + 1) * t)));
    x[i] = v * Math.exp(-t * 2);
  }
  return x;
};
const buffer = (x: Float32Array) => ({
  sampleRate: SR,
  numberOfChannels: 1,
  getChannelData: () => x,
});

describe("pitch (D133)", () => {
  it("finds the fundamental of tones with harmonics", () => {
    for (const hz of [55, 110, 220, 440, 880]) {
      const got = detectPitchHz(tone(hz), SR)!;
      expect(Math.abs(hzToMidi(got) - hzToMidi(hz))).toBeLessThan(0.2);
    }
  });

  it("gives the MIDI note a sample plays as it is", () => {
    expect(detectRootNote(buffer(tone(220)))).toBe(57); // A3
    expect(detectRootNote(buffer(tone(261.63)))).toBe(60); // C4
  });

  it("finds none in noise (drums)", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const noise = new Float32Array(SR);
    for (let i = 0; i < noise.length; i++) noise[i] = rnd() * Math.exp(-i / 4000);
    expect(detectRootNote(buffer(noise))).toBeNull();
  });
});
