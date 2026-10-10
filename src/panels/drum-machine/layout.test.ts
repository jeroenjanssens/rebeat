import { describe, expect, it } from "vitest";
import type { Pattern } from "../../model/types";
import { geometry } from "./layout";
import { ZOOM_LEVELS, nextZoomLevel } from "./zoom";

const BASE_PATTERN: Pattern = {
  id: "p1",
  name: "test",
  linkColor: "#fff",
  stepCount: 16,
  stepSize: "1/16",
  lanes: {},
};

describe("geometry() in fit mode", () => {
  it("fills available width with 16 steps in a regular-width panel", () => {
    // 1200px panel, regular size class
    const geo = geometry(1200, BASE_PATTERN, "regular", "fit");
    // available = 1200 - 292 - 104 - 40 = 764; gapsW for 16 steps @1/16 = (16-4)*3 + (4-1)*8 = 60
    // padW = (764 - 60) / 16 ≈ 44; floored to 1 decimal
    expect(geo.padW).toBeGreaterThan(0);
    expect(geo.padW).toBeGreaterThanOrEqual(18); // >= minPad
    // stepsW should roughly equal the available width
    expect(geo.stepsW).toBeLessThanOrEqual(764 + 1);
  });

  it("returns effectiveZoom reflecting padW/basePad in fit mode", () => {
    const geo = geometry(1200, BASE_PATTERN, "regular", "fit");
    // basePad for regular = 30
    expect(geo.effectiveZoom).toBeCloseTo(geo.padW / 30, 3);
  });

  it("enforces minimum pad size for a very narrow panel", () => {
    // 400px — too narrow for 16 steps at their minimum
    const geo = geometry(400, BASE_PATTERN, "regular", "fit");
    expect(geo.padW).toBeGreaterThanOrEqual(18); // minPad for regular
  });

  it("does not cap padW when few steps fill a wide panel", () => {
    // 4-step pattern in a huge panel should give big pads
    const geo = geometry(1200, { ...BASE_PATTERN, stepCount: 4 }, "regular", "fit");
    // available ≈ 764; with 4 steps and 1 group gapsW = 0 + 0 = 0 → padW ≈ 191
    expect(geo.padW).toBeGreaterThan(50);
  });

  it("keeps the nominal padH whatever the step count (pages don't change the rows' height)", () => {
    const many = geometry(400, { ...BASE_PATTERN, stepCount: 64 }, "regular", "fit");
    const few = geometry(1200, { ...BASE_PATTERN, stepCount: 2 }, "regular", "fit");
    expect(many.padH).toBe(32);
    expect(few.padH).toBe(32);
  });
});

describe("geometry() in number mode", () => {
  it("sets padW to basePad × zoom exactly", () => {
    // basePad for regular = 30; zoom = 1.5 → padW = 45
    const geo = geometry(1200, BASE_PATTERN, "regular", 1.5);
    expect(geo.padW).toBe(Math.floor(30 * 1.5 * 10) / 10); // 45.0
  });

  it("returns effectiveZoom equal to zoom", () => {
    const geo = geometry(1200, BASE_PATTERN, "regular", 1.5);
    expect(geo.effectiveZoom).toBe(1.5);
  });

  it("at 100% uses the base pad width", () => {
    const geo = geometry(1200, BASE_PATTERN, "regular", 1.0);
    expect(geo.padW).toBe(Math.floor(30 * 1.0 * 10) / 10); // 30.0
  });

  it("at 50% uses half the base pad width", () => {
    const geo = geometry(1200, BASE_PATTERN, "regular", 0.5);
    expect(geo.padW).toBe(Math.floor(30 * 0.5 * 10) / 10); // 15.0
  });

  it("does not fit to available width in number mode", () => {
    // Same panel width, different zoom → different padW independent of available width
    const geo1 = geometry(1200, BASE_PATTERN, "regular", 1.0);
    const geo2 = geometry(600, BASE_PATTERN, "regular", 1.0);
    expect(geo1.padW).toBe(geo2.padW); // fixed, not fitted
  });

  it("large pads can exceed the panel width (scroll)", () => {
    const geo = geometry(1200, BASE_PATTERN, "regular", 2.5);
    // padW = 75; 16 steps could easily exceed available width
    expect(geo.padW).toBe(Math.floor(30 * 2.5 * 10) / 10); // 75.0
  });
});

describe("geometry() groups and stepsW", () => {
  it("builds groups correctly for 16 steps at 1/16", () => {
    const geo = geometry(1200, BASE_PATTERN, "regular", 1.0);
    // spb = 4, groupSize = 4, 4 groups of 4
    expect(geo.groups).toHaveLength(4);
    expect(geo.groups[0].indices).toEqual([0, 1, 2, 3]);
    expect(geo.groups[0].barStart).toBe(false);
    // stepsPerBar = 16, so no barStart within 16 steps
    expect(geo.groups.every((g) => !g.barStart || g === geo.groups[0])).toBe(true);
  });

  it("marks barStart for the second bar of a 32-step pattern", () => {
    const geo = geometry(1200, { ...BASE_PATTERN, stepCount: 32 }, "regular", 1.0);
    // barStart at index 16 → group 4 (groups[4])
    expect(geo.groups[4].barStart).toBe(true);
  });
});

describe("nextZoomLevel()", () => {
  it("steps up through levels from a number", () => {
    expect(nextZoomLevel(1.0, 1, 1.0)).toBe(1.1);
    expect(nextZoomLevel(1.1, 1, 1.1)).toBe(1.25);
    expect(nextZoomLevel(0.9, 1, 0.9)).toBe(1.0);
  });

  it("steps down through levels from a number", () => {
    expect(nextZoomLevel(1.0, -1, 1.0)).toBe(0.9);
    expect(nextZoomLevel(0.9, -1, 0.9)).toBe(0.8);
    expect(nextZoomLevel(1.25, -1, 1.25)).toBe(1.1);
  });

  it("clamps at the min and max levels", () => {
    expect(nextZoomLevel(0.5, -1, 0.5)).toBe(0.5); // already at minimum
    expect(nextZoomLevel(2.5, 1, 2.5)).toBe(2.5); // already at maximum
  });

  it("steps from Fit using effectiveZoom", () => {
    // effectiveZoom = 0.95 → nearest level above is 1.0
    expect(nextZoomLevel("fit", 1, 0.95)).toBe(1.0);
    // effectiveZoom = 0.95 → nearest level below is 0.9
    expect(nextZoomLevel("fit", -1, 0.95)).toBe(0.9);
  });

  it("always returns a number (never 'fit')", () => {
    expect(typeof nextZoomLevel("fit", 1, 1.0)).toBe("number");
    expect(typeof nextZoomLevel(1.0, 1, 1.0)).toBe("number");
  });

  it("handles custom (between-level) zoom values", () => {
    // 1.33 (typed custom) → step up goes to 1.5, step down to 1.25
    expect(nextZoomLevel(1.33, 1, 1.33)).toBe(1.5);
    expect(nextZoomLevel(1.33, -1, 1.33)).toBe(1.25);
  });

  it("covers all levels stepping up from 0.5", () => {
    let z: number | "fit" = ZOOM_LEVELS[0];
    const visited: number[] = [z as number];
    for (let i = 1; i < ZOOM_LEVELS.length; i++) {
      z = nextZoomLevel(z, 1, z as number);
      visited.push(z as number);
    }
    expect(visited).toEqual(ZOOM_LEVELS);
  });
});
