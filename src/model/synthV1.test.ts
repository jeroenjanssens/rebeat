import { describe, expect, it } from "vitest";
import { INIT_PATCH, makePatch, sanitizePatch, withKnobs } from "./synthV1";

describe("synth patches", () => {
  it("fill in defaults from a compact spec, without sharing objects", () => {
    const p = makePatch({ mono: true, osc1: { wave: "square" }, filter: { cutoff: 400 } });
    expect(p.mono).toBe(true);
    expect(p.osc1).toEqual({ ...INIT_PATCH.osc1, wave: "square" });
    expect(p.filter.cutoff).toBe(400);
    expect(p.filter.type).toBe("lowpass");
    p.osc2.level = 1;
    expect(INIT_PATCH.osc2.level).toBe(0);
  });

  it("keep values in range", () => {
    const p = sanitizePatch(
      makePatch({
        osc1: { unison: 30, octave: 9.4 },
        filter: { cutoff: 1e6, reso: -1 },
        volume: 99,
      }),
    );
    expect(p.osc1.unison).toBe(7);
    expect(p.osc1.octave).toBe(3);
    expect(p.filter.cutoff).toBe(20000);
    expect(p.filter.reso).toBe(0.1);
    expect(p.volume).toBe(6);
  });

  it("apply only the knobs you moved", () => {
    const p = makePatch({ amp: { attack: 0.5, release: 2 }, glide: 0.1 });
    // knobs at rest: the patch's own values
    expect(withKnobs(p, { "sound.attack": 0.05, "sound.release": 0.35 })).toEqual(p);
    const k = withKnobs(p, { "sound.attack": 0, "sound.detune": 1 });
    expect(k.amp.attack).toBeCloseTo(0.001);
    expect(k.amp.release).toBe(2);
    expect(k.osc1.detune).toBe(100);
    expect(k.glide).toBe(0.1);
    // the original stays as it was
    expect(p.amp.attack).toBe(0.5);
  });
});
