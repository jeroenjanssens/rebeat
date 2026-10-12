import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { demoProject } from "../templates/nightDrive";
import type { Project } from "./project";
import { addPages, checkTake, fitPage, makeCopies, pageSixteenths, unroll } from "./takePlan";

/** The demo song cut to one 16-step page, `mode` its play mode. */
function onePage(mode: "loop" | "song"): Project {
  return produce(demoProject(), (p) => {
    p.playMode = mode;
    p.slots = [{ ...p.slots[0], repeats: 1 }];
    const pat = p.patterns[p.slots[0].patternId];
    pat.stepCount = 16;
    pat.stepSize = "1/16";
  });
}

describe("room for a take (D163, D164)", () => {
  it("loop mode: the page is too short, Fit the page makes it long enough", () => {
    const p = onePage("loop");
    const slot = p.slots[0].id;
    expect(checkTake(p, slot, 64)).toMatchObject({ needs: 64, has: 16 });
    const fitted = produce(p, (d) => fitPage(d, slot, 64));
    expect(pageSixteenths(fitted.patterns[fitted.slots[0].patternId])).toBe(64);
    // never past 128 steps
    const huge = produce(p, (d) => fitPage(d, slot, 1000));
    expect(huge.patterns[huge.slots[0].patternId].stepCount).toBe(128);
  });

  it("song mode: Add pages adds copies of the page with the keys' lane emptied", () => {
    const p = onePage("song");
    const slot = p.slots[0].id;
    const keys = p.tracks.find((t) => t.mode === "notes")!.id;
    const drums = p.tracks.find((t) => t.mode !== "notes")!.id;
    let added = 0;
    const q = produce(p, (d) => void (added = addPages(d, slot, 64, [keys])));
    expect(added).toBe(3);
    expect(q.slots).toHaveLength(4);
    expect(new Set(q.slots.map((s) => s.patternId)).size).toBe(4); // copies, not clones
    const second = q.patterns[q.slots[1].patternId];
    expect(second.lanes[keys].steps.every((st) => !st.notes?.length)).toBe(true);
    // the drums go on
    expect(second.lanes[drums].steps.map((st) => st.on)).toEqual(
      p.patterns[p.slots[0].patternId].lanes[drums].steps.map((st) => st.on),
    );
    expect(checkTake(q, slot, 64).has).toBe(64);
  });

  it("song mode: finds clones and repeats the take reaches, and fixes them", () => {
    const base = onePage("song");
    const p = produce(base, (d) => {
      const s = d.slots[0];
      d.slots.push({ id: "clone", patternId: s.patternId, repeats: 1 });
      d.slots.push({ id: "twice", patternId: s.patternId, repeats: 2 });
    });
    const c = checkTake(p, p.slots[0].id, 64);
    expect(c.clones).toEqual([p.slots[0].id, "clone", "twice"]);
    expect(c.repeats).toEqual(["twice"]);
    const copies = produce(p, (d) => makeCopies(d, ["clone", "twice"]));
    expect(new Set(copies.slots.map((s) => s.patternId)).size).toBe(3);
    const unrolled = produce(copies, (d) => unroll(d, "twice"));
    expect(unrolled.slots).toHaveLength(4);
    expect(unrolled.slots.every((s) => s.repeats === 1)).toBe(true);
  });
});
