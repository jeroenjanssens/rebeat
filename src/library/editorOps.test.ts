import { describe, expect, it } from "vitest";
import {
  cutRange,
  gridMarkers,
  pasteAt,
  silenceRange,
  sliceSteps,
  slicesFromMarkers,
  stripSilence,
} from "./editorOps";

const seq = (n: number) => [Float32Array.from({ length: n }, (_, i) => i + 1)];

describe("editor operations", () => {
  it("cuts, silences and pastes", () => {
    expect([...cutRange(seq(10), 10, 0.2, 0.5)[0]]).toEqual([1, 2, 6, 7, 8, 9, 10]);
    expect([...silenceRange(seq(5), 10, 0.1, 0.3)[0]]).toEqual([1, 0, 0, 4, 5]);
    expect([...pasteAt(seq(3), 10, 0.1, [Float32Array.from([9, 9])])[0]]).toEqual([1, 9, 9, 2, 3]);
  });

  it("strips long silences only", () => {
    const d = new Float32Array(1000);
    d.fill(0.5, 0, 100);
    d.fill(0.5, 600, 700);
    d.fill(0.5, 720, 800);
    const [out] = stripSilence([d], 1000, 0.01, 0.1, 0);
    // the 500-sample gap goes, the 20-sample gap stays
    expect(out.length).toBe(100 + 100 + 20 + 80);
  });

  it("makes slices and their steps", () => {
    expect(slicesFromMarkers([0.5, 0.25], 0, 1)).toEqual([
      [0, 0.25],
      [0.25, 0.5],
      [0.5, 1],
    ]);
    expect(gridMarkers(0, 1, 4)).toEqual([0.25, 0.5, 0.75]);
    expect(
      sliceSteps(
        [
          [1, 1.25],
          [1.25, 1.5],
          [1.75, 2],
        ],
        0.125,
      ),
    ).toEqual([0, 2, 6]);
  });
});
