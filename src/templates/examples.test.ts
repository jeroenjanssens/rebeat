import { describe, expect, it } from "vitest";
import { KIT_SOUNDS } from "../engine/kits";
import { SYNTH_PRESETS } from "../engine/instruments";
import { CATALOG } from "../library/instruments";
import { deserializeProject, serializeProject } from "../model/schema";
import { chord, note } from "./builder";
import { EXAMPLES } from "./examples";

describe("example songs", () => {
  it.each(EXAMPLES.map((e) => [e.name, e] as const))("%s is a valid project", (_, e) => {
    const p = e.create();
    expect(p.tracks.length).toBeGreaterThan(3);
    expect(p.slots.length).toBeGreaterThan(1);
    for (const t of p.tracks) {
      if (t.sampleId) expect(KIT_SOUNDS.some((k) => k.id === t.sampleId)).toBe(true);
      if (t.instrument?.source === "synth")
        expect(SYNTH_PRESETS.some((s) => s.id === t.instrument!.preset)).toBe(true);
      if (t.instrument?.source === "smplr")
        expect(
          CATALOG.some((c) => c.id === `smplr:${t.instrument!.preset}`),
          t.name,
        ).toBe(true);
    }
    for (const pattern of Object.values(p.patterns))
      for (const lane of Object.values(pattern.lanes)) {
        if (lane.kind !== "steps") continue;
        // nothing written past the end of the page (a sign of a mistyped step string)
        lane.steps.forEach((s, i) => s.on && expect(i).toBeLessThan(pattern.stepCount));
      }
    expect(deserializeProject(JSON.parse(JSON.stringify(serializeProject(p))))).toEqual(p);
  });

  it("gives every song something to play on its first page", () => {
    for (const e of EXAMPLES) {
      const p = e.create();
      const first = p.patterns[p.slots[0].patternId];
      const on = Object.values(first.lanes).some((l) =>
        l.kind === "steps" ? l.steps.some((s) => s.on) : l.active,
      );
      expect(on, e.name).toBe(true);
    }
  });
});

describe("chord names", () => {
  it("builds chords and slash chords", () => {
    expect(chord("Dm", 4)).toEqual([62, 65, 69]);
    expect(chord("F#m7", 3)).toEqual([54, 57, 61, 64]);
    expect(chord("G#m/F#", 4)).toEqual([54, 68, 71, 75]);
    expect(note("Bb", 2)).toBe(46);
  });
});

describe("splitting long pages", () => {
  /** Every hit and note of a song at its absolute step, in order. */
  function events(p: import("../model/project").Project) {
    const out: string[] = [];
    let at = 0;
    for (const slot of p.slots) {
      const pattern = p.patterns[slot.patternId];
      for (let r = 0; r < slot.repeats; r++) {
        for (const [trackId, lane] of Object.entries(pattern.lanes)) {
          if (lane.kind !== "steps") continue;
          lane.steps.forEach((s, i) => {
            if (!s.on || i >= pattern.stepCount) return;
            const { on: _on, ...rest } = s;
            const name = p.tracks.find((t) => t.id === trackId)?.name;
            out.push(`${at + i} ${name} ${JSON.stringify(rest)}`);
          });
        }
        at += pattern.stepCount;
      }
    }
    return { events: out.sort(), length: at };
  }

  it("keeps the songs exactly the same, with pages of at most 32 steps", async () => {
    const { splitLongPages } = await import("./builder");
    for (const e of EXAMPLES.filter((x) => x.id === "neon-horizon" || x.id === "late-night-cafe")) {
      const p = e.create();
      for (const pattern of Object.values(p.patterns))
        expect(pattern.stepCount).toBeLessThanOrEqual(32);
      // the same song written with 64-step pages, split again: nothing to split
      const before = events(p);
      splitLongPages(p);
      expect(events(p)).toEqual(before);
    }
  });

  it("plays the parts in order, repeats as linked copies", async () => {
    const { emptyProject, drumTrack, page, drum, splitLongPages } = await import("./builder");
    const p = emptyProject("t", 120);
    const kick = drumTrack("Kick", "kit:909:kick", "909 Kick", "kick");
    p.tracks = [kick];
    const long = page(p, "Verse", 64, 2);
    drum(long, kick, "x".padEnd(32, ".") + "x".padEnd(32, "."));
    const short = page(p, "Fill", 16, 1);
    drum(short, kick, "xxxx");
    const before = events(p);
    splitLongPages(p);
    expect(events(p)).toEqual(before);
    expect(p.slots.map((s) => p.patterns[s.patternId].name)).toEqual([
      "Verse A",
      "Verse B",
      "Verse A",
      "Verse B",
      "Fill",
    ]);
    // the repeat is a linked copy: the same page
    expect(p.slots[0].patternId).toBe(p.slots[2].patternId);
  });
});
