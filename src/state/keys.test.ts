/**
 * Unit tests for state/keys.ts.
 * The engine and input modules are mocked so these run in Node without an AudioContext.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- engine mock ---
const holdNoteRelease = vi.fn();
const holdNote = vi.fn((_t: unknown, _p: unknown, _v: unknown): (() => void) => holdNoteRelease);
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
  playKeysSample: vi.fn(() => () => {}),
  editorSynth: liveVoiceSynth,
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
  keyRoot: (pitch: number) => pitch,
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

const {
  noteOn,
  keysSustain,
  setKeysTarget,
  useKeys,
  registerKeysEditor,
  focusKeysEditor,
  forgetKeysEditor,
  keysDescription,
  chordPadDown,
  chordPadUp,
  setPadMode,
  releaseAllKeys,
  setKeyModeKey,
  setTranspose,
  setKeyDial,
  keyDialTurn,
  keyDialPress,
  setBassOctaves,
} = await import("./keys");
const { useSettings } = await import("./settings");

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

describe("following the synth editor (D132)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setKeysTarget({ kind: "selected" });
  });

  it("plays the editor in focus only while following is on, and says so", () => {
    const off = registerKeysEditor({
      panelId: "synth-editor:x",
      name: "Lead",
      trackId: drumTrack.id,
    });
    focusKeysEditor("synth-editor:x");
    noteOn(60, 0.8, "midi");
    expect(holdNote).toHaveBeenLastCalledWith(voiceTrack, 60, 0.8);
    useSettings.getState().set({ keysFollowEditor: true });
    expect(keysDescription()).toMatchObject({
      name: drumTrack.source || drumTrack.name,
      from: `Synth editor · ${drumTrack.name}`,
      editor: true,
    });
    // picking another target stops following
    setKeysTarget({ kind: "selected" });
    expect(useSettings.getState().keysFollowEditor).toBe(false);
    off();
    forgetKeysEditor("synth-editor:x");
  });

  it("follows the editor in focus, not the one opened last", () => {
    const hold = vi.fn(() => vi.fn());
    const offA = registerKeysEditor({ panelId: "synth-editor:lib:a", name: "Pad", hold });
    const offB = registerKeysEditor({
      panelId: "synth-editor:t",
      name: "Bass",
      trackId: voiceTrack.id,
    });
    useSettings.getState().set({ keysFollowEditor: true });
    focusKeysEditor("synth-editor:lib:a");
    // B registering again (its track renamed…) doesn't take the focus
    registerKeysEditor({ panelId: "synth-editor:t", name: "Bass", trackId: voiceTrack.id });
    noteOn(62, 0.5, "midi");
    expect(hold).toHaveBeenCalledWith(62, 0.5);
    expect(holdNote).not.toHaveBeenCalled();
    expect(keysDescription()).toMatchObject({ name: "Pad", from: "Synth editor · library" });
    focusKeysEditor("synth-editor:t");
    noteOn(64, 0.5, "midi");
    expect(holdNote).toHaveBeenCalledWith(voiceTrack, 64, 0.5);
    // the focused editor closed: back to the usual target
    forgetKeysEditor("synth-editor:t");
    expect(useKeys.getState().focused).toBeNull();
    offA();
    offB();
    useSettings.getState().set({ keysFollowEditor: false });
  });
});

describe("chord pads (D137)", () => {
  const MAJ = 2;
  const M7 = 5;
  /** Each held note gets its own release, so we can tell which ones stopped. */
  const stopped: number[] = [];
  const pitches = () => holdNote.mock.calls.map((c) => c[1] as number);
  const sounding = () => useKeys.getState().sounding.map((s) => [s.key, s.notes]);

  beforeEach(() => {
    keysSustain(false);
    releaseAllKeys();
    vi.clearAllMocks();
    stopped.length = 0;
    holdNote.mockImplementation((_t, p) => () => void stopped.push(p as number));
    setKeysTarget({ kind: "selected" });
    setPadMode("chord");
  });
  afterEach(() => {
    chordPadUp(MAJ);
    chordPadUp(M7);
    setPadMode("drum");
    holdNote.mockImplementation(() => holdNoteRelease);
  });

  it("makes a key the chord of the pads held, and records every note", () => {
    chordPadDown(MAJ);
    const release = noteOn(60, 0.8, "midi");
    expect(pitches()).toEqual([60, 64, 67]);
    expect(recordNoteOn).toHaveBeenCalledTimes(3);
    expect(sounding()).toEqual([[60, [60, 64, 67]]]);
    release();
    expect(stopped.sort()).toEqual([60, 64, 67]);
    expect(sounding()).toEqual([]);
  });

  it("plays the key alone in Drum mode or without a chord type", () => {
    noteOn(60, 0.8, "midi")();
    chordPadDown(M7);
    noteOn(62, 0.8, "midi")();
    setPadMode("drum");
    chordPadDown(MAJ);
    noteOn(64, 0.8, "midi")();
    expect(pitches()).toEqual([60, 62, 64]);
  });

  it("plays one chord at a time: the newest key takes it over", () => {
    chordPadDown(MAJ);
    const first = noteOn(60, 0.8, "midi");
    noteOn(65, 0.8, "midi");
    expect(stopped.sort()).toEqual([60, 64, 67]);
    expect(sounding()).toEqual([
      [60, []],
      [65, [65, 69, 72]],
    ]);
    // letting go of the first key doesn't stop the new chord
    first();
    expect(stopped).toHaveLength(3);
  });

  it("changes the chord at once when a pad goes down or up while a key is held", () => {
    chordPadDown(MAJ);
    noteOn(60, 0.8, "midi");
    chordPadDown(M7);
    expect(pitches()).toEqual([60, 64, 67, 70]);
    expect(stopped).toEqual([]);
    chordPadUp(MAJ);
    // no chord type: the key plays on its own again
    expect(stopped.sort()).toEqual([64, 67, 70]);
    expect(sounding()).toEqual([[60, [60]]]);
  });

  it("keeps a released chord sounding while the sustain pedal is down", () => {
    chordPadDown(MAJ);
    keysSustain(true);
    noteOn(60, 0.8, "midi")();
    expect(stopped).toEqual([]);
    keysSustain(false);
    expect(stopped.sort()).toEqual([60, 64, 67]);
  });
});

describe("Key mode, transpose and the Key dial (D138)", () => {
  const MIN = 1;
  const M7 = 5;
  const sounding = () => useKeys.getState().sounding.map((s) => s.notes);
  const key = () => useSettings.getState().keyModeKey;

  beforeEach(() => {
    keysSustain(false);
    releaseAllKeys();
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    setKeysTarget({ kind: "selected" });
    setPadMode("key");
    setKeyDial("instant");
    setKeyModeKey({ root: 0, scale: "major" });
    setTranspose(0);
  });
  afterEach(() => {
    releaseAllKeys();
    chordPadUp(M7);
    chordPadUp(MIN);
    setTranspose(0);
    setPadMode("drum");
  });

  it("plays the key's chord on every key, and the pads add to it", () => {
    noteOn(62, 0.8, "midi");
    expect(sounding()).toEqual([[62, 65, 69]]);
    chordPadDown(M7);
    expect(sounding()).toEqual([[62, 65, 69, 72]]);
  });

  it("transposes everything the keys play, chords and held keys alike", () => {
    noteOn(60, 0.8, "midi");
    setTranspose(2);
    expect(sounding()).toEqual([[62, 66, 69]]);
    setTranspose(40);
    expect(useKeys.getState().transpose).toBe(12);
  });

  it("turns the key at once, the scale with Shift, and transposes while pressed", () => {
    keyDialTurn(1, false);
    expect(key()).toEqual({ root: 1, scale: "major" });
    keyDialTurn(1, true);
    expect(key()).toEqual({ root: 1, scale: "minor" });
    keyDialPress(true);
    keyDialTurn(-1, false);
    keyDialTurn(-1, false);
    keyDialPress(false);
    expect(useKeys.getState().transpose).toBe(-2);
    expect(key()).toEqual({ root: 1, scale: "minor" });
    // a click alone brings the transpose back to 0
    keyDialPress(true);
    keyDialPress(false);
    expect(useKeys.getState().transpose).toBe(0);
  });

  it("On press: a turn picks a key, a click selects it", () => {
    setKeyDial("press");
    keyDialTurn(2, false);
    expect(key()).toEqual({ root: 0, scale: "major" });
    expect(useKeys.getState().pendingKey).toEqual({ root: 2, scale: "major" });
    // turning back to the active key drops the pick
    keyDialTurn(-2, false);
    expect(useKeys.getState().pendingKey).toBeNull();
    keyDialTurn(7, false);
    keyDialPress(true);
    keyDialPress(false);
    expect(key()).toEqual({ root: 7, scale: "major" });
    expect(useKeys.getState().pendingKey).toBeNull();
  });

  it("a key played while the dial is down selects the key (Min held: minor)", () => {
    chordPadDown(MIN);
    keyDialPress(true);
    noteOn(57, 0.8, "midi")();
    keyDialPress(false);
    expect(key()).toEqual({ root: 9, scale: "minor" });
    expect(holdNote).not.toHaveBeenCalled();
    expect(useKeys.getState().transpose).toBe(0);
  });
});

describe("bass voicing (D139)", () => {
  const MAJ = 2;
  const sounding = () => useKeys.getState().sounding.map((s) => s.notes);

  beforeEach(() => {
    keysSustain(false);
    releaseAllKeys();
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    setKeysTarget({ kind: "selected" });
    setPadMode("chord");
    chordPadDown(MAJ);
  });
  afterEach(() => {
    releaseAllKeys();
    chordPadUp(MAJ);
    setBassOctaves(0);
    setTranspose(0);
    setPadMode("drum");
  });

  it("adds the chord's root octaves below it, and changes a held chord at once", () => {
    setBassOctaves(1);
    noteOn(60, 0.8, "midi");
    expect(sounding()).toEqual([[48, 60, 64, 67]]);
    setBassOctaves(2);
    expect(sounding()).toEqual([[36, 60, 64, 67]]);
    setBassOctaves(0);
    expect(sounding()).toEqual([[60, 64, 67]]);
  });

  it("never goes below C1, moves with the transpose, and leaves plain keys alone", () => {
    setBassOctaves(3);
    noteOn(48, 0.8, "midi")();
    noteOn(40, 0.8, "midi")(); // E2: E−1 would be below C1, so E1
    setTranspose(2);
    noteOn(60, 0.8, "midi");
    expect(sounding()).toEqual([[26, 62, 66, 69]]);
    const bass = holdNote.mock.calls.map((c) => c[1]).filter((p) => (p as number) < 40);
    expect(bass).toEqual([24, 28, 26]);
    releaseAllKeys();
    chordPadUp(MAJ);
    noteOn(60, 0.8, "midi");
    expect(sounding()).toEqual([[62]]);
  });
});
