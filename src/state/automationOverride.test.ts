/**
 * Tests for P1.1 (redo doesn't override lanes) and P1.2 (redo respects 200-step cap).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { backToAutomation, useOverrides, watchOverrides } from "./automationOverride";
import { useStore } from "./store";
import { demoProject } from "../templates/nightDrive";
import { uid } from "../model/id";

describe("undo/redo and automation overrides (P1.1)", () => {
  beforeEach(() => {
    useStore.getState().loadProject(demoProject(), "test");
    backToAutomation();
  });

  it("committing a knob change on an automated target marks the lane overridden", () => {
    const s = useStore.getState();
    const trackId = s.project.tracks[0].id;
    // "track:<id>:volume" is the correct target for t.volume (knobValue returns t.volume for key="volume")
    const target = `track:${trackId}:volume`;

    // add an automation lane for this target
    s.commit((p) => {
      p.automation = [{ id: uid("auto"), target, on: true, points: [] }];
    });

    const unsub = watchOverrides();

    // change the volume: knobValue reads t.volume, so the override fires
    s.commit((p) => {
      p.tracks[0].volume = (p.tracks[0].volume + 0.01) % 1;
    });

    expect(useOverrides.getState().overridden[target]).toBe(true);
    unsub();
  });

  it("undoing does not mark the lane overridden (P1.1)", () => {
    const s = useStore.getState();
    const trackId = s.project.tracks[0].id;
    const target = `track:${trackId}:volume`;

    s.commit((p) => {
      p.automation = [{ id: uid("auto"), target, on: true, points: [] }];
    });
    s.commit((p) => {
      p.tracks[0].volume = 0.5;
    });
    backToAutomation();

    const unsub = watchOverrides();

    // undo: this should NOT trigger an override
    useStore.getState().undo();
    expect(useOverrides.getState().overridden[target]).toBeUndefined();
    unsub();
  });

  it("redoing does not mark the lane overridden (P1.1)", () => {
    const s = useStore.getState();
    const trackId = s.project.tracks[0].id;
    const target = `track:${trackId}:volume`;

    s.commit((p) => {
      p.automation = [{ id: uid("auto"), target, on: true, points: [] }];
    });
    s.commit((p) => {
      p.tracks[0].volume = 0.5;
    });
    useStore.getState().undo();
    backToAutomation();

    const unsub = watchOverrides();

    // redo: should NOT trigger an override
    useStore.getState().redo();
    expect(useOverrides.getState().overridden[target]).toBeUndefined();
    unsub();
  });
});

describe("redo history cap (P1.2)", () => {
  beforeEach(() => useStore.getState().loadProject(demoProject(), "test"));

  it("past stays at 200 after 200 commits, undo, and redo", () => {
    const s = useStore.getState();
    // pass a unique key each time so commits don't merge (no key = no merge already, but
    // use i to vary the bpm and ensure each produces a new project)
    for (let i = 0; i < 200; i++) {
      s.commit((p) => void (p.bpm = 60 + i));
    }
    expect(useStore.getState().past).toHaveLength(200);

    useStore.getState().undo();
    useStore.getState().redo();

    // after redo, past should still be at 200, not 201
    expect(useStore.getState().past).toHaveLength(200);
  });
});
