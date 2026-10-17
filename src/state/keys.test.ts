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
  onPanic: vi.fn(),
}));

// the play styles' clock: unit tests drive it with flushPerform
vi.mock("../engine/transport", () => ({
  playStartTime: () => 0,
  nextBarTime: () => null,
  // the demo project's tempo (no tempo changes)
  tempoNow: () => 112,
}));
vi.mock("../engine/ticker", () => ({ startTicker: () => () => {} }));

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
  bendable: (t: { sound?: { source?: string } }) => t.sound?.source === "synth",
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
  setChordVoicing,
} = await import("./keys");
const keysApi = await import("./keys");
const performApi = await import("./perform");
const performModel = await import("../model/perform");
const { useSettings } = await import("./settings");

describe("noteOn → voice track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setKeysTarget({ kind: "selected" });
  });

  it("calls holdNote and returns a release function", () => {
    const release = noteOn(60, 0.8, "midi");
    expect(holdNote).toHaveBeenCalledWith(voiceTrack, 60, 0.8, undefined);
    expect(typeof release).toBe("function");
  });

  it("calls recordNoteOn with the track and pitch", () => {
    noteOn(60, 0.8, "midi");
    expect(recordNoteOn).toHaveBeenCalledWith(voiceTrack, 60, 0.8, {
      at: undefined,
      spread: undefined,
    });
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
    expect(holdNote).toHaveBeenLastCalledWith(voiceTrack, 60, 0.8, undefined);
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
    expect(holdNote).toHaveBeenCalledWith(voiceTrack, 64, 0.5, undefined);
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

describe("chord voicing and the bass knob (D140)", () => {
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
    setChordVoicing(0);
    setBassOctaves(0);
    setPadMode("drum");
  });

  it("voices every chord, a held one at once, within ±8", () => {
    noteOn(60, 0.8, "midi");
    setChordVoicing(1);
    expect(sounding()).toEqual([[64, 67, 72]]);
    setChordVoicing(-1);
    expect(sounding()).toEqual([[55, 60, 64]]);
    setChordVoicing(20);
    expect(useSettings.getState().chordVoicing).toBe(8);
  });

  it("keeps the bass on the root, below the voiced chord", () => {
    setBassOctaves(1);
    setChordVoicing(1);
    noteOn(60, 0.8, "midi");
    expect(sounding()).toEqual([[48, 64, 67, 72]]);
    setChordVoicing(-2);
    // the chord starts on E3: C3 is still below it
    expect(sounding()).toEqual([[48, 52, 55, 60]]);
    setChordVoicing(-3);
    // the chord starts on C3 itself: the bass goes an octave further, C2
    expect(sounding()).toEqual([[36, 48, 52, 55]]);
  });

  it("leaves plain keys alone", () => {
    chordPadUp(MAJ);
    setChordVoicing(2);
    noteOn(60, 0.8, "midi");
    expect(sounding()).toEqual([[60]]);
  });
});

describe("play styles (D149–D154)", () => {
  const MAJ = 2;
  const { setPlayStyle, toggleLatch, setSmoothVoicing, setBassTrack, setBassMode } = keysApi;
  const { flushPerform } = performApi;
  const { DEFAULT_PLAY_STYLE } = performModel;
  /** holdNote's calls as [pitch, at, velocity]. */
  const holds = () =>
    holdNote.mock.calls.map((c) => [c[1], (c as unknown[])[3], c[2]] as [number, number, number]);
  const step = () => (0.25 * 60) / project.bpm; // a 16th

  beforeEach(() => {
    keysSustain(false);
    releaseAllKeys();
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    setKeysTarget({ kind: "selected" });
    useSettings.getState().set({ playStyle: DEFAULT_PLAY_STYLE });
    setPadMode("chord");
    chordPadDown(MAJ);
  });
  afterEach(() => {
    releaseAllKeys();
    chordPadUp(MAJ);
    useSettings.getState().set({ playStyle: DEFAULT_PLAY_STYLE, smoothVoicing: false });
    setBassTrack(null);
    setBassMode("auto");
    setBassOctaves(0);
    setPadMode("drum");
    flushPerform(100);
  });

  it("strums a chord: the lowest note at once, the others later, up", () => {
    setPlayStyle({ strum: { on: true, time: 0.06, direction: "up" } });
    noteOn(60, 0.8, "midi");
    expect(holds()).toEqual([[60, undefined, 0.8]]);
    flushPerform(0);
    const h = holds();
    expect(h.map((x) => x[0])).toEqual([60, 64, 67]);
    expect(h[1][1]).toBeGreaterThan(0);
    expect(h[2][1]).toBeCloseTo(0.06);
  });

  it("tells the lights when each note sounds and stops (D156)", () => {
    const events: [number | null, boolean, number][] = [];
    const off = keysApi.onKeysLight((p, on, at) => events.push([p, on, at]));
    setPlayStyle({ strum: { on: true, time: 0.06, direction: "up" } });
    const up = noteOn(60, 0.8, "midi");
    flushPerform(0);
    const ons = events.filter((e) => e[1]);
    expect(ons.map((e) => e[0])).toEqual([60, 64, 67]);
    expect(ons[2][2]).toBeCloseTo(0.06);
    up();
    expect(
      events
        .filter((e) => !e[1])
        .map((e) => e[0])
        .sort(),
    ).toEqual([60, 64, 67]);
    off();
  });

  it("strums down from the highest; a key let go early cancels what hasn't started", () => {
    setPlayStyle({ strum: { on: true, time: 0.2, direction: "down" } });
    const up = noteOn(60, 0.8, "midi");
    expect(holds().map((x) => x[0])).toEqual([67]);
    up();
    flushPerform(0.5);
    expect(holds().map((x) => x[0])).toEqual([67]);
  });

  it("balances a chord: the bass and the top full, the inner notes softer", () => {
    setBassOctaves(1);
    setPlayStyle({ balance: 1 });
    noteOn(60, 1, "midi");
    const v = new Map(holds().map(([p, , vel]) => [p, vel]));
    expect(v.get(48)).toBe(1);
    expect(v.get(67)).toBe(1);
    expect(v.get(64)).toBeCloseTo(0.65);
    expect(v.get(60)).toBeCloseTo(0.65);
  });

  it("arpeggiates a held chord on its grid, the bass held", () => {
    setBassOctaves(1);
    setPlayStyle({ arp: { on: true, rate: "1/16", mode: "up" } });
    noteOn(60, 0.8, "midi");
    // the bass and the first note at once
    expect(holds().map((x) => x[0])).toEqual([48, 60]);
    flushPerform(step());
    flushPerform(2 * step());
    expect(holds().map((x) => x[0])).toEqual([48, 60, 64, 67]);
    const at = holds().map((x) => x[1]);
    expect(at[3] - at[2]).toBeCloseTo(step(), 3);
  });

  it("latches: what the keys play goes on after they're let go, until Latch goes off", () => {
    setPlayStyle({ latch: true });
    const up = noteOn(60, 0.8, "midi");
    up();
    expect(holdNoteRelease).not.toHaveBeenCalled();
    expect(useKeys.getState().latched).toBe(true);
    // a new key after all were up: a new chord
    const up2 = noteOn(62, 0.8, "midi");
    expect(holdNoteRelease).toHaveBeenCalledTimes(3);
    up2();
    toggleLatch();
    expect(holdNoteRelease).toHaveBeenCalledTimes(6);
    expect(useKeys.getState().latched).toBe(false);
  });

  it("plays a pattern: Oom-pah's bass on 1, the chord on 2", () => {
    setPlayStyle({ pattern: { on: true, id: "oompah" } });
    noteOn(60, 1, "midi");
    // beat 1: a bass hit without a bass plays the chord's lowest note
    expect(holds().map((x) => x[0])).toEqual([60]);
    for (let k = 1; k <= 4; k++) flushPerform(k * step());
    expect(holds().map((x) => x[0])).toEqual([60, 60, 64, 67]);
  });

  it("voices smoothly: C, then F as C F A", () => {
    setSmoothVoicing(true);
    const up = noteOn(60, 0.8, "midi");
    up();
    noteOn(65, 0.8, "midi");
    expect(useKeys.getState().sounding.at(-1)?.notes).toEqual([60, 65, 69]);
  });

  it("plays the bass on its own track", () => {
    setBassOctaves(1);
    setBassTrack(drumTrack.id === voiceTrack.id ? null : voiceTrack.id);
    noteOn(60, 0.8, "midi");
    const bassCall = holdNote.mock.calls.find((c) => c[1] === 48);
    expect(bassCall?.[0]).toBe(voiceTrack);
  });

  it("splits the keyboard: below the split the bass alone, chords above without a bass", () => {
    setBassOctaves(1);
    setBassMode("split", 48);
    noteOn(40, 0.8, "midi");
    noteOn(60, 0.8, "midi");
    expect(
      holds()
        .map((x) => x[0])
        .sort((a, b) => a - b),
    ).toEqual([40, 60, 64, 67]);
  });
});

describe("suggestions and Next mode (D158, D159)", () => {
  const { setSuggest, playSuggestion, refreshSuggestions, forgetChords } = keysApi;
  const C_MAJOR = { root: 0, scale: "major" };

  beforeEach(() => {
    keysSustain(false);
    releaseAllKeys();
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    setKeysTarget({ kind: "selected" });
    setKeyModeKey(C_MAJOR);
    setSuggest(true);
    forgetChords();
  });
  afterEach(() => {
    releaseAllKeys();
    setSuggest(false);
    setPadMode("drum");
  });

  it("suggests what follows the chord played: after G in Key mode, C first", () => {
    setPadMode("key");
    const up = noteOn(67, 0.8, "midi"); // G: Key mode's V in C major
    up();
    const s = useKeys.getState().suggestions;
    expect(s[0].name).toBe("C");
    expect(useKeys.getState().lastKey).toBe(67);
  });

  it("Next mode: the pads hold the suggestions, a press plays one as a key would", () => {
    setPadMode("next");
    const up = noteOn(62, 0.8, "midi"); // Dm: ii
    up();
    const first = useKeys.getState().suggestions[0];
    expect(first.name).toBe("G");
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    const release = playSuggestion(0, 0.8, "screen");
    // G major, rooted in the octave nearest the last key (D4): G3 B3 D4… or G4: near 62
    const played = holdNote.mock.calls.map((c) => c[1] as number).sort((a, b) => a - b);
    expect(played.map((n) => n % 12).sort()).toEqual([2, 7, 11].sort());
    release();
    // playing it moved the suggestions on: after G, C
    expect(useKeys.getState().suggestions[0].name).toBe("C");
  });

  it("shows nothing in Drum mode, or with Suggest off (Next mode always)", () => {
    setPadMode("drum");
    refreshSuggestions();
    expect(useKeys.getState().suggestions).toEqual([]);
    setPadMode("chord");
    setSuggest(false);
    expect(useKeys.getState().suggestions).toEqual([]);
    setPadMode("next");
    expect(useKeys.getState().suggestions.length).toBeGreaterThan(0);
  });
});

describe("Auto: the progression plays itself (D162)", () => {
  const { setSuggest, forgetChords, startAuto, stopAuto, setNextProgression, playSuggestion } =
    keysApi;
  const { flushPerform } = performApi;
  const bar = () => (16 * 60) / project.bpm / 4;
  /** The roots of the chords held (holdNote calls with the chord's lowest note per start time). */
  const chordsPlayed = () => {
    const byTime = new Map<number, number[]>();
    for (const c of holdNote.mock.calls) {
      const at = Math.round(((c as unknown[])[3] as number) * 1000);
      byTime.set(at, [...(byTime.get(at) ?? []), c[1] as number]);
    }
    return [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, n]) => n.sort((a, b) => a - b));
  };
  const name = (notes: number[]) =>
    ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][notes[0] % 12];

  beforeEach(() => {
    keysSustain(false);
    releaseAllKeys();
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    setKeysTarget({ kind: "selected" });
    setKeyModeKey({ root: 0, scale: "major" });
    useSettings.getState().set({
      autoSync: false,
      autoEvery: 1,
      autoBeats: null,
      autoLoop: true,
      playStyle: performModel.DEFAULT_PLAY_STYLE,
    });
    setPadMode("next");
    setNextProgression("royalroad");
    forgetChords();
  });
  afterEach(() => {
    stopAuto();
    setNextProgression(null);
    setSuggest(false);
    setPadMode("drum");
    flushPerform(1000);
  });

  it("walks the progression, a chord per bar, each at its change", () => {
    startAuto();
    for (let b = 0; b < 4; b++) flushPerform(b * bar());
    const played = chordsPlayed().filter((n) => n.length >= 3);
    expect(played.map(name)).toEqual(["F", "G", "E", "A"]);
    // each at its change, a bar apart
    const times = [...new Set(holdNote.mock.calls.map((c) => (c as unknown[])[3] as number))].sort(
      (a, b) => a - b,
    );
    expect(times[1] - times[0]).toBeCloseTo(bar(), 3);
  });

  it("changes faster than a bar: every 2, 1 or ½ beat, in one stepper list (D218)", () => {
    expect(keysApi.autoSteps().map((s) => s.label)).toEqual([
      "½ beat",
      "1 beat",
      "½ bar",
      "1 bar",
      "2 bars",
      "3 bars",
      "4 bars",
      "6 bars",
      "8 bars",
    ]);
    keysApi.stepAutoEvery(-1);
    expect(useSettings.getState().autoBeats).toBe(2);
    keysApi.stepAutoEvery(-1);
    expect(useSettings.getState().autoBeats).toBe(1);
    startAuto();
    for (let b = 0; b < 8; b++) flushPerform((b * bar()) / 4);
    const times = [...new Set(holdNote.mock.calls.map((c) => (c as unknown[])[3] as number))].sort(
      (a, b) => a - b,
    );
    // a chord a beat
    expect(times[1] - times[0]).toBeCloseTo(bar() / 4, 3);
    expect(chordsPlayed().filter((n) => n.length >= 3).length).toBeGreaterThanOrEqual(4);
    keysApi.stepAutoEvery(1);
    keysApi.stepAutoEvery(1);
    expect(useSettings.getState().autoBeats).toBe(null);
    expect(useSettings.getState().autoEvery).toBe(1);
  });

  it("in 3/4, a half bar isn't a beat step", () => {
    project.timeSignature = [3, 4];
    expect(
      keysApi
        .autoSteps()
        .map((s) => s.label)
        .slice(0, 4),
    ).toEqual(["½ beat", "1 beat", "2 beats", "1 bar"]);
    project.timeSignature = [4, 4];
  });

  it("counts in patterns when one plays: the waltz changes every three beats", () => {
    keysApi.setPlayStyle({ pattern: { on: true, id: "waltz" } });
    expect(keysApi.autoUnit()).toEqual({ beats: 3, pattern: true });
    keysApi.setPlayStyle({ pattern: { on: false } });
    expect(keysApi.autoUnit()).toEqual({ beats: 4, pattern: false });
  });

  it("the keys play a melody over it, and the chord goes on", () => {
    startAuto();
    flushPerform(0);
    const before = holdNoteRelease.mock.calls.length;
    const up = noteOn(76, 0.9, "midi");
    const melody = holdNote.mock.calls.at(-1)!;
    expect(melody[1]).toBe(76);
    expect(holdNoteRelease.mock.calls.length).toBe(before); // the chord wasn't ended
    up();
  });

  it("a pad pressed during Auto comes in at the next change, then the progression goes on (D171)", () => {
    startAuto();
    flushPerform(0); // F
    const second = useKeys.getState().suggestions[1]; // not G (pad 1)
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    playSuggestion(1, 0.8, "screen");
    // not now
    expect(holdNote).not.toHaveBeenCalled();
    expect(useKeys.getState().auto.queued).toBe(1);
    flushPerform(bar()); // the change: the queued chord instead of G
    expect(chordsPlayed().map(name)).toEqual([second.name[0]]);
    expect(useKeys.getState().auto.queued).toBeNull();
    flushPerform(2 * bar()); // then on with the progression: Em
    expect(chordsPlayed().map(name).at(-1)).toBe("E");
  });

  it("a queued pad pressed again isn't queued any more", () => {
    startAuto();
    flushPerform(0);
    playSuggestion(2, 0.8, "screen");
    playSuggestion(2, 0.8, "screen");
    expect(useKeys.getState().auto.queued).toBeNull();
  });

  it("with Loop off, stops after the last chord", () => {
    useSettings.getState().set({ autoLoop: false });
    startAuto();
    for (let b = 0; b < 6; b++) flushPerform(b * bar());
    expect(chordsPlayed().filter((n) => n.length >= 3)).toHaveLength(4);
    expect(useKeys.getState().auto.running).toBe(false);
  });

  it("Free follows the best suggestion every time", () => {
    setNextProgression(null);
    startAuto();
    for (let b = 0; b < 3; b++) flushPerform(b * bar());
    const played = chordsPlayed()
      .filter((n) => n.length >= 3)
      .map(name);
    expect(played[0]).toBe("C"); // nothing played: home
    expect(played).toHaveLength(3);
  });

  it("synced to the song: armed while it's stopped (D172)", () => {
    useSettings.getState().set({ autoSync: true });
    startAuto();
    expect(useKeys.getState().auto).toMatchObject({ armed: true, running: false });
    flushPerform(0);
    expect(holdNote).not.toHaveBeenCalled();
    stopAuto();
    expect(useKeys.getState().auto.armed).toBe(false);
  });
});

describe("patterns that pick notes, in triplets too (D175, D176)", () => {
  const MAJ = 2;
  const { setPlayStyle, startAuto, stopAuto, setNextProgression, forgetChords } = keysApi;
  const { flushPerform } = performApi;
  const beat = () => 60 / project.bpm;
  const starts = () =>
    holdNote.mock.calls.map((c) => ({ pitch: c[1] as number, at: (c as unknown[])[3] as number }));

  beforeEach(() => {
    keysSustain(false);
    releaseAllKeys();
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    setKeysTarget({ kind: "selected" });
    useSettings.getState().set({ playStyle: performModel.DEFAULT_PLAY_STYLE, autoSync: false });
    setPadMode("chord");
    chordPadDown(MAJ);
  });
  afterEach(() => {
    stopAuto();
    releaseAllKeys();
    chordPadUp(MAJ);
    useSettings.getState().set({ playStyle: performModel.DEFAULT_PLAY_STYLE });
    setPadMode("drum");
    flushPerform(1000);
  });

  it("a triplet shuffle: long-short, a third of a beat apart", () => {
    setPlayStyle({ pattern: { on: true, id: "shuffle" } });
    noteOn(60, 0.9, "midi");
    for (let i = 0; i <= 6; i++) flushPerform((i * beat()) / 3);
    const times = [...new Set(starts().map((s) => Math.round((s.at / beat()) * 3)))];
    // hits on triplet 0 and 2 of every beat
    expect(times.slice(0, 4)).toEqual([0, 2, 3, 5]);
  });

  it("Alberti bass plays low, high, mid, high of the chord", () => {
    setPlayStyle({ pattern: { on: true, id: "alberti" } });
    noteOn(60, 0.9, "midi");
    for (let i = 0; i <= 4; i++) flushPerform((i * beat()) / 4);
    expect(
      starts()
        .slice(0, 4)
        .map((s) => s.pitch),
    ).toEqual([60, 67, 64, 67]);
  });

  it("the root–fifth bass plays the root and the fifth under the chord", () => {
    setPlayStyle({ pattern: { on: true, id: "rootfifth" } });
    noteOn(60, 0.9, "midi");
    for (let i = 0; i <= 8; i++) flushPerform((i * beat()) / 2);
    const bass = starts()
      .filter((s) => s.pitch < 60)
      .map((s) => s.pitch);
    expect(bass.slice(0, 2)).toEqual([48, 55]);
  });

  it("a walking bass leans into Auto's next chord", () => {
    setPlayStyle({ pattern: { on: true, id: "walking" } });
    setPadMode("next");
    setKeyModeKey({ root: 0, scale: "major" });
    setNextProgression("four"); // C G Am F
    // the chords around middle C (Auto roots them near the last key), then from the top
    noteOn(60, 0.8, "midi")();
    forgetChords();
    vi.clearAllMocks();
    holdNote.mockImplementation(() => holdNoteRelease);
    startAuto();
    for (let i = 0; i <= 16; i++) flushPerform((i * beat()) / 4);
    // the walk is under the chord (C4 E4 G4): below 60
    const walk = starts()
      .filter((s) => s.pitch < 60)
      .map((s) => s.pitch % 12);
    // C E G, then a half step from G (F♯ below or A♭ above), then G
    expect(walk.slice(0, 3)).toEqual([0, 4, 7]);
    expect([6, 8]).toContain(walk[3]);
    expect(walk[4]).toBe(7);
    setNextProgression(null);
  });
});
