/**
 * Example songs: well-known drum-machine classics with their grooves, tempos, keys and chord
 * progressions. Basslines and synth parts are written in the style of the originals (they aren't
 * note-for-note copies). Examples are read-only: the first change makes a copy (storage/projects).
 */
import { makeEffect } from "../model/effects";
import type { Project } from "../model/project";
import { chord, drum, drumTrack, emptyProject, note, notes, page, synthTrack } from "./builder";
import { demoProject } from "./nightDrive";
import { SHOWCASE } from "./showcase";

export interface Example {
  id: string;
  name: string;
  artist: string;
  year: number;
  create: () => Project;
}

const k909 = (s: string) => `kit:909:${s}`;
const k808 = (s: string) => `kit:808:${s}`;

/** Eighth-note octave bass on a progression: [chord root, octave, length in 8ths][] from step 0. */
function octaveBass(roots: [string, number, number][]) {
  const out: [number, number[], number][] = [];
  let step = 0;
  for (const [root, oct, eighths] of roots)
    for (let i = 0; i < eighths; i++, step += 2) out.push([step, [note(root, oct + (i % 2))], 1]);
  return out;
}

/** Sustained chords: [name, length in steps][] from step 0. */
function pads(list: [string, number][], octave = 4) {
  const out: [number, number[], number][] = [];
  let step = 0;
  for (const [name, len] of list) {
    out.push([step, chord(name, octave), len]);
    step += len;
  }
  return out;
}

// ---------- Blue Monday (New Order, 1983) ----------

function blueMonday(): Project {
  const p = emptyProject("Blue Monday", 130);
  p.key = { root: 2, scale: "minor" };
  const kick = drumTrack("Kick", k909("kick"), "909 Kick", "kick", [makeEffect("Compressor")]);
  const snare = drumTrack("Snare", k909("snare"), "909 Snare", "snare");
  const chh = drumTrack("Cl Hat", k909("chh"), "909 Closed Hat", "hat");
  const ohh = drumTrack("Op Hat", k909("ohh"), "909 Open Hat", "hat");
  const bass = synthTrack("Bass", "sub", "Mono · Sub Bass", "bass");
  const seq = synthTrack("Sequence", "pluck", "Poly · Pluck", "keys", [
    makeEffect("Delay", { mix: 0.2 }),
  ]);
  const pad = synthTrack("Strings", "warm-pad", "Poly · Warm Pad", "keys");
  pad.params["mix.sendA"] = 0.45;
  pad.volume = 0.6;
  chh.params["sound.choke"] = ohh.params["sound.choke"] = 1 / 8;
  p.tracks = [kick, snare, chh, ohh, bass, seq, pad];

  const intro = page(p, "Intro", 16, 2);
  drum(intro, kick, "X... x... x... x...");
  // the famous sixteenth-note kick runs
  const roll = page(p, "Kick roll", 16, 1);
  drum(roll, kick, "Xooo xooo xoxo XxXx");
  const groove = page(p, "Groove", 32, 2);
  drum(groove, kick, "X... x... x... x... X... x... x... x...");
  drum(groove, snare, ".... x... .... x... .... x... .... x...");
  drum(groove, chh, "x.o. x.o. x.o. x.o. x.o. x.o. x.o. x.o.");
  drum(groove, ohh, "..x. ..x. ..x. ..x. ..x. ..x. ..x. ..x.");
  notes(
    groove,
    bass,
    octaveBass([
      ["F", 1, 4],
      ["C", 2, 4],
      ["D", 1, 8],
    ]),
  );
  notes(groove, seq, [
    [0, [note("A", 4)], 2],
    [6, [note("F", 4)], 2],
    [8, [note("G", 4)], 2],
    [14, [note("E", 4)], 2],
    [16, [note("F", 4)], 3],
    [20, [note("D", 4)], 2],
    [24, [note("A", 4)], 3],
    [28, [note("F", 4)], 4],
  ]);
  notes(
    groove,
    pad,
    pads([
      ["F", 8],
      ["C", 8],
      ["Dm", 16],
    ]),
    0.6,
  );
  const brk = page(p, "Break", 16, 1);
  drum(brk, snare, ".... x... x.x. xrxr");
  drum(brk, chh, "xxxx xxxx xxxx xxxx");
  notes(brk, pad, [[0, chord("Dm"), 16]], 0.6);
  p.slots.push({ id: "slot-groove-2", patternId: groove.id, repeats: 2 });
  return p;
}

// ---------- Billie Jean (Michael Jackson, 1982) ----------

function billieJean(): Project {
  const p = emptyProject("Billie Jean", 117);
  p.key = { root: 6, scale: "minor" };
  p.swing = 0.52;
  const kick = drumTrack("Kick", k909("kick"), "909 Kick", "kick");
  const snare = drumTrack("Snare", k808("snare"), "808 Snare", "snare");
  const chh = drumTrack("Cl Hat", k909("chh"), "909 Closed Hat", "hat");
  const shaker = drumTrack("Shaker", k808("chh"), "808 Closed Hat", "perc");
  shaker.volume = 0.55;
  const bass = synthTrack("Bass", "acid", "Mono · Acid Bass", "bass");
  bass.params["sound.cutoff"] = 0.45;
  const stabs = synthTrack("Synth", "keys", "Poly · Keys", "keys", [makeEffect("Chorus")]);
  stabs.params["mix.sendA"] = 0.3;
  p.tracks = [kick, snare, chh, shaker, bass, stabs];

  // the drum groove alone
  const drums = page(p, "Drums", 16, 2);
  const beat = (pt: typeof drums, bars: number) => {
    const r = (s: string) => s.repeat(bars);
    drum(pt, kick, r("x... .... x... ...."));
    drum(pt, snare, r(".... x... .... x..."));
    drum(pt, chh, r("x.x. x.x. x.x. x.x."));
    drum(pt, shaker, r("..o. ..o. ..o. ..o."));
  };
  beat(drums, 1);
  // F#m – G#m/F# – A/F# – G#m/F#, over a pedal on F#
  const groove = page(p, "Groove", 64, 2);
  beat(groove, 4);
  notes(groove, bass, octaveBass([["F#", 1, 32]]));
  const prog = ["F#m", "G#m/F#", "A/F#", "G#m/F#"];
  notes(
    groove,
    stabs,
    prog.flatMap((c, bar) => [
      [bar * 16, chord(c, 4), 2],
      [bar * 16 + 10, chord(c, 4), 1],
    ]) as [number, number[], number][],
    0.7,
  );
  const breakdown = page(p, "Breakdown", 32, 1);
  drum(breakdown, chh, "x.x. x.x. x.x. x.x. x.x. x.x. x.x. x.x.");
  drum(breakdown, shaker, "..o. ..o. ..o. ..o. ..o. ..o. ..o. ..o.");
  notes(breakdown, bass, octaveBass([["F#", 1, 16]]));
  return p;
}

// ---------- Planet Rock (Afrika Bambaataa & the Soulsonic Force, 1982) ----------

function planetRock(): Project {
  const p = emptyProject("Planet Rock", 127);
  p.key = { root: 4, scale: "minor" };
  const kick = drumTrack("Kick", k808("kick"), "808 Kick", "kick");
  const snare = drumTrack("Snare", k808("snare"), "808 Snare", "snare");
  const clap = drumTrack("Clap", k808("clap"), "808 Clap", "clap");
  const chh = drumTrack("Cl Hat", k808("chh"), "808 Closed Hat", "hat");
  const cow = drumTrack("Cowbell", k808("cowbell"), "808 Cowbell", "perc");
  const tom = drumTrack("Tom", k808("tom"), "808 Tom", "tom");
  const bass = synthTrack("Bass", "sub", "Mono · Sub Bass", "bass");
  const stab = synthTrack("Stabs", "fm-bell", "FM · Bell", "keys", [
    makeEffect("Reverb", { mix: 0.25 }),
  ]);
  cow.volume = 0.6;
  p.tracks = [kick, snare, clap, chh, cow, tom, bass, stab];

  const electro = (pt: ReturnType<typeof page>) => {
    drum(pt, kick, "x..... x...x..... x..... x...x.x...");
    drum(pt, snare, ".... x... .... x... .... x... .... x...");
    drum(pt, clap, ".... x... .... x... .... x... .... x..x");
    drum(pt, chh, "xoxo xoxo xoxo xoxo xoxo xoxo xoxo xoxx");
  };
  const beat = page(p, "Beat", 32, 2);
  electro(beat);
  const main = page(p, "Main", 32, 4);
  electro(main);
  drum(main, cow, "..x. ..x. .... x... ..x. ..x. .... x...");
  notes(main, bass, [
    [0, [note("E", 1)], 2],
    [3, [note("E", 1)], 1],
    [6, [note("E", 2)], 1],
    [10, [note("D", 1)], 2],
    [16, [note("C", 1)], 2],
    [19, [note("C", 1)], 1],
    [22, [note("C", 2)], 1],
    [26, [note("D", 1)], 2],
  ]);
  notes(main, stab, [
    [0, chord("Em", 4), 2],
    [6, chord("Em", 4), 1],
    [10, chord("D", 4), 2],
    [16, chord("C", 4), 2],
    [22, chord("C", 4), 1],
    [26, chord("D", 4), 2],
  ]);
  const brk = page(p, "Break", 32, 1);
  drum(brk, kick, "x..... x...x..... x....... ........");
  drum(brk, chh, "xoxo xoxo xoxo xoxo xoxo xoxo .... ....");
  drum(brk, tom, ".... .... .... .... .... .... x.x. xxxx");
  return p;
}

// ---------- Sweet Dreams (Are Made of This) (Eurythmics, 1983) ----------

function sweetDreams(): Project {
  const p = emptyProject("Sweet Dreams", 126);
  p.key = { root: 0, scale: "minor" };
  const kick = drumTrack("Kick", k909("kick"), "909 Kick", "kick");
  const snare = drumTrack("Snare", k909("snare"), "909 Snare", "snare");
  const clap = drumTrack("Clap", k909("clap"), "909 Clap", "clap");
  const chh = drumTrack("Cl Hat", k909("chh"), "909 Closed Hat", "hat");
  const bass = synthTrack("Bass Seq", "acid", "Mono · Acid Bass", "bass", [
    makeEffect("Delay", { mix: 0.15 }),
  ]);
  const strings = synthTrack("Strings", "warm-pad", "Poly · Warm Pad", "keys");
  strings.params["mix.sendA"] = 0.4;
  strings.volume = 0.75;
  // the intro is bass and strings alone: give them a little more level
  bass.volume = 0.95;
  p.tracks = [kick, snare, clap, chh, bass, strings];

  // Cm (a bar) – Ab – G (half a bar each): the sequenced bass runs in eighths
  const progression: [string, number, number][] = [
    ["C", 1, 8],
    ["Ab", 1, 4],
    ["G", 1, 4],
  ];
  const harmony: [string, number][] = [
    ["Cm", 16],
    ["Ab", 8],
    ["G", 8],
  ];
  const intro = page(p, "Intro", 32, 2);
  drum(intro, kick, "x... x... x... x... x... x... x... x...");
  drum(intro, chh, "..o. ..o. ..o. ..o. ..o. ..o. ..o. ..o.");
  notes(intro, bass, octaveBass(progression));
  notes(intro, strings, pads(harmony), 0.5);
  const verse = page(p, "Verse", 32, 4);
  drum(verse, kick, "x... x... x... x... x... x... x... x...");
  drum(verse, snare, ".... x... .... x... .... x... .... x...");
  drum(verse, clap, ".... x... .... x... .... x... .... x.x.");
  drum(verse, chh, "..x. ..x. ..x. ..x. ..x. ..x. ..x. ..xx");
  notes(verse, bass, octaveBass(progression));
  notes(verse, strings, pads(harmony), 0.55);
  const brk = page(p, "Break", 32, 1);
  drum(brk, kick, "x... .... x... .... x... .... x.x. xxxx");
  notes(brk, strings, pads([["Cm", 32]]), 0.55);
  return p;
}

// ---------- Around the World (Daft Punk, 1997) ----------

function aroundTheWorld(): Project {
  const p = emptyProject("Around the World", 121);
  p.key = { root: 4, scale: "dorian" };
  const kick = drumTrack("Kick", k909("kick"), "909 Kick", "kick", [makeEffect("Compressor")]);
  const clap = drumTrack("Clap", k909("clap"), "909 Clap", "clap");
  const chh = drumTrack("Cl Hat", k909("chh"), "909 Closed Hat", "hat");
  const ohh = drumTrack("Op Hat", k909("ohh"), "909 Open Hat", "hat");
  const bass = synthTrack("Bass", "acid", "Mono · Acid Bass", "bass", [
    makeEffect("Filter", { cutoff: 0.55, depth: 0.25 }),
  ]);
  const chords = synthTrack("Chords", "fm-epiano", "FM · E-Piano", "keys");
  chords.params["mix.sendB"] = 0.25;
  chh.params["sound.choke"] = ohh.params["sound.choke"] = 1 / 8;
  p.tracks = [kick, clap, chh, ohh, bass, chords];

  const house = (pt: ReturnType<typeof page>, bars: number, withKick = true) => {
    const r = (s: string) => s.repeat(bars);
    if (withKick) drum(pt, kick, r("X... x... x... x..."));
    drum(pt, ohh, r("..x. ..x. ..x. ..x."));
    drum(pt, chh, r("o.o. o.o. o.o. o.o."));
  };
  const kickPage = page(p, "Kick", 16, 2);
  house(kickPage, 1);
  // a funky, syncopated bass climbing over two bars
  const bassline = (pt: ReturnType<typeof page>) =>
    notes(pt, bass, [
      [0, [note("E", 2)], 2],
      [3, [note("E", 2)], 1],
      [6, [note("G", 2)], 1],
      [8, [note("A", 2)], 2],
      [11, [note("B", 2)], 1],
      [14, [note("D", 3)], 1, true],
      [16, [note("E", 3)], 2],
      [19, [note("D", 3)], 1],
      [22, [note("B", 2)], 1],
      [24, [note("A", 2)], 2],
      [27, [note("G", 2)], 1],
      [30, [note("F#", 2)], 1, true],
    ]);
  const groove = page(p, "Groove", 32, 4);
  house(groove, 2);
  drum(groove, clap, ".... x... .... x... .... x... .... x...");
  bassline(groove);
  const filter = page(p, "Chords", 32, 2);
  // the kick drops out under the chords
  house(filter, 2, false);
  drum(filter, clap, ".... x... .... x... .... x... .... x...");
  notes(
    filter,
    chords,
    pads(
      [
        ["Em7", 16],
        ["A7", 16],
      ],
      3,
    ),
    0.6,
  );
  bassline(filter);
  p.slots.push({ id: "slot-groove-2", patternId: groove.id, repeats: 4 });
  return p;
}

export const EXAMPLES: Example[] = [
  {
    id: "night-drive",
    name: "Night Drive",
    artist: "Rebeat demo",
    year: 2026,
    create: demoProject,
  },
  { id: "blue-monday", name: "Blue Monday", artist: "New Order", year: 1983, create: blueMonday },
  {
    id: "billie-jean",
    name: "Billie Jean",
    artist: "Michael Jackson",
    year: 1982,
    create: billieJean,
  },
  {
    id: "planet-rock",
    name: "Planet Rock",
    artist: "Afrika Bambaataa & the Soulsonic Force",
    year: 1982,
    create: planetRock,
  },
  {
    id: "sweet-dreams",
    name: "Sweet Dreams",
    artist: "Eurythmics",
    year: 1983,
    create: sweetDreams,
  },
  {
    id: "neon-horizon",
    name: "Neon Horizon",
    artist: "Rebeat demo · factory synths",
    year: 2026,
    create: SHOWCASE.neonHorizon,
  },
  {
    id: "late-night-cafe",
    name: "Late Night Café",
    artist: "Rebeat demo · sampled instruments",
    year: 2026,
    create: SHOWCASE.lateNightCafe,
  },
  {
    id: "around-the-world",
    name: "Around the World",
    artist: "Daft Punk",
    year: 1997,
    create: aroundTheWorld,
  },
];

export const EXAMPLE_PREFIX = "example:";
export const isExampleId = (id: string) => id.startsWith(EXAMPLE_PREFIX);
export const exampleFor = (id: string) => EXAMPLES.find((e) => `${EXAMPLE_PREFIX}${e.id}` === id);
