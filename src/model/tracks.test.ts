import { describe, expect, it } from "vitest";
import { makeTrack } from "./project";
import { canClip, defaultMode, hitNoteOf, hitNotes, player } from "./tracks";
import type { Sound, TrackMode } from "./types";

const sample: Sound = { source: "sample", sampleId: "kit:909:kick" };
const synth: Sound = { source: "synth", preset: "acid" };
const piano: Sound = { source: "smplr", preset: "piano" };
const multi: Sound = { source: "multi", zones: [{ note: 48, sampleId: "a" }], rootNote: 48 };

describe("step tracks: which sound plays in which mode (D93)", () => {
  it.each<[string, Sound | undefined, TrackMode, string]>([
    ["a sample", sample, "hits", "drum"],
    ["a sample", sample, "notes", "voice"],
    ["a sample", sample, "clip", "clip"],
    ["a synth", synth, "hits", "voice"],
    ["a synth", synth, "notes", "voice"],
    ["a sampled instrument", piano, "hits", "voice"],
    ["a sampled instrument", piano, "notes", "voice"],
    ["a multi-sample", multi, "hits", "voice"],
    ["nothing yet", undefined, "hits", "drum"],
    ["nothing yet", undefined, "clip", "clip"],
  ])("%s in %s mode plays through the %s player", (_, sound, mode, want) => {
    expect(player({ mode, sound })).toBe(want);
  });

  it("plays clips of samples only", () => {
    expect(canClip(sample)).toBe(true);
    expect(canClip(undefined)).toBe(true);
    expect(canClip(synth)).toBe(false);
    expect(canClip(piano)).toBe(false);
  });

  it("gives a new track the mode of its sound", () => {
    expect(defaultMode(sample)).toBe("hits");
    expect(defaultMode(sample, true)).toBe("clip");
    expect(defaultMode(synth)).toBe("notes");
    expect(defaultMode(piano)).toBe("notes");
  });

  it("hits a voice at its hit note plus the step's pitch, for the step's gate", () => {
    const bass = makeTrack("hits", "bass", "b", "b", [], synth);
    const keys = makeTrack("hits", "keys", "k", "k", [], piano);
    expect(hitNoteOf(bass)).toBe(36);
    expect(hitNoteOf(keys)).toBe(60);
    expect(hitNoteOf(makeTrack("hits", "keys", "m", "m", [], multi))).toBe(48);
    keys.hitNote = 72;
    expect(hitNotes(keys, 0.7, -5, 0.5)).toEqual([{ pitch: 67, length: 0.5, velocity: 0.7 }]);
    // a gate of 0 still sounds
    expect(hitNotes(keys, 1, 0, 0)[0].length).toBe(0.1);
  });
});
