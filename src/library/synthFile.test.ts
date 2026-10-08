import { describe, expect, it } from "vitest";
import { makeTrack } from "../model/project";
import { parseSynthFile, synthFile } from "./synthFile";
import { factorySynth } from "./synths";

describe(".rbsynth files", () => {
  it("carry the patch, where the macros are and the effects", () => {
    const t = makeTrack("instrument", "keys", "Lead", "Synth");
    t.instrument = { source: "synth", preset: "acid" };
    t.params["sound.macro2"] = 0.9;
    t.effects = [{ id: "fx1", name: "Chorus", params: {}, bypass: false } as never];
    const back = parseSynthFile(JSON.stringify(synthFile(t, "My acid")));
    expect(back.name).toBe("My acid");
    expect(back.patch).toEqual(factorySynth("acid")!.patch);
    expect(back.macros[1]).toBe(0.9);
    expect(back.macros[0]).toBe(factorySynth("acid")!.patch.macros[0].value);
    expect(back.effects[0]).toMatchObject({ name: "Chorus" });
  });

  it("refuse other files, and upgrade older patches", () => {
    expect(() => parseSynthFile("{}")).toThrow("not a synth file");
    expect(() => parseSynthFile("nope")).toThrow("not a synth file");
    expect(() =>
      parseSynthFile(JSON.stringify({ format: "rebeat-synth", version: 9, patch: {} })),
    ).toThrow("newer");
    const old = parseSynthFile(
      JSON.stringify({ format: "rebeat-synth", version: 1, name: "Old", patch: { osc1: {} } }),
    );
    expect(old.patch.version).toBe(2);
    expect(old.macros).toHaveLength(8);
  });
});
