import { describe, expect, it } from "vitest";
import { emptyProject, hitsTrack, notesTrack, page, synth } from "../templates/builder";
import { lockLabel, rowLabel, rowSegments, trackerColumns } from "./trackerText";

function project() {
  const p = emptyProject("T", 120);
  p.tracks.push(hitsTrack("Kick", "kit:808:kick", "808 Kick", "kick"));
  p.tracks.push(notesTrack("Keys", synth("pad"), "Pad", "keys"));
  const pat = page(p, "A", 16);
  return { p, pat };
}

describe("the tracker's text", () => {
  it("lays out each track's fields: note, volume digits, effect letter and digits", () => {
    const { p, pat } = project();
    const [kick] = trackerColumns(p, pat, 1, false);
    expect(kick.fields.map((f) => `${f.kind}${f.digit}@${f.x}`)).toEqual([
      "note0@1",
      "vol0@5",
      "vol1@6",
      "fx0@8",
      "fx1@9",
      "fx2@10",
    ]);
    // decimal volumes have three digits
    const [dec] = trackerColumns(p, pat, 1, true);
    expect(dec.fields.filter((f) => f.kind === "vol").length).toBe(3);
  });

  it("writes a row's notes, volumes and commands, and dots where there's nothing", () => {
    const { p, pat } = project();
    const kick = p.tracks[0];
    Object.assign(pat.lanes[kick.id].steps[0], { on: true, velocity: 1, ratchet: 3 });
    const [cols] = trackerColumns(p, pat, 1, false);
    const row0 = rowSegments(cols, pat, 0, false).segments.map((s) => s.text);
    expect(row0).toEqual(["C-4", "7F", "R03"]);
    const row1 = rowSegments(cols, pat, 1, false).segments.map((s) => s.text);
    expect(row1).toEqual(["···", "··", "···"]);
  });

  it("leaves the rows between a Hits track's steps empty and shaded", () => {
    const { p, pat } = project();
    const [cols] = trackerColumns(p, pat, 2, false);
    expect(rowSegments(cols, pat, 1, false)).toMatchObject({ segments: [], shaded: true });
    const keys = trackerColumns(p, pat, 2, false)[1];
    // a Notes track's notes can start between its steps: its note fields stay
    expect(rowSegments(keys, pat, 1, false).segments.map((s) => s.text)).toEqual(["···", "··"]);
  });

  it("names rows and lock columns", () => {
    expect(rowLabel(10, 2)).toBe("0A");
    expect(rowLabel(300, 3)).toBe("12C");
    expect(lockLabel("sound.cutoff", { "sound.cutoff": "Cutoff" })).toBe("CUT");
    expect(lockLabel("sound.macro2", {})).toBe("MAC");
  });
});
