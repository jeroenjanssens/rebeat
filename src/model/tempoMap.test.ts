import { describe, expect, it } from "vitest";
import { emptyProject, page } from "../templates/builder";
import type { Project } from "./project";
import {
  hasTempoChanges,
  quarterAt,
  secondsBetween,
  songSeconds,
  tempoAt,
  tempoMap,
} from "./tempoMap";

/** Two sections of 4 bars (16 quarters each) at 120 BPM. */
function song(): Project {
  const p = emptyProject("Tempo", 120);
  page(p, "A", 16, 4);
  page(p, "B", 16, 4);
  return p;
}

describe("the tempo map (D192)", () => {
  it("without changes, durations are quarters × 60 / bpm", () => {
    const p = song();
    expect(hasTempoChanges(p)).toBe(false);
    expect(secondsBetween(p, 3, 4.25)).toBe((1.25 * 60) / 120);
    expect(songSeconds(p)).toBe(16);
    expect(tempoAt(p, 7)).toBe(120);
  });

  it("a jump changes the tempo from its position", () => {
    const p = song();
    p.tempo = [{ slotId: p.slots[1].id, at: 0, bpm: 60 }];
    expect(tempoAt(p, 15.9)).toBe(120);
    expect(tempoAt(p, 16)).toBe(60);
    expect(songSeconds(p)).toBeCloseTo(8 + 16);
  });

  it("a ramp runs from the change before, and matches a fine numeric sum", () => {
    const p = song();
    // 120 → 60 over the second section
    p.tempo = [
      { slotId: p.slots[1].id, at: 0, bpm: 120 },
      { slotId: p.slots[1].id, at: 15.999, bpm: 60, ramp: true },
    ];
    expect(tempoAt(p, 24)).toBeCloseTo(90, 1);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) {
      const q = 16 + ((i + 0.5) / n) * 8;
      sum += (60 / tempoAt(p, q)) * (8 / n);
    }
    expect(secondsBetween(p, 16, 24)).toBeCloseTo(sum, 5);
  });

  it("a ramp from the start tempo when there's no change before it", () => {
    const p = song();
    p.tempo = [{ slotId: p.slots[0].id, at: 8, bpm: 140, ramp: true }];
    expect(tempoMap(p)[0]).toMatchObject({ q: 0, end: 8, bpm: 120, to: 140 });
    expect(tempoAt(p, 4)).toBeCloseTo(130);
  });

  it("quarterAt inverts secondsBetween", () => {
    const p = song();
    p.tempo = [
      { slotId: p.slots[0].id, at: 4, bpm: 90 },
      { slotId: p.slots[1].id, at: 8, bpm: 150, ramp: true },
    ];
    for (const q of [0, 3, 4, 7.5, 20, 30])
      expect(quarterAt(p, secondsBetween(p, 0, q))).toBeCloseTo(q, 6);
  });

  it("an eased ramp (D198) matches a fine numeric sum, and quarterAt inverts it", () => {
    const p = song();
    p.tempo = [
      { slotId: p.slots[1].id, at: 0, bpm: 90, out: { type: "smooth", strength: 1 } },
      { slotId: p.slots[1].id, at: 15.999, bpm: 160, ramp: true, in: { type: "exponential" } },
    ];
    // slow to leave 90
    expect(tempoAt(p, 18)).toBeLessThan(90 + (160 - 90) * (2 / 16));
    let sum = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const q = 16 + ((i + 0.5) / n) * 12;
      sum += (60 / tempoAt(p, q)) * (12 / n);
    }
    expect(secondsBetween(p, 16, 28)).toBeCloseTo(sum, 4);
    for (const q of [3, 17.5, 25, 31])
      expect(quarterAt(p, secondsBetween(p, 0, q))).toBeCloseTo(q, 5);
  });

  it("a change that's off is skipped", () => {
    const p = song();
    p.tempo = [{ slotId: p.slots[1].id, at: 0, bpm: 60, on: false }];
    expect(hasTempoChanges(p)).toBe(false);
    expect(tempoAt(p, 20)).toBe(120);
  });
});
