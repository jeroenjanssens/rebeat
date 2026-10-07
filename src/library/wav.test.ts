import { describe, expect, it } from "vitest";
import { encodeWav, trimSilence } from "./wav";

describe("encodeWav", () => {
  it("writes a 16-bit stereo header and samples", () => {
    const buf = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, 0, 0])], 48000);
    const v = new DataView(buf);
    expect(String.fromCharCode(...new Uint8Array(buf, 0, 4))).toBe("RIFF");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(40, true)).toBe(12);
    expect(v.getInt16(44 + 4, true)).toBe(32767); // frame 1, left
    expect(v.getInt16(44 + 8, true)).toBe(-32768); // frame 2, left
  });

  it("writes 32-bit float", () => {
    const v = new DataView(encodeWav([new Float32Array([0.25])], 44100, 32));
    expect(v.getUint16(20, true)).toBe(3);
    expect(v.getFloat32(44, true)).toBeCloseTo(0.25);
  });
});

describe("trimSilence", () => {
  it("cuts silence at both ends and keeps a little padding", () => {
    const d = new Float32Array(1000);
    d.fill(0.5, 400, 500);
    const [t] = trimSilence([d], 10000, 0.01, 1);
    expect(t.length).toBe(100 + 2 * 10);
  });
});
