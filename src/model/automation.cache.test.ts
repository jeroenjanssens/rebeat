/**
 * P4.1: knobLists cache tests. Verify that the new per-part caches give the same results as the
 * raw uncached builder, that a knob-param commit is a hit (same array identity per track), and
 * that adding an effect or changing a sound is a miss.
 */
import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { demoProject } from "../templates/nightDrive";
import { makeEffect } from "./effects";
import { automatableKnobs, buildPickerKnobs, pickerKnobs } from "./automation";

describe("knobLists cache (P4.1)", () => {
  it("cached result matches a fresh uncached build for demoProject", () => {
    const p = demoProject();
    const cached = pickerKnobs(p);
    const fresh = buildPickerKnobs(p);
    expect(cached).toHaveLength(fresh.length);
    for (let i = 0; i < cached.length; i++) {
      expect(cached[i].target, `target at ${i}`).toBe(fresh[i].target);
      expect(cached[i].label, `label at ${i}`).toBe(fresh[i].label);
    }
  });

  it("same identity on a repeated call to the same project", () => {
    const p = demoProject();
    expect(pickerKnobs(p)).toBe(pickerKnobs(p));
    expect(automatableKnobs(p)).toBe(automatableKnobs(p));
  });

  it("knob-param commit: combined list is the same identity (track.effects unchanged = cache hit)", () => {
    const p = demoProject();
    const before = pickerKnobs(p);

    // change only a track's param (volume) — track.effects and track.sound are unchanged,
    // so cachedTrackKnobs hits for every track, and the combined list hits too
    const after = produce(p, (draft) => {
      draft.tracks[0].volume = (draft.tracks[0].volume + 0.05) % 1;
    });

    expect(pickerKnobs(after)).toBe(before);
  });

  it("step edit: combined list hits (tracks/buses/master unchanged)", () => {
    const p = demoProject();
    const before = pickerKnobs(p);

    // a step edit changes only patterns, not tracks/buses/master
    const after = produce(p, (draft) => {
      const patternId = Object.keys(draft.patterns)[0];
      const pattern = draft.patterns[patternId];
      const trackId = draft.tracks[0].id;
      const lane = (pattern.lanes[trackId] ??= { steps: Array(128).fill({ on: false, velocity: 0.8, probability: 1, nudge: 0, ratchet: 1, pitch: 0, gate: 1, accent: false }) });
      lane.steps[0] = { ...lane.steps[0], on: !lane.steps[0].on };
    });

    // tracks/buses/master unchanged → combined list must be the same object
    expect(pickerKnobs(after)).toBe(before);
  });

  it("adding an effect causes a miss (new track.effects array)", () => {
    const p = demoProject();
    const before = pickerKnobs(p);

    const after = produce(p, (draft) => {
      draft.tracks[0].effects.push(makeEffect("Delay"));
    });

    const afterKnobs = pickerKnobs(after);
    // The modified track's effects changed → its part must be rebuilt → new entries
    expect(afterKnobs).not.toBe(before);
    expect(afterKnobs.length).toBeGreaterThan(before.length);
  });

  it("changing a sound causes a miss (new track.sound reference)", () => {
    const p = demoProject();
    const before = pickerKnobs(p);

    const after = produce(p, (draft) => {
      // change the sound to undefined (a silent track): no macros, different list
      draft.tracks[0].sound = undefined;
    });

    const afterKnobs = pickerKnobs(after);
    expect(afterKnobs).not.toBe(before);
  });
});
