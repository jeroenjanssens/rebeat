/**
 * Unit tests for state/keys.ts.
 * The engine and input modules are mocked so these run in Node without an AudioContext.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- engine mock ---
const holdNoteRelease = vi.fn();
const holdNote = vi.fn((_t: unknown, _p: unknown, _v: unknown) => holdNoteRelease);
const liveVoiceSynth = vi.fn((_t: unknown) => undefined);
const audioNow = vi.fn(() => 0);
const createKeysChannel = vi.fn((_t: unknown) => ({
  voice: {
    state: vi.fn(() => "ready" as const),
    hold: vi.fn(() => vi.fn()),
    synth: undefined as undefined,
  },
}));
const disposeKeysChannel = vi.fn();
const getKeysChannel = vi.fn(() => undefined as ReturnType<typeof createKeysChannel> | undefined);

vi.mock("../engine/engine", () => ({
  holdNote,
  liveVoiceSynth,
  audioNow,
  createKeysChannel,
  disposeKeysChannel,
  getKeysChannel,
}));

// --- input mock ---
const recordNoteOn = vi.fn((_t: unknown, _p: unknown, _v: unknown) => 0);
const recordNoteOff = vi.fn((_id: unknown) => {});
const padInput = vi.fn((_t: unknown, _v: unknown, _n: unknown) => {});
const playedNotes = vi.fn((pitch: number) => [pitch]);

vi.mock("./input", () => ({
  recordNoteOn,
  recordNoteOff,
  padInput,
  playedNotes,
}));

// --- model/tracks mock ---
vi.mock("../model/tracks", () => ({
  player: (t: { mode: string }) => (t.mode === "notes" ? "voice" : "drum"),
}));

// --- store mock ---
import { demoProject } from "../templates/nightDrive";
const project = demoProject();
const voiceTrack = project.tracks.find((t) => t.mode === "notes")!;
const drumTrack = project.tracks.find((t) => t.mode !== "notes")!;

vi.mock("./store", () => ({
  useStore: {
    getState: () => ({
      project,
      selectedTrackId: voiceTrack.id,
      setUi: vi.fn(),
    }),
  },
}));

const { noteOn, keysSustain, setKeysTarget, useKeys } = await import("./keys");

describe("noteOn → voice track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setKeysTarget({ kind: "selected" });
  });

  it("calls holdNote and returns a release function", () => {
    const release = noteOn(60, 0.8, "midi");
    expect(holdNote).toHaveBeenCalledWith(voiceTrack, 60, 0.8);
    expect(typeof release).toBe("function");
  });

  it("calls recordNoteOn with the track and pitch", () => {
    noteOn(60, 0.8, "midi");
    expect(recordNoteOn).toHaveBeenCalledWith(voiceTrack, 60, 0.8);
  });

  it("release calls the holdNote release and recordNoteOff", () => {
    const innerRelease = vi.fn();
    holdNote.mockReturnValueOnce(innerRelease);
    const release = noteOn(60, 0.8, "midi");
    release();
    expect(innerRelease).toHaveBeenCalled();
    expect(recordNoteOff).toHaveBeenCalled();
  });
});

describe("sustain pedal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setKeysTarget({ kind: "selected" });
  });

  it("delays release while sustain is down", () => {
    keysSustain(true);
    const innerRelease = vi.fn();
    holdNote.mockReturnValueOnce(innerRelease);
    const release = noteOn(60, 0.8, "midi");
    release(); // should be held
    expect(innerRelease).not.toHaveBeenCalled();
    // lifting sustain releases it
    keysSustain(false);
    expect(innerRelease).toHaveBeenCalled();
  });

  it("releases immediately when sustain is up", () => {
    keysSustain(false);
    const innerRelease = vi.fn();
    holdNote.mockReturnValueOnce(innerRelease);
    const release = noteOn(60, 0.8, "midi");
    release();
    expect(innerRelease).toHaveBeenCalled();
  });
});

describe("noteOn → drum track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setKeysTarget({ kind: "track", id: drumTrack.id });
  });

  it("calls padInput and returns a no-op release", () => {
    const release = noteOn(36, 1, "midi");
    expect(padInput).toHaveBeenCalled();
    expect(holdNote).not.toHaveBeenCalled();
    release(); // should not throw
  });
});

describe("setKeysTarget", () => {
  afterEach(() => {
    setKeysTarget({ kind: "selected" });
  });

  it("updates the store target", () => {
    setKeysTarget({ kind: "track", id: "x" });
    expect(useKeys.getState().target).toEqual({ kind: "track", id: "x" });
  });

  it("adding a sound target adds to recent", () => {
    const sound = {
      kind: "sound" as const,
      source: "catalog" as const,
      id: "piano",
      name: "Piano",
    };
    setKeysTarget(sound);
    expect(useKeys.getState().recent[0]).toMatchObject({ id: "piano" });
  });

  it("deduplicates recent sounds", () => {
    const s = { kind: "sound" as const, source: "catalog" as const, id: "piano", name: "Piano" };
    setKeysTarget(s);
    setKeysTarget(s);
    expect(useKeys.getState().recent.filter((r) => r.id === "piano")).toHaveLength(1);
  });

  it("calls disposeKeysChannel when leaving a sound target", () => {
    setKeysTarget({ kind: "sound", source: "catalog", id: "piano", name: "Piano" });
    setKeysTarget({ kind: "selected" });
    expect(disposeKeysChannel).toHaveBeenCalled();
  });
});
