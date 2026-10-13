import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { slotPattern } from "../model/project";
import { setStepVelocity, stepVelocity, type Lane } from "../model/types";
import { demoProject } from "../templates/nightDrive";

const trigger = vi.fn();
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
  ungate: vi.fn(),
  trigger: (...args: unknown[]) => trigger(...args),
}));

const { playStep, play, scheduledSteps, sectionFill, stepSeconds } = await import("./transport");
const { useStore } = await import("../state/store");

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

describe("playStep", () => {
  beforeEach(() => trigger.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it("plays a drum step's velocity and an instrument step's note velocities", () => {
    const { p, pattern, drum, inst, dStep, iStep } = setup();
    setStepVelocity(dStep, 0.3);
    setStepVelocity(iStep, 0.5);
    playStep(p, pattern, 0, 10, 0.125, 0, false);
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
    playStep(p, pattern, 0, 10, 0.125, 0, false);
    expect((callFor(drum.id)![2] as { time: number }).time).toBeCloseTo(10 + 0.2 * 0.125);
    expect((callFor(inst.id)![2] as { time: number }).time).toBeCloseTo(10 - 0.1 * 0.125);
    trigger.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    playStep(p, pattern, 0, 10, 0.125, 0, false);
    expect(callFor(drum.id)).toBeUndefined();
    expect(callFor(inst.id)).toBeUndefined();
  });

  it("passes hits their pitch and gate, and only Notes their notes", () => {
    const { p, pattern, drum, inst, dStep, iStep } = setup();
    dStep.pitch = 3;
    dStep.gate = 0.5;
    // a Notes track's step also has a hit pitch, and a Hits track may keep notes
    dStep.notes = [{ pitch: 72, length: 1, velocity: 1 }];
    playStep(p, pattern, 0, 10, 0.125, 0, false);
    const hit = callFor(drum.id)![2] as { pitch: number; gate: number; notes?: unknown };
    expect(hit).toMatchObject({ pitch: 3, gate: 0.5 });
    expect(hit.notes).toBeUndefined();
    expect((callFor(inst.id)![2] as { notes: unknown[] }).notes).toHaveLength(iStep.notes!.length);
  });

  it("plays a synth's hits too, without its notes; Clip tracks start their clip", async () => {
    const { p, pattern, inst, iStep } = setup();
    inst.mode = "hits";
    iStep.pitch = -2;
    playStep(p, pattern, 0, 10, 0.125, 0, false);
    const hit = callFor(inst.id)![2] as { pitch: number; notes?: unknown };
    expect(hit.pitch).toBe(-2);
    expect(hit.notes).toBeUndefined();
    const { startClip } = await import("./engine");
    const vox = p.tracks.find((t) => t.mode === "clip")!;
    pattern.lanes[vox.id].clip = { active: true, launchMode: "oneshot" };
    trigger.mockClear();
    playStep(p, pattern, 0, 10, 0.125, 0, false);
    expect(startClip).toHaveBeenCalledWith(vox, 10, expect.any(Number), true);
    expect(callFor(vox.id)).toBeUndefined();
  });
});

describe("section settings (D183)", () => {
  beforeEach(() => trigger.mockClear());

  it("a track muted in a section is silent there, and plays in its clone", () => {
    const { p, pattern, drum, inst } = setup();
    const section = { id: "s", patternId: pattern.id, repeats: 1, mutes: [drum.id] };
    playStep(p, pattern, 0, 10, 0.125, 0, false, undefined, undefined, { section });
    expect(callFor(drum.id)).toBeUndefined();
    expect(callFor(inst.id)).toBeDefined();
    trigger.mockClear();
    playStep(p, pattern, 0, 10, 0.125, 0, false, undefined, undefined, {
      section: { ...section, mutes: undefined },
    });
    expect(callFor(drum.id)).toBeDefined();
  });

  it("transpose adds to the pattern's", () => {
    const { p, pattern, inst } = setup();
    pattern.transpose = 1;
    const section = { id: "s", patternId: pattern.id, repeats: 1, transpose: 2 };
    playStep(p, pattern, 0, 10, 0.125, 0, false, undefined, undefined, { section });
    expect((callFor(inst.id)![2] as { transpose: number }).transpose).toBe(3);
  });

  it("fill on the last repeat, or on every repeat", () => {
    const s = { id: "s", patternId: "p", repeats: 2 };
    expect(sectionFill({ ...s, fill: "last" }, 0, 2)).toBe(false);
    expect(sectionFill({ ...s, fill: "last" }, 1, 2)).toBe(true);
    expect(sectionFill({ ...s, fill: "all" }, 0, 2)).toBe(true);
    expect(sectionFill(s, 1, 2)).toBe(false);
  });
});

describe("playing from anywhere (D190) and tempo changes (D192)", () => {
  afterEach(() => useStore.getState().setUi({ playing: false, startAt: null }));

  it("starts at the start marker's section, repeat and step", () => {
    const p = demoProject();
    p.slots[1].repeats = 2;
    useStore.getState().loadProject(p, "t");
    const slot = p.slots[1];
    const stepQ = 0.25;
    // the second repeat, step 3
    const at = p.patterns[slot.patternId].stepCount * stepQ + 3 * stepQ;
    useStore.getState().setUi({ editSlotId: slot.id, startAt: { slotId: slot.id, at } });
    play();
    const first = scheduledSteps()[0];
    expect(first).toMatchObject({ slotId: slot.id, repeat: 1, pageStep: 3 });
  });

  it("steps get shorter through a ramp up", () => {
    const p = demoProject();
    const pattern = p.patterns[p.slots[0].patternId];
    const before = stepSeconds(p, pattern, 0, 0);
    // the first section is a bar (4 quarters): ramp to double the tempo at its end
    p.tempo = [{ slotId: p.slots[0].id, at: 3.99, bpm: p.bpm * 2, ramp: true }];
    expect(stepSeconds(p, pattern, 0, 0)).toBeLessThan(before);
    expect(stepSeconds(p, pattern, 3.74, 0)).toBeLessThan(before * 0.55);
  });
});
