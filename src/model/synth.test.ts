import { describe, expect, it } from "vitest";
import {
  INIT_PATCH,
  makePatch,
  noteLengthQuarters,
  sanitizePatch,
  upgradePatch,
  upgradeV1,
  withKnobs,
} from "./synth";
import { makePatch as makeV1 } from "./synthV1";

describe("synth patches (version 2)", () => {
  it("fill in defaults; oscillators named in a spec are on", () => {
    const p = makePatch({ osc: [{ shape: 3 }, { level: 0.5 }], filters: [{ model: "ladder" }] });
    expect(p.version).toBe(2);
    expect(p.osc[0]).toMatchObject({ on: true, shape: 3, pw: 0.5, unison: 1 });
    expect(p.osc[1]).toMatchObject({ on: true, level: 0.5 });
    expect(p.osc[2].on).toBe(false);
    expect(p.filters[0].model).toBe("ladder");
    expect(p.matrix).toHaveLength(8);
    expect(p.macros.map((m) => m.name)).toContain("Brightness");
    // no shared objects with the defaults
    p.envs[0].attack = 3;
    expect(INIT_PATCH.envs[0].attack).toBe(0.005);
  });

  it("keep values in range", () => {
    const p = makePatch({ osc: [{ unison: 30, shape: 9 }], voice: { voices: 99 } });
    p.filters[0].cutoff = Number.NaN;
    const s = sanitizePatch(p);
    expect(s.osc[0].unison).toBe(8);
    expect(s.osc[0].shape).toBe(3);
    expect(s.voice.voices).toBe(16);
    expect(s.filters[0].cutoff).toBe(20);
  });

  it("measure note lengths in quarter notes", () => {
    expect(noteLengthQuarters("1/4")).toBe(1);
    expect(noteLengthQuarters("1/8.")).toBe(0.75);
    expect(noteLengthQuarters("1/8T")).toBeCloseTo(1 / 3);
    expect(noteLengthQuarters("2/1")).toBe(8);
  });
});

describe("upgrading version 1 patches", () => {
  it("keeps the oscillators, filter, envelopes and voice", () => {
    const v1 = makeV1({
      mono: true,
      glide: 0.05,
      osc1: { wave: "sawtooth", unison: 3, spread: 22 },
      osc2: { wave: "pulse", width: 0.3, level: 0.5, octave: -1 },
      filter: { cutoff: 140, reso: 9, slope: 24, env: 3.6 },
      amp: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.1 },
      volume: -15,
    });
    const p = upgradeV1(v1);
    expect(p.osc[0]).toMatchObject({ shape: 2, unison: 3, detune: 22, on: true });
    expect(p.osc[1]).toMatchObject({ shape: 3, pw: 0.3, level: 0.5, octave: -1 });
    // a 24 dB low-pass becomes the ladder
    expect(p.filters[0]).toMatchObject({ model: "ladder", type: "lp", cutoff: 140, env: 3.6 });
    expect(p.filters[0].reso).toBeGreaterThan(0.6);
    expect(p.envs[0]).toMatchObject({ attack: 0.01, sustain: 0.6, release: 0.1 });
    expect(p.voice).toMatchObject({ mode: "mono", glide: 0.05 });
    expect(p.output.volume).toBe(-15);
  });

  it("turns FM into a modulating oscillator 3 with an envelope, and the LFO into a matrix slot", () => {
    const v1 = makeV1({
      fm: { ratio: 2, index: 5, decay: 1 },
      lfo: { target: "filter", depth: 0.5, sync: "1/8", shape: "sawtooth" },
    });
    const p = upgradeV1(v1);
    expect(p.osc[2]).toMatchObject({ on: true, shape: 0, level: 0, octave: 1, semi: 0 });
    expect(p.fm.route).toBe("3>1");
    expect(p.envs[2].decay).toBe(1);
    expect(p.matrix[0]).toMatchObject({ source: "lfo1", dest: "filter1.cutoff" });
    expect(p.matrix[1]).toMatchObject({ source: "env3", dest: "fm", amount: 5 / 40 });
    // version 1 synced one LFO cycle to four steps: 4 eighths = a half note
    expect(p.lfos[0]).toMatchObject({ sync: "1/2", shape: "rampUp" });
  });

  it("reads anything: version 2 as is, version 1 upgraded, nothing as the init patch", () => {
    const v2 = makePatch({ osc: [{ shape: 1 }] });
    expect(upgradePatch(v2)).toEqual(sanitizePatch(v2));
    expect(upgradePatch(makeV1({})).version).toBe(2);
    expect(upgradePatch(undefined)).toEqual(sanitizePatch(INIT_PATCH));
  });

  it("applies moved SOUND knobs", () => {
    const p = withKnobs(makePatch({ envs: [{ attack: 0.5 }] }), {
      "sound.attack": 0.05,
      "sound.release": 0,
    });
    expect(p.envs[0].attack).toBe(0.5);
    expect(p.envs[0].release).toBeCloseTo(0.001);
  });
});
