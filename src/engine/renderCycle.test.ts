/**
 * P1.12: verify that offline step conditions match live playback.
 *
 * The concern: `render.ts` passes `cycle: r` (the repeat index within one section appearance)
 * while the transport's `cycles` Map is cumulative. For a section with `repeats=N`, the
 * transport increments cycles once per completed repeat, so cycle=0 during r=0, cycle=1 during
 * r=1, etc. This is exactly `r`, so both sides agree for a single section appearance.
 *
 * For clones (two different slot ids sharing a pattern), each slot has its own cycle counter in
 * the transport, and render.ts produces each as its own block with r starting at 0 — they also
 * agree.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("tone", () => ({ getDraw: () => ({ schedule: vi.fn(), cancel: vi.fn() }) }));
vi.mock("./metronome", () => ({ click: vi.fn(), silenceMetronome: vi.fn() }));
vi.mock("./ticker", () => ({ startTicker: vi.fn() }));
vi.mock("./engine", () => ({
  audioNow: () => 0,
  initEngine: vi.fn(),
  startClip: vi.fn(),
  stopAll: vi.fn(),
  stopClip: vi.fn(),
  panic: vi.fn(),
  effectsStep: vi.fn(),
  tempoStep: vi.fn(),
  releaseAutomation: vi.fn(),
  automateTarget: vi.fn(),
  automationState: () => ({ last: new Map(), live: false }),
  startRegion: vi.fn(),
  ungate: vi.fn(),
  trigger: vi.fn(),
}));
vi.mock("./automation", () => ({
  automationStep: vi.fn(),
  coveredTracks: () => new Set(),
  regionStep: vi.fn(),
}));
vi.mock("./offline", () => ({ renderOffline: vi.fn() }));

const { conditionPasses } = await import("./transport");
const { timeline } = await import("./render");
const { emptyProject, page } = await import("../templates/builder");

/** Simulate the transport's cycle sequence for a section with `repeats` total plays. */
function transportCyclesForSlot(repeats: number): number[] {
  const cycles: number[] = [];
  let count = 0;
  for (let r = 0; r < repeats; r++) {
    // cycle is read at the start of each repeat, before the increment
    cycles.push(count);
    count += 1; // incremented at atEnd, i.e. after this repeat completes
  }
  return cycles;
}

/** Collect cycle values from render.ts's timeline() for each entry. */
function renderCyclesFor(project: ReturnType<typeof emptyProject>): number[] {
  return timeline(project, { range: "song" }).entries.map((e) => e.cycle);
}

describe("conditionPasses (P1.12)", () => {
  it("fires unconditionally with no condition", () => {
    for (let cycle = 0; cycle < 4; cycle++) {
      expect(conditionPasses(undefined, cycle, false)).toBe(true);
    }
  });

  it("1:2 fires on even cycles (0, 2, 4…)", () => {
    expect(conditionPasses("1:2", 0, false)).toBe(true);
    expect(conditionPasses("1:2", 1, false)).toBe(false);
    expect(conditionPasses("1:2", 2, false)).toBe(true);
    expect(conditionPasses("1:2", 3, false)).toBe(false);
  });

  it("2:4 fires on cycle 1 out of every 4 (1, 5, 9…)", () => {
    expect(conditionPasses("2:4", 0, false)).toBe(false);
    expect(conditionPasses("2:4", 1, false)).toBe(true);
    expect(conditionPasses("2:4", 2, false)).toBe(false);
    expect(conditionPasses("2:4", 3, false)).toBe(false);
    expect(conditionPasses("2:4", 4, false)).toBe(false);
    expect(conditionPasses("2:4", 5, false)).toBe(true);
  });

  it("3:4 fires on cycle 2 out of every 4", () => {
    expect(conditionPasses("3:4", 2, false)).toBe(true);
    expect(conditionPasses("3:4", 6, false)).toBe(true);
    expect(conditionPasses("3:4", 0, false)).toBe(false);
    expect(conditionPasses("3:4", 1, false)).toBe(false);
    expect(conditionPasses("3:4", 3, false)).toBe(false);
  });

  it("FILL fires only when fill is true", () => {
    expect(conditionPasses("FILL", 0, true)).toBe(true);
    expect(conditionPasses("FILL", 0, false)).toBe(false);
    expect(conditionPasses("!FILL", 0, true)).toBe(false);
    expect(conditionPasses("!FILL", 0, false)).toBe(true);
  });
});

describe("offline cycle counting matches live transport (P1.12)", () => {
  it("transport and render produce the same cycles for a 4-repeat section", () => {
    const repeats = 4;
    // transport: increments after each completed repeat
    const live = transportCyclesForSlot(repeats);
    // render.ts: cycle = r (repeat index)
    const p = emptyProject("test", 120);
    page(p, "A", 16, repeats);
    const offline = renderCyclesFor(p);

    expect(live).toEqual([0, 1, 2, 3]);
    expect(offline).toEqual([0, 1, 2, 3]);
    expect(offline).toEqual(live);
  });

  it("clones (different slot ids, same pattern) each start their own cycle from 0", () => {
    const p = emptyProject("test", 120);
    // two sections with 2 repeats each
    page(p, "A", 16, 2);
    page(p, "B", 16, 2);

    const offline = renderCyclesFor(p);
    // A: [0,1], B: [0,1] — each slot is independent
    expect(offline).toEqual([0, 1, 0, 1]);

    // transport also resets per slot: the cycles Map is keyed by slot.id
    const liveA = transportCyclesForSlot(2);
    const liveB = transportCyclesForSlot(2);
    expect([...liveA, ...liveB]).toEqual(offline);
  });

  it("conditions give consistent results with both cycle sequences", () => {
    // section with 4 repeats: step with condition "2:4" should fire on repeat 1
    const repeats = 4;
    const live = transportCyclesForSlot(repeats);
    const p = emptyProject("test", 120);
    page(p, "A", 16, repeats);
    const offline = renderCyclesFor(p);

    const liveResults = live.map((c) => conditionPasses("2:4", c, false));
    const offlineResults = offline.map((c) => conditionPasses("2:4", c, false));
    // only repeat 1 (cycle=1) fires
    expect(liveResults).toEqual([false, true, false, false]);
    expect(offlineResults).toEqual(liveResults);

    // "1:2" fires on even cycles
    expect(live.map((c) => conditionPasses("1:2", c, false))).toEqual([true, false, true, false]);
    expect(offline.map((c) => conditionPasses("1:2", c, false))).toEqual(
      live.map((c) => conditionPasses("1:2", c, false)),
    );
  });
});
