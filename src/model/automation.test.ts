import { describe, expect, it } from "vitest";
import { demoProject } from "../templates/nightDrive";
import { makeEffect } from "./effects";
import { EFFECT_PARAMS, EFFECT_TYPES } from "./params";
import { KNOB_SECTIONS, paramOf, toKnob } from "./patchParams";
import { applyMacros } from "./synth";
import { effectivePatch, trackPatch } from "../library/synthTrack";
import {
  NOT_AUTOMATABLE,
  automatableKnobs,
  effectNames,
  isAutomatable,
  knobFor,
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

  it("every knob of a synth is automatable, but a global LFO's phase (D226)", () => {
    const p = demoProject();
    const bass = p.tracks.find((t) => t.name === "Bass")!;
    const patch = trackPatch(bass);
    const t = `track:${bass.id}:synth:`;
    for (const d of KNOB_SECTIONS.flatMap((s) => s.params)) {
      const lfo = /^lfos\.(\d)\.phase$/.exec(d.path);
      const global = lfo && patch.lfos[Number(lfo[1])].mode === "global";
      expect(isAutomatable(p, t + d.path), d.path).toBe(!global);
      expect(pickerKnobs(p).some((k) => k.target === t + d.path)).toBe(true);
    }
    const cutoff = knobFor(p, `${t}filters.0.cutoff`)!;
    expect(cutoff.section).toBe("Synth");
    expect(cutoff.part?.name).toBe("Filter 1");
    expect(cutoff.label).toBe("Bass · Filter 1 · Cutoff");
    expect(knobFor(p, `${t}osc.0.phase`)!.note).toMatch(/next note/);
    // the knob's value is where its editor shows it (macros applied)
    const heard = applyMacros(effectivePatch(bass));
    const d = paramOf("filters.0.cutoff")!;
    expect(knobValue(p, `${t}filters.0.cutoff`)).toBeCloseTo(toKnob(d, heard.filters[0].cutoff), 6);
    // knobs that a macro moves say so
    const moved = heard.macros[0].targets[0]?.path;
    if (moved && paramOf(moved)) expect(knobFor(p, t + moved)!.note).toMatch(/moves this too/);
  });

  it("the lists are made once per project", () => {
    const p = demoProject();
    expect(pickerKnobs(p)).toBe(pickerKnobs(p));
    expect(automatableKnobs(p)).toBe(automatableKnobs(p));
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
