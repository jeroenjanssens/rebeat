/**
 * Unit tests for playableList() ordering/filtering and browsePlayable() stepping.
 *
 * These tests mock the stores (zustand getState) so they run in Node without a browser.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock factories ────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file; variables they reference
// must be initialized with vi.hoisted to be available at hoist time.

const { useUserInstrumentsMock, useLibraryMock, useKeysMock, setKeysTargetMock } = vi.hoisted(
  () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { create } = require("zustand") as typeof import("zustand");

    const useUserInstrumentsMock = create(() => ({
      list: [
        {
          id: "user-1",
          name: "My Synth",
          version: 2,
          createdAt: 0,
          sound: { instrument: { source: "synth", preset: "acid" }, params: {}, effects: [] },
        },
      ],
    }));

    const useLibraryMock = create(() => ({
      samples: [
        {
          id: "s1",
          name: "Piano Loop",
          folder: "Loops",
          tags: [],
          key: "C",
          favorite: 0,
          duration: 2,
          createdAt: 100,
          peaks: [],
        },
        {
          id: "s2",
          name: "Kick Drum",
          folder: "Drums",
          tags: [],
          favorite: 0,
          duration: 0.1,
          createdAt: 200,
          peaks: [],
        },
        {
          id: "s3",
          name: "Snare Hit",
          folder: "Drums",
          tags: [],
          favorite: 0,
          duration: 0.1,
          createdAt: 300,
          peaks: [],
        },
        {
          id: "s4",
          name: "Bass Riff",
          folder: "Loops",
          tags: [],
          key: "E",
          favorite: 0,
          duration: 3,
          createdAt: 400,
          peaks: [],
        },
      ],
    }));

    const setKeysTargetMock = vi.fn();
    const useKeysMock = create(() => ({
      target: { kind: "selected" as const },
      status: "ready",
      recent: [] as unknown[],
    }));

    return { useUserInstrumentsMock, useLibraryMock, useKeysMock, setKeysTargetMock };
  },
);

// ── vi.mock calls (hoisted) ───────────────────────────────────────────────────

vi.mock("./analysis", () => ({
  guessCategory: (name: string) => {
    if (/kick/i.test(name)) return "kick";
    if (/snare/i.test(name)) return "snare";
    if (/hat/i.test(name)) return "hat";
    if (/piano|keys/i.test(name)) return "keys";
    return "perc";
  },
}));

vi.mock("./instruments", () => ({
  CATALOG: [
    {
      id: "synth:acid",
      name: "Acid Bass",
      family: "Synths",
      group: "Bass",
      source: { source: "synth", preset: "acid" },
      streamed: false,
      collection: { name: "Test", license: "MIT" },
    },
    {
      id: "synth:warm",
      name: "Warm Pad",
      family: "Synths",
      group: "Pads",
      source: { source: "synth", preset: "warm" },
      streamed: false,
      collection: { name: "Test", license: "MIT" },
    },
    {
      id: "smplr:piano",
      name: "Grand Piano",
      family: "Pianos & keys",
      group: "Acoustic",
      source: { source: "smplr", preset: "piano" },
      streamed: true,
      collection: { name: "Test", license: "MIT" },
    },
    {
      id: "smplr:epiano",
      name: "Electric Piano",
      family: "Pianos & keys",
      group: "Electric",
      source: { source: "smplr", preset: "epiano:TX81Z" },
      streamed: true,
      collection: { name: "Test", license: "MIT" },
    },
  ],
}));

vi.mock("./userInstruments", () => ({
  useUserInstruments: useUserInstrumentsMock,
  userEntry: (r: { id: string; name: string; sound: { instrument: unknown } }) => ({
    id: `user:${r.id}`,
    name: r.name,
    family: "Your sounds",
    group: "Synths",
    source: r.sound.instrument,
    streamed: false,
    collection: { name: "Your sounds", license: "Yours" },
  }),
}));

vi.mock("./library", () => ({ useLibrary: useLibraryMock }));

vi.mock("../midi/display", () => ({ showOnDisplay: vi.fn() }));

vi.mock("../state/keys", () => ({
  useKeys: useKeysMock,
  setKeysTarget: setKeysTargetMock,
}));

// ── Import subject under test ─────────────────────────────────────────────────

import { playableList, browsePlayable } from "./playable";

const ORIGINAL_SAMPLES = [
  {
    id: "s1",
    name: "Piano Loop",
    folder: "Loops",
    tags: [],
    key: "C",
    favorite: 0,
    duration: 2,
    createdAt: 100,
    peaks: [],
  },
  {
    id: "s2",
    name: "Kick Drum",
    folder: "Drums",
    tags: [],
    favorite: 0,
    duration: 0.1,
    createdAt: 200,
    peaks: [],
  },
  {
    id: "s3",
    name: "Snare Hit",
    folder: "Drums",
    tags: [],
    favorite: 0,
    duration: 0.1,
    createdAt: 300,
    peaks: [],
  },
  {
    id: "s4",
    name: "Bass Riff",
    folder: "Loops",
    tags: [],
    key: "E",
    favorite: 0,
    duration: 3,
    createdAt: 400,
    peaks: [],
  },
];

beforeEach(() => {
  setKeysTargetMock.mockClear();
  useKeysMock.setState({ target: { kind: "selected" }, status: "ready" });
  useLibraryMock.setState({ samples: ORIGINAL_SAMPLES });
});

// ── playableList() ────────────────────────────────────────────────────────────

describe("playableList()", () => {
  it("returns synths first, then instruments, then Your sounds, then samples", () => {
    const list = playableList();
    const sections = list.map((i) => i.section);

    const lastSynth = sections.lastIndexOf("Synths");
    const firstInstrument = sections.indexOf("Sampled instruments");
    const lastInstrument = sections.lastIndexOf("Sampled instruments");
    const firstYours = sections.indexOf("Your sounds");
    const lastYours = sections.lastIndexOf("Your sounds");
    const firstSample = sections.indexOf("Samples");

    expect(lastSynth).toBeGreaterThanOrEqual(0);
    expect(firstInstrument).toBeGreaterThan(lastSynth);
    expect(firstYours).toBeGreaterThan(lastInstrument);
    expect(firstSample).toBeGreaterThan(lastYours);
  });

  it("excludes drum samples by default", () => {
    const list = playableList();
    const ids = list.map((i) => i.id);
    expect(ids).not.toContain("s2"); // "Kick Drum" → kick
    expect(ids).not.toContain("s3"); // "Snare Hit" → snare
    expect(ids).toContain("s1"); // has key="C" → not drum
    expect(ids).toContain("s4"); // has key="E" → not drum
  });

  it("includes drum samples when allSamples = true", () => {
    const list = playableList({ allSamples: true });
    const ids = list.map((i) => i.id);
    expect(ids).toContain("s2");
    expect(ids).toContain("s3");
  });

  it("includes 2 catalog synths in Synths section", () => {
    const list = playableList();
    const synths = list.filter((i) => i.section === "Synths");
    expect(synths.length).toBe(2);
  });

  it("includes 2 catalog instruments in Sampled instruments section", () => {
    const list = playableList();
    const insts = list.filter((i) => i.section === "Sampled instruments");
    expect(insts.length).toBe(2);
    expect(insts.every((i) => i.family === "instrument")).toBe(true);
  });

  it("includes user instruments in Your sounds section", () => {
    const list = playableList();
    const yours = list.filter((i) => i.section === "Your sounds");
    expect(yours.length).toBe(1);
    expect(yours[0].id).toBe("user:user-1");
    expect(yours[0].name).toBe("My Synth");
  });

  it("sets correct target for catalog sounds", () => {
    const list = playableList();
    const acid = list.find((i) => i.id === "synth:acid");
    expect(acid!.target).toEqual({
      kind: "sound",
      source: "catalog",
      id: "synth:acid",
      name: "Acid Bass",
    });
  });

  it("sets correct target for samples", () => {
    const list = playableList();
    const s = list.find((i) => i.id === "s1");
    expect(s!.target).toEqual({ kind: "sound", source: "sample", id: "s1", name: "Piano Loop" });
  });
});

// ── browsePlayable() ──────────────────────────────────────────────────────────

describe("browsePlayable()", () => {
  it("returns a valid item when moving forward by 1", () => {
    const item = browsePlayable(1);
    expect(item).toBeDefined();
    expect(item!.id).toBeTruthy();
  });

  it("wraps around past the end of the list", () => {
    const list = playableList();
    const n = list.length;
    // Moving n+1 times from the start should wrap and still return a valid item.
    let last: ReturnType<typeof browsePlayable>;
    for (let i = 0; i < n + 1; i++) last = browsePlayable(1);
    expect(last).toBeDefined();
  });

  it("does not throw when list is empty (no samples)", () => {
    useLibraryMock.setState({ samples: [] });
    // CATALOG still has items, so browsePlayable returns something; no throw.
    expect(() => browsePlayable(1)).not.toThrow();
  });

  it("browses by section when bySection = true", () => {
    const list = playableList();
    const firstSynth = list[0]; // section: "Synths"
    useKeysMock.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: { kind: "sound", source: "catalog", id: firstSynth.id, name: firstSynth.name } as any,
      status: "ready",
    });

    const item = browsePlayable(1, true);
    expect(item).toBeDefined();
    expect(item!.section).toBe("Sampled instruments");
  });

  it("schedules setKeysTarget after the 150 ms debounce", async () => {
    vi.useFakeTimers();

    browsePlayable(1);
    expect(setKeysTargetMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();

    expect(setKeysTargetMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
