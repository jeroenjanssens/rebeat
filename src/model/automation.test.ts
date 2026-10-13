import { describe, expect, it } from "vitest";
import { demoProject } from "../templates/nightDrive";
import { makeEffect } from "./effects";
import { EFFECT_PARAMS, EFFECT_TYPES } from "./params";
import {
  NOT_AUTOMATABLE,
  automatableKnobs,
  effectNames,
  isAutomatable,
  knobValue,
  pickerKnobs,
  thinPoints,
} from "./automation";

describe("automatable knobs (D189)", () => {
  it("every knob resolves to a value and a definition", () => {
    const p = demoProject();
    const knobs = automatableKnobs(p);
    expect(knobs.length).toBeGreaterThan(p.tracks.length * 5);
    for (const k of knobs) {
      expect(knobValue(p, k.target)).toBeGreaterThanOrEqual(0);
      expect(k.def.format(0.5)).toBeTruthy();
    }
  });

  it("a synth's SOUND knobs are its macros; a sample's filter; master and bus levels", () => {
    const p = demoProject();
    const bass = p.tracks.find((t) => t.name === "Bass")!;
    const kick = p.tracks.find((t) => t.name === "Kick")!;
    expect(isAutomatable(p, `track:${bass.id}:sound.macro1`)).toBe(true);
    expect(isAutomatable(p, `track:${bass.id}:sound.cutoff`)).toBe(false);
    expect(isAutomatable(p, `track:${kick.id}:sound.cutoff`)).toBe(true);
    // per hit, not continuous: not automatable
    expect(isAutomatable(p, `track:${kick.id}:sound.tune`)).toBe(false);
    expect(isAutomatable(p, "master:volume")).toBe(true);
    expect(isAutomatable(p, `bus:${p.buses[0].id}`)).toBe(true);
  });

  it("every effect knob is automatable but the ones that rebuild it, and every On (D206, D207)", () => {
    const p = demoProject();
    const kick = p.tracks.find((t) => t.name === "Kick")!;
    kick.effects = EFFECT_TYPES.map((name) => makeEffect(name));
    kick.effects[0].bypass = true;
    const knobs = pickerKnobs(p).filter((k) => k.target.startsWith(`track:${kick.id}:fx:`));
    for (const fx of kick.effects) {
      for (const def of EFFECT_PARAMS[fx.name]) {
        const target = `track:${kick.id}:fx:${fx.id}:${def.id}`;
        expect(knobs.some((k) => k.target === target)).toBe(true);
        expect(isAutomatable(p, target)).toBe(!NOT_AUTOMATABLE[fx.name]?.[def.id]);
      }
      expect(isAutomatable(p, `track:${kick.id}:fx:${fx.id}:on`)).toBe(true);
    }
    expect(knobValue(p, `track:${kick.id}:fx:${kick.effects[0].id}:on`)).toBe(0);
    expect(knobValue(p, `track:${kick.id}:fx:${kick.effects[1].id}:on`)).toBe(1);
    const tremolo = knobs.find((k) => k.effect?.name === "Tremolo" && k.name === "Spread")!;
    expect(tremolo.section).toBe("Effects");
    expect(tremolo.label).toBe("Kick · Tremolo Spread");
  });

  it("names a second effect of a kind with a number", () => {
    const fx = ["Delay", "Tremolo", "Delay"].map((n) => makeEffect(n));
    expect(effectNames(fx)).toEqual(["Delay", "Tremolo", "Delay 2"]);
  });

  it("thinning keeps a ramp's shape with few points", () => {
    const ramp = Array.from({ length: 50 }, (_, i) => ({ q: i, value: i / 49 }));
    expect(thinPoints(ramp)).toHaveLength(2);
    const vee = [...ramp, ...ramp.map((p) => ({ q: 50 + p.q, value: 1 - p.value }))];
    expect(thinPoints(vee).length).toBeLessThanOrEqual(4);
  });
});
