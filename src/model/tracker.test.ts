import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { emptyProject, hitsTrack, notesTrack, page, synth } from "../templates/builder";
import type { Project } from "./project";
import {
  applyFx,
  autoRows,
  noteColumns,
  placeNotes,
  stepFx,
  trackGrid,
  trackLayout,
  trackerNote,
  rowPlace,
} from "./tracker";
import {
  clearNote,
  copyBlock,
  interpolate,
  pasteBlock,
  scaleVolume,
  setVolume,
  shiftRows,
  transposeBlock,
  writeFx,
  writeNote,
  writeOff,
  type EditAt,
} from "./trackerEdit";
import { emptyStep, type Note } from "./types";
import { hitNoteOf } from "./tracks";

function project() {
  const p = emptyProject("T", 120);
  p.tracks.push(hitsTrack("Kick", "kit:808:kick", "808 Kick", "kick"));
  p.tracks.push(notesTrack("Keys", synth("pad"), "Pad", "keys"));
  const pat = page(p, "A", 16);
  return { p, pat, kick: p.tracks[0], keys: p.tracks[1] };
}

const at = (pat: { id: string }, n = 1): EditAt => ({ patternId: pat.id, n });
const edit = (p: Project, fn: (d: Project) => unknown) => {
  let out: unknown;
  const next = produce(p, (d) => void (out = fn(d)));
  return { p: next, out };
};

describe("rows and grids", () => {
  it("Auto picks the coarsest grid every track's steps land on", () => {
    const { p, pat, keys } = project();
    expect(autoRows(pat, p.tracks)).toBe(1);
    pat.lanes[keys.id].stepSizeOverride = "1/16T";
    expect(autoRows(pat, p.tracks)).toBe(3);
    pat.lanes[keys.id].stepSizeOverride = "1/32";
    expect(autoRows(pat, p.tracks)).toBe(2);
    pat.lanes[keys.id].stepSizeOverride = "1/8";
    expect(autoRows(pat, p.tracks)).toBe(1);
  });

  it("a shorter track repeats as ghost rows; an off-grid one shows nothing", () => {
    const { pat, kick, keys } = project();
    pat.lanes[kick.id].stepCountOverride = 6;
    const g = trackGrid(pat, kick.id, 1);
    expect(g.laneRows).toBe(6);
    expect(rowPlace(g, 7)).toEqual({ row: 1, ghost: true, step: 1 });
    expect(rowPlace(g, 2)).toEqual({ row: 2, ghost: false, step: 2 });
    pat.lanes[keys.id].stepSizeOverride = "1/16T";
    expect(trackGrid(pat, keys.id, 1).onGrid).toBe(false);
    const g3 = trackGrid(pat, keys.id, 3);
    expect(g3).toMatchObject({ onGrid: true, k: 2 });
    expect(rowPlace(g3, 3)?.step).toBeUndefined();
  });

  it("names notes the tracker way", () => {
    expect(trackerNote(60)).toBe("C-4");
    expect(trackerNote(61)).toBe("C#4");
    expect(trackerNote(45)).toBe("A-2");
  });
});

describe("note columns (D268, D269)", () => {
  const note = (pitch: number, length: number, extra: Partial<Note> = {}): Note => ({
    pitch,
    length,
    velocity: 0.8,
    ...extra,
  });

  it("spreads overlapping notes over columns and keeps a free column hint", () => {
    const { pat, keys } = project();
    const lane = pat.lanes[keys.id];
    lane.steps[0].notes = [note(60, 4), note(64, 2)];
    lane.steps[2].notes = [note(67, 2, { col: 2 })];
    const g = trackGrid(pat, keys.id, 1);
    const placed = placeNotes(lane, g);
    expect(placed.map((x) => [x.note.pitch, x.col])).toEqual([
      [60, 0],
      [64, 1],
      [67, 2],
    ]);
    const cols = noteColumns(keys, lane, g);
    expect(cols[0].get(4)).toEqual({ kind: "off" });
    // the second column's note ends where nothing starts in it
    expect(cols[1].get(2)).toEqual({ kind: "off" });
  });

  it("shows hits as the note they play", () => {
    const { pat, kick } = project();
    const s = pat.lanes[kick.id].steps[4];
    s.on = true;
    s.pitch = 2;
    const cols = noteColumns(kick, pat.lanes[kick.id], trackGrid(pat, kick.id, 1));
    expect(cols[0].get(4)).toMatchObject({ kind: "note", pitch: hitNoteOf(kick) + 2 });
  });
});

describe("effect commands (D271)", () => {
  it("writes each field and reads it back", () => {
    const { kick, keys } = project();
    const s = emptyStep();
    for (const cmd of ["N90", "R03", "Y80", "I12", "S01", "EC8"])
      expect(applyFx(s, kick, cmd)).toBeNull();
    expect(s).toMatchObject({ ratchet: 3, accent: true, condition: "1:2", gate: 0.5 });
    expect(stepFx(s, kick)).toEqual(["EC8", "N90", "R03", "Y80", "I12", "S01"]);
    expect(applyFx(s, kick, "IF1")).toBeNull();
    expect(s.condition).toBe("FILL");
    expect(applyFx(s, kick, "ED4")).toBeNull();
    expect(s.nudge).toBe(0.25);
    expect(applyFx(s, kick, "9C0")).toBeNull();
    expect(stepFx(s, kick)[0]).toBe("9C0");
    // a Notes track has no sample start or cut, and glide needs a note
    const n = emptyStep();
    expect(applyFx(n, keys, "9C0")).toMatch(/hits of a sample/);
    expect(applyFx(n, keys, "EC4")).toMatch(/Hits tracks/);
    expect(applyFx(n, keys, "300")).toMatch(/note/);
    n.notes = [{ pitch: 60, length: 1, velocity: 0.8 }];
    expect(applyFx(n, keys, "300")).toBeNull();
    expect(stepFx(n, keys)).toEqual(["300"]);
  });

  it("says why FT2 commands Rebeat doesn't have aren't accepted", () => {
    const { kick } = project();
    expect(applyFx(emptyStep(), kick, "F06")).toMatch(/Tempo lane/);
    expect(applyFx(emptyStep(), kick, "A0F")).toMatch(/volume slides/);
    expect(applyFx(emptyStep(), kick, "I35")).toMatch(/Conditions/);
  });
});

describe("writing notes (D268)", () => {
  it("a column plays one note at a time: a new note ends the one before", () => {
    const { p, pat, keys } = project();
    let r = edit(p, (d) => writeNote(d, at(pat), keys.id, 0, 0, 60, 0.8));
    let lane = r.p.patterns[pat.id].lanes[keys.id];
    expect(lane.steps[0].notes).toEqual([{ pitch: 60, length: 16, velocity: 0.8, col: 0 }]);
    r = edit(r.p, (d) => writeNote(d, at(pat), keys.id, 4, 0, 62, 0.5));
    lane = r.p.patterns[pat.id].lanes[keys.id];
    expect(lane.steps[0].notes![0].length).toBe(4);
    expect(lane.steps[4].notes![0]).toMatchObject({ pitch: 62, length: 12, velocity: 0.5 });
    // a note typed above another one runs until it
    r = edit(r.p, (d) => writeNote(d, at(pat), keys.id, 2, 0, 64, 0.8));
    lane = r.p.patterns[pat.id].lanes[keys.id];
    expect(lane.steps[0].notes![0].length).toBe(2);
    expect(lane.steps[2].notes![0]).toMatchObject({ pitch: 64, length: 2 });
    // typing over a note keeps its length
    r = edit(r.p, (d) => writeNote(d, at(pat), keys.id, 2, 0, 65, 0.8));
    expect(r.p.patterns[pat.id].lanes[keys.id].steps[2].notes![0]).toMatchObject({
      pitch: 65,
      length: 2,
    });
  });

  it("note-offs end a note, and clearing one lets it run on", () => {
    const { p, pat, keys } = project();
    let r = edit(p, (d) => writeNote(d, at(pat), keys.id, 0, 0, 60, 0.8));
    r = edit(r.p, (d) => writeOff(d, at(pat), keys.id, 3, 0));
    expect(r.p.patterns[pat.id].lanes[keys.id].steps[0].notes![0].length).toBe(3);
    r = edit(r.p, (d) => clearNote(d, at(pat), keys.id, 3, 0));
    expect(r.p.patterns[pat.id].lanes[keys.id].steps[0].notes![0].length).toBe(16);
  });

  it("on finer rows a note starts between steps (its offset)", () => {
    const { p, pat, keys } = project();
    const r = edit(p, (d) => writeNote(d, at(pat, 2), keys.id, 3, 0, 60, 0.8));
    const notes = r.p.patterns[pat.id].lanes[keys.id].steps[2].notes!;
    expect(notes[0]).toMatchObject({ pitch: 60, offset: -0.5 });
  });

  it("hits take the pitch from their note, up to an octave", () => {
    const { p, pat, kick } = project();
    const base = hitNoteOf(kick);
    let r = edit(p, (d) => writeNote(d, at(pat), kick.id, 2, 0, base + 3, 0.6));
    expect(r.p.patterns[pat.id].lanes[kick.id].steps[2]).toMatchObject({
      on: true,
      pitch: 3,
      velocity: 0.6,
    });
    r = edit(r.p, (d) => writeNote(d, at(pat), kick.id, 3, 0, base + 20, 0.6));
    expect(r.out).toMatch(/octave/);
    expect(r.p.patterns[pat.id].lanes[kick.id].steps[3].pitch).toBe(12);
  });

  it("a ghost row edits the step it repeats", () => {
    const { p, pat, kick } = project();
    pat.lanes[kick.id].stepCountOverride = 4;
    const r = edit(p, (d) => writeNote(d, at(pat), kick.id, 9, 0, hitNoteOf(kick), 0.8));
    expect(r.p.patterns[pat.id].lanes[kick.id].steps[1].on).toBe(true);
  });

  it("the volume needs a note, and effects need a step's row", () => {
    const { p, pat, keys, kick } = project();
    let r = edit(p, (d) => setVolume(d, at(pat), keys.id, 0, 0, 0x40));
    expect(r.out).toMatch(/note first/);
    r = edit(r.p, (d) => writeNote(d, at(pat), keys.id, 0, 0, 60, 0.8));
    r = edit(r.p, (d) => setVolume(d, at(pat), keys.id, 0, 0, 0x40));
    expect(r.p.patterns[pat.id].lanes[keys.id].steps[0].notes![0].velocity).toBeCloseTo(64 / 127);
    r = edit(r.p, (d) => writeFx(d, at(pat, 2), kick.id, 1, "R02"));
    expect(r.out).toMatch(/Between/);
  });
});

describe("rows and blocks", () => {
  it("inserts and deletes rows in a track", () => {
    const { p, pat, kick } = project();
    pat.lanes[kick.id].steps[2].on = true;
    let r = edit(p, (d) => shiftRows(d, at(pat), [kick.id], 1, 1));
    expect(r.p.patterns[pat.id].lanes[kick.id].steps[3].on).toBe(true);
    expect(r.p.patterns[pat.id].lanes[kick.id].steps[2].on).toBe(false);
    r = edit(r.p, (d) => shiftRows(d, at(pat), [kick.id], 0, -1));
    expect(r.p.patterns[pat.id].lanes[kick.id].steps[2].on).toBe(true);
  });

  it("transposes, scales and interpolates a block", () => {
    const { p, pat, keys } = project();
    let r = edit(p, (d) => {
      writeNote(d, at(pat), keys.id, 0, 0, 60, 0.8);
      writeNote(d, at(pat), keys.id, 4, 0, 62, 0.2);
      writeNote(d, at(pat), keys.id, 8, 0, 64, 0.8);
    });
    const block = { trackIds: [keys.id], from: 0, to: 8 };
    r = edit(r.p, (d) => transposeBlock(d, at(pat), block, 12));
    const lane = () => r.p.patterns[pat.id].lanes[keys.id];
    expect([0, 4, 8].map((i) => lane().steps[i].notes![0].pitch)).toEqual([72, 74, 76]);
    r = edit(r.p, (d) => interpolate(d, at(pat), keys.id, block, { kind: "volume", col: 0 }));
    expect(lane().steps[4].notes![0].velocity).toBeCloseTo(0.8);
    r = edit(r.p, (d) => scaleVolume(d, at(pat), block, 0.5));
    expect(lane().steps[0].notes![0].velocity).toBeCloseTo(51 / 127);
  });

  it("copies and pastes a block, also from hits into notes", () => {
    const { p, pat, kick, keys } = project();
    let r = edit(p, (d) => {
      writeNote(d, at(pat), kick.id, 0, 0, hitNoteOf(kick), 0.8);
      writeFx(d, at(pat), kick.id, 0, "R03");
      writeNote(d, at(pat), kick.id, 2, 0, hitNoteOf(kick) + 1, 0.8);
    });
    const block = { trackIds: [kick.id], from: 0, to: 3 };
    const clip = copyBlock(r.p, at(pat), block, hitNoteOf);
    r = edit(r.p, (d) => pasteBlock(d, at(pat), clip, [kick.id], 8, false));
    const k = r.p.patterns[pat.id].lanes[kick.id].steps;
    expect([k[8].on, k[8].ratchet, k[10].on, k[10].pitch]).toEqual([true, 3, true, 1]);
    r = edit(r.p, (d) => pasteBlock(d, at(pat), clip, [keys.id], 0, false));
    const n = r.p.patterns[pat.id].lanes[keys.id].steps;
    expect(n[2].notes![0].pitch).toBe(hitNoteOf(kick) + 1);
  });

  it("lays out a track's columns", () => {
    const { p, pat, keys } = project();
    const r = edit(p, (d) => {
      writeNote(d, at(pat), keys.id, 0, 0, 60, 0.8);
      writeNote(d, at(pat), keys.id, 0, 1, 64, 0.8);
      writeFx(d, at(pat), keys.id, 0, "R02");
      writeFx(d, at(pat), keys.id, 0, "Y40");
      d.patterns[pat.id].lanes[keys.id].steps[0].locks = { "sound.macro1": 1 };
    });
    const layout = trackLayout(r.p.tracks[1], r.p.patterns[pat.id], 1, { notes: 3 });
    expect(layout.notes.length).toBe(3);
    expect(layout.fxCols).toBe(2);
    expect(layout.locks).toEqual(["sound.macro1"]);
  });
});
