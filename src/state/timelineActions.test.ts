import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../library/library", () => ({ loadSample: vi.fn(), sampleName: () => "" }));
vi.mock("../components/Toast", () => ({ toast: vi.fn() }));

const { demoProject } = await import("../templates/nightDrive");
const { useStore } = await import("./store");
const { makeEffect } = await import("../model/effects");
const { toSong } = await import("../model/arrangement");
const a = await import("./timelineActions");
const { onlyIn, withAdded } = await import("./pointSelection");

const store = () => useStore.getState();

describe("moving a selection across lanes (D237)", () => {
  beforeEach(() => {
    const p = demoProject();
    const kick = p.tracks[0];
    kick.effects.push({ ...makeEffect("Tremolo"), id: "fx-t" });
    const slotId = p.slots[0].id;
    p.automation = [
      {
        id: "pan",
        target: `track:${kick.id}:mix.pan`,
        on: true,
        points: [
          { slotId, at: 0, value: 0.2 },
          { slotId, at: 2, value: 0.5 },
          { slotId, at: 3.5, value: 0.9 },
        ],
      },
      {
        id: "on",
        target: `track:${kick.id}:fx:fx-t:on`,
        on: true,
        points: [
          { slotId, at: 1, value: 0 },
          { slotId, at: 3, value: 1 },
        ],
      },
    ];
    p.tempo = [{ slotId, at: 2, bpm: 100 }];
    store().loadProject(p, "test");
  });

  const q = (lane: string, i: number) => {
    const p = store().project;
    return toSong(p, p.automation!.find((l) => l.id === lane)!.points[i])!;
  };
  const v = (lane: string, i: number) =>
    store().project.automation!.find((l) => l.id === lane)!.points[i].value;

  it("moves every lane's points by the same time, each by a share of its own range", () => {
    const sel = withAdded(onlyIn("pan", [1]), { on: [0], tempo: [0] });
    const starts = a.selectionStarts(sel);
    a.movePoints(starts, 0.5, { pan: 0.1, on: 1, tempo: 10 }, "k");
    expect(q("pan", 1)).toBeCloseTo(2.5);
    expect(v("pan", 1)).toBeCloseTo(0.6);
    expect(q("on", 0)).toBeCloseTo(1.5);
    // a stepped lane lands on its bands
    expect(v("on", 0)).toBe(1);
    expect(store().project.tempo![0].bpm).toBe(110);
    // one undo step
    store().undo();
    expect(q("pan", 1)).toBeCloseTo(2);
    expect(store().project.tempo![0].bpm).toBe(100);
  });

  it("doesn't let a point pass a neighbour that isn't moving", () => {
    const starts = a.selectionStarts(onlyIn("pan", [1]));
    // the next point of its lane is at 3.5, the one before at 0
    expect(a.clampGroupDq(starts, 5)).toBeLessThan(1.5);
    expect(a.clampGroupDq(starts, -5)).toBeGreaterThan(-2);
    expect(a.clampGroupDq(starts, 1)).toBe(1);
  });

  it("deletes and turns off across lanes in one step", () => {
    const sel = withAdded(onlyIn("pan", [0, 2]), { on: [1] });
    a.setSelectionOn(sel, false);
    const p = store().project;
    expect(p.automation![0].points[0].on).toBe(false);
    expect(p.automation![1].points[1].on).toBe(false);
    a.deleteSelection(sel);
    expect(store().project.automation![0].points).toHaveLength(1);
    expect(store().project.automation![1].points).toHaveLength(1);
  });

  it("folds without undo steps, and undo keeps the folds", () => {
    store().commit((p) => void (p.bpm = 99));
    a.setLaneFolded("pan", true);
    a.setOwnerFolded("master", true);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().project.automation![0].folded).toBe(true);
    expect(store().project.timelineFolded).toEqual(["master"]);
    a.foldAllLanes(false);
    expect(store().project.automation!.some((l) => l.folded)).toBe(false);
    expect(store().project.timelineFolded).toBeUndefined();
  });
});
