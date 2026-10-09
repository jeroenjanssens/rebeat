import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { slotPattern } from "../model/project";
import { setStepVelocity, stepVelocity, type Lane } from "../model/types";
import { demoProject } from "../templates/nightDrive";

const trigger = vi.fn();
vi.mock("tone", () => ({}));
vi.mock("./metronome", () => ({ click: vi.fn() }));
vi.mock("./ticker", () => ({ startTicker: vi.fn() }));
vi.mock("./engine", () => ({
  audioNow: () => 0,
  initEngine: vi.fn(),
  startClip: vi.fn(),
  stopAll: vi.fn(),
  stopClip: vi.fn(),
  panic: vi.fn(),
  effectsStep: vi.fn(),
  ungate: vi.fn(),
  trigger: (...args: unknown[]) => trigger(...args),
}));

const { playPageStep } = await import("./transport");

/** The demo with one lit step on a drum and an instrument track, on an otherwise empty page. */
function setup() {
  const p = demoProject();
  const pattern = slotPattern(p, p.slots[1].id);
  const drum = p.tracks[0];
  const inst = p.tracks.find((t) => t.mode === "notes")!;
  for (const t of p.tracks) {
    const lane = pattern.lanes[t.id];
    if (lane) for (const s of lane.steps) Object.assign(s, { on: false, accent: false });
    if (lane && t.mode === "clip") lane.clip = { active: false, launchMode: "loop" };
  }
  const dStep = (pattern.lanes[drum.id] as Lane).steps[0];
  const iStep = (pattern.lanes[inst.id] as Lane).steps[0];
  dStep.on = true;
  iStep.on = true;
  iStep.notes = [
    { pitch: 48, length: 1, velocity: 0.8 },
    { pitch: 55, length: 1, velocity: 0.4 },
  ];
  return { p, pattern, drum, inst, dStep, iStep };
}

const callFor = (trackId: string) =>
  trigger.mock.calls.find(([t]) => (t as { id: string }).id === trackId);

describe("playPageStep", () => {
  beforeEach(() => trigger.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it("plays a drum step's velocity and an instrument step's note velocities", () => {
    const { p, pattern, drum, inst, dStep, iStep } = setup();
    setStepVelocity(dStep, 0.3);
    setStepVelocity(iStep, 0.5);
    playPageStep(p, pattern, 0, 10, 0.125, 0, false);
    expect(callFor(drum.id)![1]).toBe(0.3);
    const notes = (callFor(inst.id)![2] as { notes: { velocity: number }[] }).notes;
    // the chord keeps its balance: the loudest note gets the value
    expect(notes.map((n) => n.velocity)).toEqual([0.5, 0.25]);
    expect(stepVelocity(iStep)).toBe(0.5);
  });

  it("applies probability and nudge on drum and instrument tracks", () => {
    const { p, pattern, drum, inst, dStep, iStep } = setup();
    dStep.nudge = 0.2;
    iStep.nudge = -0.1;
    dStep.probability = 0.5;
    iStep.probability = 0.5;
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    playPageStep(p, pattern, 0, 10, 0.125, 0, false);
    expect((callFor(drum.id)![2] as { time: number }).time).toBeCloseTo(10 + 0.2 * 0.125);
    expect((callFor(inst.id)![2] as { time: number }).time).toBeCloseTo(10 - 0.1 * 0.125);
    trigger.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    playPageStep(p, pattern, 0, 10, 0.125, 0, false);
    expect(callFor(drum.id)).toBeUndefined();
    expect(callFor(inst.id)).toBeUndefined();
  });

  it("passes hits their pitch and gate, and only Notes their notes", () => {
    const { p, pattern, drum, inst, dStep, iStep } = setup();
    dStep.pitch = 3;
    dStep.gate = 0.5;
    // a Notes track's step also has a hit pitch, and a Hits track may keep notes
    dStep.notes = [{ pitch: 72, length: 1, velocity: 1 }];
    playPageStep(p, pattern, 0, 10, 0.125, 0, false);
    const hit = callFor(drum.id)![2] as { pitch: number; gate: number; notes?: unknown };
    expect(hit).toMatchObject({ pitch: 3, gate: 0.5 });
    expect(hit.notes).toBeUndefined();
    expect((callFor(inst.id)![2] as { notes: unknown[] }).notes).toHaveLength(iStep.notes!.length);
  });

  it("plays a synth's hits too, without its notes; Clip tracks start their clip", async () => {
    const { p, pattern, inst, iStep } = setup();
    inst.mode = "hits";
    iStep.pitch = -2;
    playPageStep(p, pattern, 0, 10, 0.125, 0, false);
    const hit = callFor(inst.id)![2] as { pitch: number; notes?: unknown };
    expect(hit.pitch).toBe(-2);
    expect(hit.notes).toBeUndefined();
    const { startClip } = await import("./engine");
    const vox = p.tracks.find((t) => t.mode === "clip")!;
    pattern.lanes[vox.id].clip = { active: true, launchMode: "oneshot" };
    trigger.mockClear();
    playPageStep(p, pattern, 0, 10, 0.125, 0, false);
    expect(startClip).toHaveBeenCalledWith(vox, 10, expect.any(Number), true);
    expect(callFor(vox.id)).toBeUndefined();
  });
});
