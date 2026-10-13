import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { emptyProject, hitsTrack, page, splitLongPages } from "../templates/builder";
import {
  anchoredTo,
  bars,
  blockAt,
  layout,
  positionOf,
  songLength,
  toAnchor,
  toSong,
  valueAt,
} from "./arrangement";
import { cloneSlot, copySlot, deleteSlot, type Project } from "./project";
import { unroll } from "./takePlan";
import type { AutomationLane } from "./types";

/** Intro (16 steps ×2), Verse (32 steps ×1), Stop (16 steps, plays 8). */
function song(): Project {
  const p = emptyProject("Test", 120);
  p.tracks = [hitsTrack("Kick", "kit:909:kick", "909 Kick", "kick")];
  page(p, "Intro", 16, 2);
  page(p, "Verse", 32, 1);
  page(p, "Stop", 16, 1);
  p.slots[2].steps = 8;
  return p;
}

const lane = (points: AutomationLane["points"]): AutomationLane => ({
  id: "a",
  target: "master:volume",
  on: true,
  points,
});

describe("layout (D181)", () => {
  it("lays the sections out in quarter notes, with repeats and played steps", () => {
    const p = song();
    const blocks = layout(p);
    expect(blocks.map((b) => [b.start, b.length, b.span])).toEqual([
      [0, 4, 8],
      [8, 8, 8],
      [16, 2, 2],
    ]);
    expect(songLength(p)).toBe(18);
    expect(blockAt(p, 9).section.id).toBe(p.slots[1].id);
    expect(blockAt(p, 99).section.id).toBe(p.slots[2].id);
  });

  it("finds the section, repeat and step at a position", () => {
    const p = song();
    const at = positionOf(p, 5.3);
    expect(at.block.index).toBe(0);
    expect(at.repeat).toBe(1);
    expect(at.step).toBe(5);
    expect(at.into).toBeCloseTo(0.05);
  });

  it("anchors round-trip, and hide past their section's span", () => {
    const p = song();
    expect(toSong(p, toAnchor(p, 10.5))).toBeCloseTo(10.5);
    const a = { slotId: p.slots[0].id, at: 6 };
    expect(toSong(p, a)).toBe(6);
    const shorter = produce(p, (d) => void (d.slots[0].repeats = 1));
    expect(toSong(shorter, a)).toBeNull();
    // and come back when the span grows
    const longer = produce(shorter, (d) => void (d.slots[0].repeats = 3));
    expect(toSong(longer, a)).toBe(6);
  });
});

describe("bars (D185: every section starts a bar)", () => {
  it("counts bars from each repeat; a short section is a short bar", () => {
    const p = song();
    const b = bars(p);
    expect(b.map((x) => x.q)).toEqual([0, 4, 8, 12, 16]);
    expect(b[4]).toEqual({ q: 16, bar: 5, short: true });
  });

  it("a 3-beat pattern in 4/4 starts a bar on each repeat", () => {
    const p = emptyProject("3/4", 120);
    page(p, "A", 12, 2);
    expect(bars(p).map((x) => [x.q, x.short])).toEqual([
      [0, true],
      [3, true],
    ]);
  });
});

describe("automation values", () => {
  it("ramps between points, holds, and keeps the first and last values outside", () => {
    const p = song();
    const [a, b] = p.slots;
    const l = lane([
      { slotId: a.id, at: 2, value: 0.2 },
      { slotId: b.id, at: 0, value: 0.8, hold: true },
      { slotId: b.id, at: 4, value: 0.4 },
    ]);
    expect(valueAt(p, l, 0)).toBe(0.2);
    expect(valueAt(p, l, 5)).toBeCloseTo(0.5);
    expect(valueAt(p, l, 10)).toBe(0.8);
    expect(valueAt(p, l, 13)).toBe(0.4);
  });

  it("moves with its section when the song order changes", () => {
    const p = produce(song(), (d) => {
      d.automation = [lane([{ slotId: d.slots[1].id, at: 1, value: 1 }])];
    });
    const moved = produce(p, (d) => void d.slots.unshift(d.slots.splice(1, 1)[0]));
    expect(toSong(moved, moved.automation![0].points[0])).toBe(1);
  });
});

describe("keeping anchors (D187)", () => {
  const anchored = () =>
    produce(song(), (d) => {
      const s = d.slots[0].id;
      d.automation = [
        lane([
          { slotId: s, at: 1, value: 0.5 },
          { slotId: s, at: 6, value: 1 },
        ]),
      ];
      d.tempo = [{ slotId: s, at: 4, bpm: 100 }];
      d.regions = [
        {
          id: "r",
          trackId: d.tracks[0].id,
          sampleId: "x",
          start: { slotId: s, at: 7 },
          length: 8,
          offset: 0,
        },
      ];
    });

  it("deleting a section removes what's anchored to it", () => {
    const p = anchored();
    expect(anchoredTo(p, p.slots[0].id)).toEqual({ points: 2, tempo: 1, regions: 1 });
    const d = produce(p, (x) => deleteSlot(x, x.slots[0].id));
    expect(d.automation![0].points).toEqual([]);
    expect(d.tempo).toEqual([]);
    expect(d.regions).toEqual([]);
  });

  it("copies and clones get copies of what's anchored, and the section's settings", () => {
    let id = "";
    const p = produce(anchored(), (d) => {
      d.slots[0].mutes = [d.tracks[0].id];
      id = cloneSlot(d, d.slots[0].id);
    });
    expect(anchoredTo(p, id)).toEqual({ points: 2, tempo: 1, regions: 1 });
    expect(p.slots[1].mutes).toEqual([p.tracks[0].id]);
    expect(new Set(p.regions!.map((r) => r.id)).size).toBe(2);
    let copy = "";
    const c = produce(p, (d) => void (copy = copySlot(d, d.slots[0].id)));
    expect(anchoredTo(c, copy).points).toBe(2);
  });

  it("unroll moves what was in repeat k to part k", () => {
    const p = produce(anchored(), (d) => unroll(d, d.slots[0].id));
    expect(p.slots[0].repeats).toBe(1);
    const parts = [p.slots[0].id, p.slots[1].id];
    const pts = p.automation![0].points;
    expect(pts.map((x) => [parts.indexOf(x.slotId), x.at])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(p.tempo![0]).toMatchObject({ slotId: parts[1], at: 0 });
    // the song positions don't change
    expect(toSong(p, pts[1])).toBe(6);
  });

  it("splitting long patterns keeps positions", () => {
    const p = emptyProject("Long", 120);
    page(p, "Long", 64, 2);
    p.automation = [lane([{ slotId: p.slots[0].id, at: 20, value: 1 }])];
    splitLongPages(p);
    expect(p.slots.length).toBe(4);
    expect(toSong(p, p.automation[0].points[0])).toBe(20);
  });
});
