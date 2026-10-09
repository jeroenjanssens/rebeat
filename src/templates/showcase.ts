/**
 * Two example songs that show off the instruments (D78–D80): one made of factory synths, one of
 * sampled instruments. Original compositions.
 */
import { makeEffect } from "../model/effects";
import type { Project } from "../model/project";
import type { Pattern, Track } from "../model/types";
import {
  chord,
  drum,
  emptyProject,
  hitsTrack,
  note,
  notes,
  notesTrack,
  page,
  sampled,
  splitLongPages,
  synth,
} from "./builder";

type NoteList = [number, number[], number, boolean?][];

/** Run `fn` for each bar of a progression, with the bar's chord and first step. */
const perBar = (progression: string[], fn: (name: string, at: number) => NoteList) =>
  progression.flatMap((c, bar) => fn(c, bar * 16));

/** The same drum pattern in every bar of a page. */
const bars = (code: string, n: number) => code.repeat(n);

// ---------- Neon Horizon: synthwave on the factory synths ----------

const NEON = ["Am", "F", "C", "G"];

/** I Feel Love-style 16ths: root, octave, fifth, octave. */
const sequence = (pattern: Pattern, bass: Track, prog = NEON) =>
  notes(
    pattern,
    bass,
    perBar(prog, (c, at) => {
      const root = chord(c, 1)[0];
      return Array.from({ length: 16 }, (_, i) => [
        at + i,
        [root + [0, 12, 7, 12][i % 4]],
        1,
      ]) as NoteList;
    }),
    0.75,
  );

/** Chord tones going up, in 16ths. */
const arpeggio = (pattern: Pattern, arp: Track, prog = NEON) =>
  notes(
    pattern,
    arp,
    perBar(prog, (c, at) => {
      const [a, b, d] = chord(c, 4);
      const tones = [a, b, d, a + 12];
      return Array.from({ length: 16 }, (_, i) => [at + i, [tones[i % 4]], 1]) as NoteList;
    }),
    0.55,
  );

const pads = (pattern: Pattern, pad: Track, prog = NEON) =>
  notes(
    pattern,
    pad,
    perBar(prog, (c, at) => [[at, chord(c, 3), 16]]),
    0.5,
  );

function neonHorizon(): Project {
  const p = emptyProject("Neon Horizon", 100);
  p.key = { root: 9, scale: "minor" };
  const kick = hitsTrack("Kick", "kit:909:kick", "909 Kick", "kick", [makeEffect("Compressor")]);
  const snare = hitsTrack("Snare", "kit:909:snare", "909 Snare", "snare");
  snare.params["mix.sendA"] = 0.45;
  const hat = hitsTrack("Cl Hat", "kit:808:chh", "808 Closed Hat", "hat");
  hat.volume = 0.6;
  const bass = notesTrack("Bass", synth("moroder-bass"), "Moroder Bass", "bass");
  const arp = notesTrack("Arp", synth("upside-down-arp"), "Upside Down Arp", "keys", [
    makeEffect("Delay", { mix: 0.25 }),
  ]);
  arp.volume = 0.55;
  const pad = notesTrack("Pad", synth("juno-strings"), "Juno Strings", "keys");
  pad.params["mix.sendA"] = 0.5;
  pad.volume = 0.65;
  const brass = notesTrack("Brass", synth("jump-brass"), "Jump Brass", "keys");
  brass.volume = 0.6;
  const lead = notesTrack("Lead", synth("axel-lead"), "Axel Lead", "keys", [
    makeEffect("Delay", { mix: 0.3 }),
  ]);
  lead.params["mix.sendA"] = 0.3;
  const riser = notesTrack("Riser", synth("noise-riser"), "Noise Riser", "fx");
  riser.volume = 0.6;
  p.tracks = [kick, snare, hat, bass, arp, pad, brass, lead, riser];
  // 2 dB of headroom after the master limiter: the chorus is dense
  p.master.volume = 0.71;

  const drums = (pt: Pattern) => {
    drum(pt, kick, bars("X... .... x... ....", 4));
    drum(pt, snare, bars(".... X... .... X...", 4));
    drum(pt, hat, bars("x.x. x.x. x.x. x.xo", 4));
  };

  const intro = page(p, "Intro", 64, 1);
  pads(intro, pad);
  arpeggio(intro, arp);

  const verse = page(p, "Verse", 64, 2);
  drums(verse);
  sequence(verse, bass);
  arpeggio(verse, arp);
  pads(verse, pad);

  const build = page(p, "Build", 64, 1);
  drum(build, kick, bars("x... x... x... x...", 4));
  drum(
    build,
    snare,
    ".... x... .... x... x... x... x... x... x.x. x.x. x.x. x.x. xxxx xxxx xxxx xxxx",
  );
  sequence(build, bass);
  notes(build, riser, [[0, [note("C", 4)], 64]], 0.8);
  pads(build, pad);

  const chorus = page(p, "Chorus", 64, 2);
  drums(chorus);
  sequence(chorus, bass);
  pads(chorus, pad);
  notes(
    chorus,
    brass,
    perBar(NEON, (c, at) => [
      [at, chord(c, 4), 3],
      [at + 6, chord(c, 4), 2],
      [at + 10, chord(c, 4), 4],
    ]),
    0.6,
  );
  notes(
    chorus,
    lead,
    [
      [0, [note("E", 5)], 4],
      [4, [note("D", 5)], 2],
      [6, [note("C", 5)], 2],
      [8, [note("D", 5)], 4],
      [12, [note("E", 5)], 4],
      [16, [note("F", 5)], 6],
      [22, [note("E", 5)], 2],
      [24, [note("C", 5)], 8],
      [32, [note("G", 5)], 4],
      [36, [note("E", 5)], 4],
      [40, [note("C", 5)], 4],
      [44, [note("E", 5)], 4],
      [48, [note("D", 5)], 8],
      [56, [note("B", 4)], 4],
      [60, [note("D", 5)], 4, true],
    ],
    0.8,
  );

  const outro = page(p, "Outro", 64, 1);
  pads(outro, pad);
  arpeggio(outro, arp);
  drum(outro, kick, "X... .... .... .... ".repeat(4));
  return p;
}

// ---------- Late Night Café: lo-fi jazz-hop on sampled instruments ----------

const CAFE = ["Dm7", "G7", "Cmaj7", "A7"];

/** A walking bass line in quarter notes. */
const WALK: [string, number][][] = [
  [
    ["D", 2],
    ["E", 2],
    ["F", 2],
    ["F#", 2],
  ],
  [
    ["G", 2],
    ["F", 2],
    ["D", 2],
    ["B", 1],
  ],
  [
    ["C", 2],
    ["E", 2],
    ["G", 2],
    ["A", 2],
  ],
  [
    ["A", 1],
    ["C#", 2],
    ["E", 2],
    ["G", 2],
  ],
];

const walk = (pattern: Pattern, bass: Track) =>
  notes(
    pattern,
    bass,
    WALK.flatMap((bar, b) =>
      bar.map(([n, o], i) => [b * 16 + i * 4, [note(n, o)], 4] as NoteList[0]),
    ),
    0.8,
  );

/** Piano comping: on the one, the and of two, and three. */
const comp = (pattern: Pattern, piano: Track) =>
  notes(
    pattern,
    piano,
    perBar(CAFE, (c, at) => [
      [at, chord(c, 3), 3],
      [at + 6, chord(c, 3), 2],
      [at + 10, chord(c, 3), 5],
    ]),
    0.55,
  );

function lateNightCafe(): Project {
  const p = emptyProject("Late Night Café", 84);
  p.key = { root: 0, scale: "major" };
  p.swing = 0.6;
  const kick = hitsTrack("Kick", "kit:808:kick", "808 Kick", "kick");
  kick.volume = 1;
  const snare = hitsTrack("Snare", "kit:808:snare", "808 Snare", "snare", [
    makeEffect("Filter", { cutoff: 0.55 }),
  ]);
  snare.params["mix.sendA"] = 0.3;
  const hat = hitsTrack("Hat", "kit:808:chh", "808 Closed Hat", "hat");
  hat.volume = 0.55;
  const piano = notesTrack("Piano", sampled("piano"), "Grand Piano", "keys");
  piano.params["mix.sendA"] = 0.25;
  const bass = notesTrack(
    "Upright",
    sampled("smolken:Pizzicato"),
    "Double Bass · Pizzicato",
    "bass",
  );
  bass.volume = 0.55;
  const vibes = notesTrack(
    "Vibes",
    sampled("mallet:Vibraphone - Hard Mallets"),
    "Vibraphone",
    "keys",
    [makeEffect("Delay", { mix: 0.2 })],
  );
  vibes.params["mix.sendA"] = 0.35;
  vibes.volume = 0.9;
  const strings = notesTrack(
    "Strings",
    sampled("sf:string_ensemble_1"),
    "String Ensemble 1",
    "keys",
  );
  strings.params["mix.sendA"] = 0.5;
  strings.volume = 0.75;
  const keys = notesTrack("E-Piano", sampled("sf:electric_piano_1"), "Electric Piano 1", "keys", [
    makeEffect("Chorus"),
  ]);
  keys.volume = 1;
  p.tracks = [kick, snare, hat, piano, bass, vibes, strings, keys];

  const drums = (pt: Pattern) => {
    drum(pt, kick, bars("x... ...x ..x. ....", 4));
    drum(pt, snare, bars(".... x... .... x..o", 4));
    drum(pt, hat, bars("x.xo x.xo x.xo x.xo", 4));
  };
  const melody: NoteList = [
    [0, [note("F", 4)], 3],
    [3, [note("A", 4)], 1],
    [4, [note("C", 5)], 4],
    [8, [note("A", 4)], 2],
    [10, [note("G", 4)], 6],
    [16, [note("F", 4)], 2],
    [18, [note("G", 4)], 2],
    [20, [note("B", 4)], 4],
    [24, [note("D", 5)], 8],
    [32, [note("E", 5)], 6],
    [38, [note("D", 5)], 2],
    [40, [note("C", 5)], 4],
    [44, [note("B", 4)], 4],
    [48, [note("C#", 5)], 4],
    [52, [note("E", 5)], 4],
    [56, [note("G", 5)], 6],
    [62, [note("F", 5)], 2],
  ];

  const intro = page(p, "Intro", 64, 1);
  comp(intro, piano);

  const a = page(p, "Groove", 64, 2);
  drums(a);
  walk(a, bass);
  comp(a, piano);

  const b = page(p, "Melody", 64, 2);
  drums(b);
  walk(b, bass);
  comp(b, piano);
  notes(b, vibes, melody, 0.7);

  const c = page(p, "Strings", 64, 2);
  drums(c);
  walk(c, bass);
  notes(
    c,
    keys,
    perBar(CAFE, (ch, at) => [
      [at, chord(ch, 3), 6],
      [at + 8, chord(ch, 3), 6],
    ]),
    0.5,
  );
  notes(
    c,
    strings,
    perBar(CAFE, (ch, at) => [[at, chord(ch, 4), 16]]),
    0.45,
  );
  notes(c, vibes, melody, 0.6);

  const outro = page(p, "Outro", 64, 1);
  comp(outro, piano);
  notes(
    outro,
    strings,
    [
      [0, chord("Dm7", 4), 32],
      [32, chord("Cmaj7", 4), 32],
    ],
    0.4,
  );
  return p;
}

/** The songs as written: in 4-bar phrases (64-step pages). */
export const SHOWCASE_PHRASES = { neonHorizon, lateNightCafe };

/** Pages of at most 32 steps are easier to see and edit: the same songs, split. */
const split = (make: () => Project) => () => {
  const p = make();
  splitLongPages(p);
  return p;
};

export const SHOWCASE = { neonHorizon: split(neonHorizon), lateNightCafe: split(lateNightCafe) };
