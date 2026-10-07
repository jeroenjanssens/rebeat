import { describe, expect, it } from "vitest";
import { KIT_SOUNDS } from "../engine/kits";
import { SYNTH_PRESETS } from "../engine/instruments";
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
