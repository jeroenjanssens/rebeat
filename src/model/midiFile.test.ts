import { describe, expect, it } from "vitest";
import { demoProject } from "../templates/nightDrive";
import { exportMidi } from "./midiFile";

describe("MIDI export", () => {
  it("writes a type-1 file with a conductor track and one track per drum/instrument track", () => {
    const p = demoProject();
    const bytes = exportMidi(p, "page", "slot-verse");
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    expect(bytes[9]).toBe(1); // format 1
    const tracks = (bytes[10] << 8) | bytes[11];
    expect(tracks).toBe(p.tracks.filter((t) => t.mode !== "clip").length + 1);
    // the kick plays GM note 36 on channel 10 (0x99)
    const kickOn = [...bytes].findIndex((b, i) => b === 0x99 && bytes[i + 1] === 36);
    expect(kickOn).toBeGreaterThan(0);
  });

  it("puts Hits on channel 10 and Notes on their own channels, whatever plays them", () => {
    const p = demoProject();
    const bass = p.tracks.find((t) => t.name === "Bass")!;
    const notesOn = (b: Uint8Array) => [...b].filter((x) => (x & 0xf0) === 0x90 && x !== 0x99);
    const before = notesOn(exportMidi(p, "page", "slot-verse")).length;
    // the bass synth playing hits: drums now, on channel 10, at its category's GM note
    bass.mode = "hits";
    const bytes = exportMidi(p, "page", "slot-verse");
    expect(notesOn(bytes).length).toBeLessThan(before);
    expect([...bytes].some((b) => b === 0x99)).toBe(true);
  });

  it("includes the tempo", () => {
    const p = demoProject();
    const bytes = [...exportMidi(p, "song")];
    const i = bytes.findIndex((b, j) => b === 0xff && bytes[j + 1] === 0x51);
    const tempo = (bytes[i + 3] << 16) | (bytes[i + 4] << 8) | bytes[i + 5];
    expect(Math.round(60_000_000 / tempo)).toBe(112);
  });
});
