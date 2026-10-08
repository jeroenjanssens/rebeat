import { describe, expect, it } from "vitest";
import { SynthCore } from "../engine/synth/core";
import { FACTORY_SYNTHS } from "./synths";

const SR = 44100;

/** Loudness of a factory synth playing a short phrase in its range (dB RMS, dB peak). */
export function level(id: string) {
  const s = FACTORY_SYNTHS.find((x) => x.id === id)!;
  const core = new SynthCore(SR, s.patch);
  const root = s.group === "Bass" ? 36 : 60;
  const mono = s.patch.voice.mode !== "poly";
  const phrase: [number, number, number][] = mono
    ? [
        [root, 0.05, 0.4],
        [root + 7, 0.55, 0.9],
        [root + 12, 1.05, 2],
      ]
    : [
        [root, 0.05, 0.5],
        [root + 4, 0.05, 0.5],
        [root + 7, 0.05, 0.5],
        [root + 5, 0.55, 1.6],
        [root + 9, 0.55, 1.6],
      ];
  phrase.forEach(([n, a, b], i) => {
    core.noteOn(i, n, 0.8, Math.round(a * SR));
    core.noteOff(i, Math.round(b * SR));
  });
  const n = SR * 3;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let f = 0; f < n; f += 128) core.process(l.subarray(f, f + 128), r.subarray(f, f + 128), f);
  let peak = 0;
  let sum = 0;
  let finite = true;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) finite = false;
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    sum += l[i] * l[i] + r[i] * r[i];
  }
  const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
  return {
    rms: db(Math.sqrt(sum / (2 * SR * 1.6))),
    peak: db(peak),
    finite,
    slow: s.patch.envs[0].attack > 0.5,
  };
}

describe("factory synth levels", () => {
  const levels = FACTORY_SYNTHS.map((s) => ({ id: s.id, ...level(s.id) }));

  it("are audible, finite and don't clip", () => {
    if (process.env.SYNTH_LEVELS)
      console.log(
        levels
          .map((l) => `${l.id.padEnd(16)} rms ${l.rms.toFixed(1)} peak ${l.peak.toFixed(1)}`)
          .join("\n"),
      );
    for (const l of levels) {
      expect(l.finite, l.id).toBe(true);
      expect(l.peak, `${l.id} is silent`).toBeGreaterThan(-30);
      expect(l.peak, `${l.id} clips`).toBeLessThanOrEqual(0);
    }
  });

  it("are balanced: within 6 dB of each other (slow fade-ins aside)", () => {
    const steady = levels
      .filter((l) => !l.slow)
      .map((l) => l.rms)
      .sort((a, b) => a - b);
    const median = steady[Math.floor(steady.length / 2)];
    for (const l of levels.filter((x) => !x.slow))
      expect(Math.abs(l.rms - median), l.id).toBeLessThanOrEqual(6);
  });
});
