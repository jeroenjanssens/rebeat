import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAY_STYLE,
  PATTERNS,
  arpNote,
  arpSequence,
  balanceFactors,
  patternById,
  patternHits,
  sanitizePlayStyle,
  slopFor,
  smoothVoicing,
  strumOffsets,
} from "./perform";
import { voiceChord } from "./padChords";

describe("strum (D150)", () => {
  it("spreads a hit's notes over its time, up from the lowest or down from the highest", () => {
    const up = strumOffsets(4, 0.06, false);
    expect(up[0]).toBe(0);
    expect(up[3]).toBeCloseTo(0.06);
    expect(up).toEqual([...up].sort((a, b) => a - b));
    const down = strumOffsets(4, 0.06, true);
    expect(down[3]).toBe(0);
    expect(down[0]).toBeCloseTo(0.06);
  });

  it("speeds up a little as it goes, like a hand", () => {
    const o = strumOffsets(5, 0.1, false);
    const gaps = o.slice(1).map((t, i) => t - o[i]);
    expect(gaps[0]).toBeGreaterThan(gaps[3]);
  });

  it("leaves one note, or no time, alone", () => {
    expect(strumOffsets(1, 0.1, false)).toEqual([0]);
    expect(strumOffsets(3, 0, false)).toEqual([0, 0, 0]);
  });
});

describe("slop and balance (D150)", () => {
  it("only ever starts a note later, within the amount; velocity both ways", () => {
    expect(slopFor(1, 0, 0.5)).toEqual({ delay: 0, vel: 1 });
    expect(slopFor(1, 1, 1).delay).toBeCloseTo(0.04);
    expect(slopFor(1, 1, 1).vel).toBeCloseTo(1.3);
    expect(slopFor(1, 1, 0).vel).toBeCloseTo(0.7);
    expect(slopFor(0, 1, 1)).toEqual({ delay: 0, vel: 1 });
  });

  it("keeps the bass and the top at full velocity, the notes between softer", () => {
    expect(balanceFactors(4, 0)).toEqual([1, 1, 1, 1]);
    const f = balanceFactors(4, 0.5);
    expect(f[0]).toBe(1);
    expect(f[3]).toBe(1);
    expect(f[1]).toBeCloseTo(0.825);
    expect(balanceFactors(2, 1)).toEqual([1, 1]);
  });
});

describe("the arpeggiator (D151)", () => {
  const C = [60, 64, 67];
  it("goes up, down, up and down, and as played, over octaves", () => {
    expect(arpSequence(C, "up", 1)).toEqual([60, 64, 67]);
    expect(arpSequence([67, 60, 64], "up", 2)).toEqual([60, 64, 67, 72, 76, 79]);
    expect(arpSequence(C, "down", 1)).toEqual([67, 64, 60]);
    expect(arpSequence(C, "updown", 1)).toEqual([60, 64, 67, 64]);
    expect(arpSequence([67, 60, 64], "played", 2)).toEqual([67, 60, 64, 79, 72, 76]);
  });

  it("counts on across chord changes, and random doesn't repeat a note", () => {
    expect(arpNote(C, "up", 1, 4, null, Math.random)).toBe(64);
    expect(arpNote([65, 69, 72], "up", 1, 4, null, Math.random)).toBe(69);
    for (let i = 0; i < 20; i++) expect(arpNote(C, "random", 1, i, 64, Math.random)).not.toBe(64);
    expect(arpNote([], "up", 1, 0, null, Math.random)).toBeNull();
  });
});

describe("patterns (D153)", () => {
  it("has the 22 patterns, calm to busy, every hit inside its pattern", () => {
    expect(PATTERNS.map((p) => p.id)).toEqual([
      "whole",
      "halves",
      "ballad",
      "waltz",
      "quarters",
      "backbeat",
      "dotted",
      "charleston",
      "eighths",
      "offbeats",
      "onedrop",
      "ska",
      "tresillo",
      "oompah",
      "clave",
      "bossa",
      "shuffle",
      "house",
      "funk",
      "montuno",
      "gallop",
      "pulse",
    ]);
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
    for (const p of PATTERNS)
      for (const s of p.steps) {
        expect(s.at).toBeGreaterThanOrEqual(0);
        expect(s.at).toBeLessThan(p.length);
        expect(s.length).toBeGreaterThan(0);
      }
  });

  it("plays the new ones as written: a waltz in three, one drop on 3, a gallop on every beat", () => {
    const waltz = patternById("waltz");
    expect(waltz.length).toBe(12);
    expect([0, 4, 8, 12].map((n) => patternHits(waltz, n).map((s) => s.part))).toEqual([
      ["bass"],
      ["chord"],
      ["chord"],
      ["bass"],
    ]);
    expect(patternHits(patternById("onedrop"), 0)).toEqual([]);
    expect(patternHits(patternById("onedrop"), 8).map((s) => s.part)).toEqual(["bass"]);
    const gallop = patternById("gallop");
    expect([0, 1, 2, 3].map((n) => patternHits(gallop, n).length)).toEqual([1, 0, 1, 1]);
  });

  it("finds a pattern's hits as it loops", () => {
    const oompah = patternById("oompah");
    expect(patternHits(oompah, 0).map((s) => s.part)).toEqual(["bass"]);
    expect(patternHits(oompah, 4).map((s) => s.part)).toEqual(["chord"]);
    expect(patternHits(oompah, 20).map((s) => s.part)).toEqual(["chord"]);
    expect(patternHits(oompah, 1)).toEqual([]);
    expect(patternById("nope").id).toBe("whole");
  });
});

describe("smooth voicing (D152)", () => {
  const C = [60, 64, 67];
  const F = [65, 69, 72];
  const G = [67, 71, 74];
  it("plays the first chord at home", () => {
    expect(smoothVoicing(null, F, 0)).toBe(0);
    expect(smoothVoicing(null, F, 2)).toBe(2);
  });

  it("moves by small steps: C then F is C F A, then G is D G B", () => {
    const f = voiceChord(F, smoothVoicing(C, F, 0));
    expect(f).toEqual([60, 65, 69]);
    const g = voiceChord(G, smoothVoicing(f, G, 0));
    // B D G moves as little, but is more than 7 semitones below home: D G B
    expect(g).toEqual([62, 67, 71]);
  });

  it("stays near home over a long progression", () => {
    let prev: number[] = C;
    for (let i = 0; i < 24; i++) {
      const chord = [C, F, G][i % 3].map((n) => n + ((i * 2) % 12));
      prev = voiceChord(chord, smoothVoicing(prev, chord, 0));
      const home = voiceChord(chord, 0);
      const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
      expect(Math.abs(avg(prev) - avg(home))).toBeLessThanOrEqual(7);
    }
  });
});

describe("stored play styles", () => {
  it("fill in what's missing and clamp what's out of range", () => {
    expect(sanitizePlayStyle(undefined)).toEqual(DEFAULT_PLAY_STYLE);
    const s = sanitizePlayStyle({
      strum: { on: true, time: 9, direction: "sideways" },
      arp: { rate: "1/64", octaves: 9 },
      pattern: { id: "bossa" },
      balance: 2,
    });
    expect(s.strum).toEqual({ on: true, time: 0.25, direction: "up" });
    expect(s.arp.rate).toBe("1/16");
    expect(s.arp.octaves).toBe(4);
    expect(s.pattern.id).toBe("bossa");
    expect(s.balance).toBe(1);
  });
});
