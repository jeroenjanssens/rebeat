import { describe, expect, it } from "vitest";
import { makeTrack } from "../model/project";
import { migrate } from "../model/schema";
import { applyMacros } from "../model/synth";
import { factorySynth } from "./synths";
import {
  convertSynthKnobs,
  effectivePatch,
  macroValues,
  setSynthParam,
  soundDefs,
} from "./synthTrack";
import { SOUND_PARAMS } from "../model/params";
import type { Track } from "../model/types";

const synthTrack = (): Track => {
  const t = makeTrack("instrument", "keys", "Lead", "Synth");
  t.instrument = { source: "synth", preset: "acid" };
  return t;
};

describe("synth tracks", () => {
  it("have the patch's macros as SOUND knobs; other tracks keep theirs", () => {
    const t = synthTrack();
    const defs = soundDefs(t, SOUND_PARAMS.instrument);
    expect(defs.map((d) => d.label)).toEqual(factorySynth("acid")!.patch.macros.map((m) => m.name));
    expect(defs[0].id).toBe("macro1");
    const s = makeTrack("instrument", "keys", "Keys", "Piano");
    s.instrument = { source: "smplr", preset: "piano" };
    expect(soundDefs(s, SOUND_PARAMS.instrument)).toBe(SOUND_PARAMS.instrument);
  });

  it("play the macros where the SOUND knobs are", () => {
    const t = synthTrack();
    const rest = applyMacros(effectivePatch(t)).filters[0].cutoff;
    t.params["sound.macro1"] = 1;
    expect(macroValues(t)[0]).toBe(1);
    expect(applyMacros(effectivePatch(t)).filters[0].cutoff).toBeGreaterThan(rest * 4);
  });

  it("edit a copy of the factory synth, keeping the macros' place", () => {
    const t = synthTrack();
    t.params["sound.macro1"] = 0.8;
    setSynthParam(t, "filters.0.cutoff", 900);
    expect(t.instrument!.patch).toBeTruthy();
    expect(applyMacros(effectivePatch(t)).filters[0].cutoff).toBeCloseTo(900, 3);
    expect(factorySynth("acid")!.patch.filters[0].cutoff).not.toBe(900);
  });

  it("turn moved SOUND knobs into patch edits, once", () => {
    const t = synthTrack();
    t.params["sound.attack"] = 0.5;
    t.params["sound.cutoff"] = 0.45;
    expect(convertSynthKnobs(t)).toBe(true);
    const p = t.instrument!.patch!;
    // 1 ms × 4000^0.5 = 63 ms
    expect(p.envs[0].attack).toBeCloseTo(0.063, 3);
    expect(p.filters[1]).toMatchObject({ on: true, model: "svf", type: "lp" });
    expect(p.filters[1].cutoff).toBeCloseTo(20 * Math.pow(1000, 0.45), 3);
    expect(t.params["sound.attack"]).toBe(0.05);
    expect(t.params["sound.cutoff"]).toBe(1);
    expect(convertSynthKnobs(t)).toBe(false);
  });

  it("are converted when an older project loads", () => {
    const t = synthTrack();
    t.params["sound.release"] = 0.8;
    const project = {
      tracks: [t],
      patterns: {
        p1: {
          lanes: {
            [t.id]: { kind: "steps", steps: [{ on: true, locks: { "sound.release": 0.1 } }] },
          },
        },
      },
    };
    const p = migrate({ format: "rebeat-project", schemaVersion: 5, project }) as unknown as {
      tracks: Track[];
      patterns: Record<string, { lanes: Record<string, { steps: { locks?: object }[] }> }>;
    };
    expect(p.tracks[0].instrument!.patch!.envs[0].release).toBeCloseTo(
      Math.pow(8000, 0.8) / 1000,
      3,
    );
    expect(p.patterns.p1.lanes[t.id].steps[0].locks).toBeUndefined();
  });
});
