import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import spec from "./fixtures/onsets.json";
import { detectOnsets, hitWindow } from "./onsets";

/** A 16-bit mono WAV's samples. */
function readWav(path: string): Float32Array {
  const b = readFileSync(path);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 12;
  while (p < b.length) {
    const id = b.toString("ascii", p, p + 4);
    const size = view.getUint32(p + 4, true);
    if (id === "data") {
      const out = new Float32Array(size / 2);
      for (let i = 0; i < out.length; i++) out[i] = view.getInt16(p + 8 + i * 2, true) / 32767;
      return out;
    }
    p += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

describe("onsets and windows as in training (ml/rebeat_ml/onsets.py)", () => {
  const x = readWav(`src/library/beatbox/fixtures/${spec.file}`);

  it("finds the same onsets as the Python port", () => {
    const found = detectOnsets(x).map((o) => o.time);
    expect(found).toHaveLength(spec.onsets.length);
    found.forEach((t, i) => expect(Math.abs(t - spec.onsets[i])).toBeLessThan(1e-4));
  });

  it("cuts the same gated windows", () => {
    spec.windows.forEach((w, i) => {
      const mine = hitWindow(x, spec.onsets[i], spec.onsets[i + 1]);
      let worst = 0;
      w.forEach((v, j) => (worst = Math.max(worst, Math.abs(v - mine[j]))));
      expect(worst).toBeLessThan(1e-4);
    });
  });
});
