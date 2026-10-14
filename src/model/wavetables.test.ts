import { describe, expect, it } from "vitest";
import {
  FACTORY_TABLES,
  FRAME,
  LEVELS,
  clmFrameSize,
  cutTable,
  fromSpectrum,
  levelSize,
  levelTop,
  mipTable,
} from "./wavetables";
import { fft } from "../library/fft";

/** Harmonic magnitudes of one frame. */
function spectrum(frame: Float32Array) {
  const re = Float32Array.from(frame);
  const im = new Float32Array(frame.length);
  fft(re, im);
  return Array.from(
    { length: frame.length / 2 },
    (_, h) => Math.hypot(re[h], im[h]) / (frame.length / 2),
  );
}

/** A small hash of a table's samples (deterministic generation). */
const hash = (frames: Float32Array[]) =>
  frames.reduce((h, f) => f.reduce((a, x, i) => a + x * ((i % 7) + 1), h), 0);

describe("factory wavetables (D242)", () => {
  it("have stable ids, frames of 2048, at most 256, and come out the same every time", () => {
    const ids = new Set(FACTORY_TABLES.map((t) => t.id));
    expect(ids.size).toBe(FACTORY_TABLES.length);
    expect(FACTORY_TABLES.length).toBeGreaterThanOrEqual(16);
    for (const t of FACTORY_TABLES) {
      expect(t.id.startsWith("factory:")).toBe(true);
      const a = t.make();
      expect(a.length).toBeGreaterThan(0);
      expect(a.length).toBeLessThanOrEqual(256);
      for (const f of a) expect(f.length).toBe(FRAME);
      expect(hash(t.make())).toBe(hash(a));
    }
  });

  it("make sines from spectra", () => {
    const f = fromSpectrum((h) => (h === 3 ? 0.5 : 0));
    const s = spectrum(f);
    expect(s[3]).toBeCloseTo(0.5, 3);
    expect(s[2]).toBeLessThan(1e-4);
    // a sine's phase: sin(2π·3t), −1 at t = 1/4
    expect(f[FRAME / 4]).toBeCloseTo(-0.5, 3);
  });
});

describe("mip levels (D243)", () => {
  const saw = FACTORY_TABLES.find((t) => t.id === "factory:basic")!.make();
  const m = mipTable("test", saw);

  it("keep only the harmonics each level allows, normalized, without DC", () => {
    expect(m.levels).toHaveLength(LEVELS);
    let peak = 0;
    for (let k = 0; k < LEVELS; k++) {
      expect(m.levels[k].length).toBe(m.frames * levelSize(k));
      const frame = m.levels[k].subarray(2 * m.sizes[k], 3 * m.sizes[k]);
      const s = spectrum(frame);
      expect(s[0]).toBeLessThan(1e-4);
      const top = levelTop(k);
      for (let h = top + 1; h < s.length; h++) expect(s[h]).toBeLessThan(1e-4);
      if (top > 2) expect(s[top]).toBeGreaterThan(0);
      for (const x of m.levels[k]) peak = Math.max(peak, Math.abs(x));
    }
    expect(peak).toBeCloseTo(1, 3);
  });
});

describe("your tables from samples (D246)", () => {
  // a rising sweep of a saw-like tone at 441 Hz (100 samples per cycle at 44.1 kHz)
  const sr = 44100;
  const audio = Float32Array.from({ length: sr }, (_, i) => {
    const t = (i % 100) / 100;
    return Math.sin(2 * Math.PI * t) * 0.6 + (i / sr) * 0.3 * Math.sin(4 * Math.PI * t);
  });

  it("cut single cycles at zero crossings (Cycles)", () => {
    const frames = cutTable(audio, { mode: "cycles", period: 100, count: 32 });
    expect(frames).toHaveLength(32);
    for (const f of frames) {
      expect(f.length).toBe(FRAME);
      // a whole cycle: starts near zero, its fundamental is harmonic 1
      expect(Math.abs(f[0])).toBeLessThan(0.1);
      const s = spectrum(f);
      expect(s[1]).toBeGreaterThan(s[3] * 5);
    }
  });

  it("spread slices evenly (Even slices) and read a wavetable file as it is", () => {
    expect(cutTable(audio, { mode: "slices", count: 16 })).toHaveLength(16);
    const file = new Float32Array(FRAME * 64).map((_, i) => Math.sin((2 * Math.PI * i) / FRAME));
    expect(cutTable(file, { mode: "file" })).toHaveLength(64);
  });

  it("find a WAV's frame size in its clm chunk", () => {
    const text = "<!>2048 01000000 wavetable (www.xferrecords.com)";
    const bytes = new Uint8Array(12 + 8 + text.length + 8);
    bytes.set(
      [..."RIFF"].map((c) => c.charCodeAt(0)),
      0,
    );
    bytes.set(
      [..."WAVE"].map((c) => c.charCodeAt(0)),
      8,
    );
    bytes.set(
      [..."clm "].map((c) => c.charCodeAt(0)),
      12,
    );
    bytes[16] = text.length;
    bytes.set(
      [...text].map((c) => c.charCodeAt(0)),
      20,
    );
    expect(clmFrameSize(bytes)).toBe(2048);
  });
});
