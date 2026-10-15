/**
 * Wood, Wire and Glass (D259): the demo song for wavetables and physical models. Downtempo, 96
 * BPM, E minor, about a minute and a half, from factory sounds only (an 808 kick and hat, the
 * rest physical models and wavetable synths). Five patterns make six sections:
 *
 * - intro: a kalimba pattern over a bowed glass bowl whose pickup drifts (a smooth lane)
 * - verse: a nylon guitar arpeggio, a physical tom and conga as hits, the vowel pad's
 *   position following a slow lane
 * - build: the riser, the pad's position climbing with an ease, the growl bass's Bite (its
 *   warp) on a macro lane
 * - drop: the growl bass switches tables at the drop (a stepped lane on its slots, D248),
 *   tubular bells on the downbeats, marimba chords
 * - break: a bowed cello and a breathy flute alone, the flute's notes scooping in (bends)
 */
import { makeEffect } from "../model/effects";
import { paramOf, toKnob } from "../model/patchParams";
import type { Project } from "../model/project";
import type { AutomationPoint, Lane, NoteBend, Pattern, Section, Track } from "../model/types";
import { factorySynth } from "../library/synths";
import { clone, TABLE_SLOTS } from "../model/synth";
import {
  chord,
  drum,
  emptyProject,
  hitsTrack,
  note,
  notes,
  notesTrack,
  page,
  synth,
} from "./builder";

/** A knob's position (0..1) for a value of a synth knob. */
const knob = (path: string, value: number) => toKnob(paramOf(path)!, value);

/** Bend the note on step `i` of a lane (its only note). */
function bend(pattern: Pattern, track: Track, i: number, b: NoteBend) {
  const n = (pattern.lanes[track.id] as Lane).steps[i].notes?.[0];
  if (n) n.bend = b;
}

/** A track that plays a physical drum as hits (D93): one note per hit. */
function drumHits(name: string, preset: string, hitNote: number) {
  const t = notesTrack(name, synth(preset), factorySynth(preset)!.name, "perc");
  t.mode = "hits";
  t.hitNote = hitNote;
  return t;
}

export function woodWireAndGlass(): Project {
  const p = emptyProject("Wood, Wire and Glass", 96);
  p.key = { root: 4, scale: "minor" };

  // ---------- tracks ----------
  const kick = hitsTrack("Kick", "kit:808:kick", "808 Kick", "kick");
  kick.volume = 0.78;
  const hat = hitsTrack("Hat", "kit:808:chh", "808 Closed Hat", "hat");
  hat.volume = 0.55;
  const tom = drumHits("Tom", "pm-tom", 45);
  tom.volume = 0.62;
  const conga = drumHits("Conga", "pm-conga", 62);
  conga.volume = 0.55;
  conga.params["mix.pan"] = 0.65;
  const kalimba = notesTrack("Kalimba", synth("pm-kalimba"), "Physical · Kalimba", "keys");
  kalimba.volume = 0.8;
  kalimba.params["mix.sendB"] = 0.25;
  const bowl = notesTrack("Bowl", synth("pm-glass-bowl"), "Physical · Glass Bowl", "keys");
  bowl.volume = 0.66;
  bowl.params["mix.sendA"] = 0.4;
  const guitar = notesTrack("Guitar", synth("pm-nylon-guitar"), "Physical · Nylon Guitar", "keys");
  guitar.volume = 0.66;
  guitar.params["mix.sendA"] = 0.2;
  const pad = notesTrack("Pad", synth("wt-vowel-pad"), "Wavetable · Vowel Pad", "keys");
  pad.volume = 0.62;
  pad.params["mix.sendA"] = 0.35;
  const riser = notesTrack("Riser", synth("wt-riser"), "Wavetable · Riser", "fx");
  riser.volume = 0.6;
  // the growl bass, with a second table in its slots: the drop switches to it (D248)
  const growl = clone(factorySynth("wt-growl-bass")!.patch);
  growl.osc[0].tables = ["factory:sync"];
  const bass = notesTrack(
    "Bass",
    { source: "synth", preset: "wt-growl-bass", patch: growl, name: "Growl Bass (two tables)" },
    "Wavetable · Growl Bass",
    "bass",
  );
  bass.volume = 0.72;
  const marimba = notesTrack("Marimba", synth("pm-marimba"), "Physical · Marimba", "keys");
  marimba.volume = 0.55;
  const bell = notesTrack("Bell", synth("pm-tubular-bell"), "Physical · Tubular Bell", "keys", [
    makeEffect("EQ3", { low: 0.35 }),
  ]);
  bell.volume = 0.62;
  bell.params["mix.sendA"] = 0.4;
  const cello = notesTrack("Cello", synth("pm-bowed-cello"), "Physical · Bowed Cello", "keys");
  cello.volume = 0.78;
  cello.params["mix.sendA"] = 0.3;
  const flute = notesTrack("Flute", synth("pm-breathy-flute"), "Physical · Breathy Flute", "keys");
  flute.volume = 0.7;
  flute.params["mix.sendA"] = 0.3;
  p.tracks = [
    kick,
    hat,
    tom,
    conga,
    kalimba,
    bowl,
    guitar,
    pad,
    riser,
    bass,
    marimba,
    bell,
    cello,
    flute,
  ];

  // ---------- parts ----------
  const PROG = ["Em", "C", "G", "D"];
  const kalimbaLine = (pt: Pattern, from: number, names: string[]) =>
    notes(
      pt,
      kalimba,
      names.flatMap((c, i) => {
        const [r, t, f] = chord(c, 5);
        return [
          [from + i * 8, [r], 2],
          [from + i * 8 + 2, [f], 2],
          [from + i * 8 + 3, [t], 1],
          [from + i * 8 + 5, [r + 12], 2],
          [from + i * 8 + 6, [f], 2],
        ] as [number, number[], number][];
      }),
      0.7,
    );
  const arpeggio = (pt: Pattern, names: string[], len: number) =>
    notes(
      pt,
      guitar,
      names.flatMap((c, i) => {
        const [r, t, f] = chord(c, 3);
        return Array.from({ length: len / 2 }, (_, k) => [
          i * len + k * 2,
          [[r, f, t + 12, f][k % 4]],
          2,
        ]) as [number, number[], number][];
      }),
      0.7,
    );
  const padChords = (pt: Pattern, names: string[], len: number, velocity = 0.55) =>
    notes(
      pt,
      pad,
      names.map((c, i) => [i * len, chord(c, 3), len]),
      velocity,
    );

  // ---------- patterns ----------
  const intro = page(p, "Intro", 32, 2);
  kalimbaLine(intro, 0, PROG);
  notes(intro, bowl, [[0, [note("E", 4)], 32]], 0.6);

  const verse = page(p, "Verse", 32, 2);
  arpeggio(verse, PROG, 8);
  padChords(verse, PROG, 8, 0.45);
  drum(verse, tom, "x... .... ..x. .... x... .... ..x. ..x.");
  drum(verse, conga, "..x. x.x. ..x. x... ..x. x.x. ..x. xx..");
  drum(verse, hat, "..x. ..x. ..x. ..x. ..x. ..x. ..x. ..x.");

  const build = page(p, "Build", 32, 2);
  arpeggio(build, ["C", "D"], 16);
  padChords(build, ["C", "D"], 16, 0.55);
  notes(build, riser, [[0, [note("E", 3)], 32]], 0.7);
  drum(build, tom, "x... x... x... x... x.x. x.x. xxxx xxxx");
  drum(build, hat, "x.x. x.x. x.x. x.x. xxxx xxxx xxxx xxxx");
  notes(
    build,
    bass,
    Array.from({ length: 8 }, (_, k) => [k * 4, [k < 4 ? note("C", 2) : note("D", 2)], 3]),
    0.7,
  );

  const drop = page(p, "Drop", 32, 2);
  drum(drop, kick, "x... ..x. x... .... x... ..x. x... ..x.");
  drum(drop, hat, "..x. ..x. ..x. ..x. ..x. ..x. ..x. ..xx");
  drum(drop, conga, "..x. x.x. ..x. x... ..x. x.x. ..x. xx..");
  notes(
    drop,
    bass,
    PROG.flatMap((c, i) => {
      const r = chord(c, 1)[0] + 12;
      return [
        [i * 8, [r], 3],
        [i * 8 + 3, [r], 1],
        [i * 8 + 4, [r + 12], 2],
        [i * 8 + 6, [r], 2],
      ] as [number, number[], number][];
    }),
    0.8,
  );
  notes(
    drop,
    marimba,
    PROG.flatMap((c, i) => [
      [i * 8, chord(c, 4), 2],
      [i * 8 + 3, chord(c, 4), 1],
      [i * 8 + 6, chord(c, 4), 2],
    ]) as [number, number[], number][],
    0.6,
  );
  notes(drop, bell, [
    [0, [note("E", 5)], 8],
    [16, [note("B", 4)], 8],
  ]);
  kalimbaLine(drop, 0, PROG);

  const brk = page(p, "Break", 32, 1);
  notes(
    brk,
    cello,
    [
      [0, [note("E", 2)], 16],
      [16, [note("C", 2)], 8],
      [24, [note("D", 2)], 8],
    ],
    0.7,
  );
  notes(
    brk,
    flute,
    [
      [0, [note("B", 4)], 6],
      [8, [note("D", 5)], 6],
      [16, [note("E", 5)], 8],
      [24, [note("F#", 5)], 6],
    ],
    0.7,
  );
  const scoop = (amount: number, time: number): NoteBend => ({
    shape: "scoop",
    amount,
    time,
    delay: 0,
    unit: "s",
    ease: { type: "smooth" },
  });
  bend(brk, flute, 0, scoop(-2, 0.15));
  bend(brk, flute, 8, scoop(-1, 0.1));
  bend(brk, flute, 16, scoop(-3, 0.2));
  bend(brk, flute, 24, { shape: "fall", amount: -5, time: 0.4, delay: 0, unit: "s" });

  // ---------- the song ----------
  const section = (pt: Pattern, repeats: number): Section => ({
    id: `slot-${pt.id}-${p.slots.length}`,
    patternId: pt.id,
    repeats,
  });
  const add = (x: Section) => (p.slots.push(x), x);
  p.slots = [];
  const sIntro = add(section(intro, 1));
  const sVerse = add(section(verse, 2));
  const sBuild = add(section(build, 1));
  const sDrop = add(section(drop, 2));
  const sBreak = add(section(brk, 1));
  const sDrop2 = add(section(drop, 2));

  // ---------- automation (D228, D248) ----------
  const at = (
    x: Section,
    q: number,
    value: number,
    eases: Pick<AutomationPoint, "in" | "out"> = {},
  ): AutomationPoint => ({ slotId: x.id, at: q, value, ...eases });
  const t = (track: Track, path: string) => `track:${track.id}:synth:${path}`;
  const slot = (k: number) => k / (TABLE_SLOTS - 1);
  p.automation = [
    {
      // the bowl's pickup drifts from the rim toward the middle and back
      id: "auto-bowl-pickup",
      target: t(bowl, "physical.resonator.pickup"),
      on: true,
      points: [
        at(sIntro, 0, knob("physical.resonator.pickup", 0.15), { out: { type: "smooth" } }),
        at(sIntro, 7.75, knob("physical.resonator.pickup", 0.5), { out: { type: "smooth" } }),
        at(sVerse, 0, knob("physical.resonator.pickup", 0.2)),
      ],
    },
    {
      // the pad's vowels: slowly through the verse, climbing over the build, open in the drop
      id: "auto-pad-position",
      target: t(pad, "osc.0.position"),
      on: true,
      points: [
        at(sVerse, 0, knob("osc.0.position", 0.05), { out: { type: "smooth" } }),
        at(sVerse, 15.75, knob("osc.0.position", 0.35)),
        at(sBuild, 0, knob("osc.0.position", 0.3), {
          out: { type: "exponential", strength: 0.6 },
        }),
        at(sBuild, 7.75, knob("osc.0.position", 0.95)),
      ],
    },
    {
      // the bass's Bite (its sync warp) opens over the build
      id: "auto-bass-bite",
      target: `track:${bass.id}:sound.macro2`,
      on: true,
      points: [
        at(sBuild, 0, 0.2, { out: { type: "exponential", strength: 0.5 } }),
        at(sBuild, 7.75, 0.9),
        at(sDrop, 0, 0.5),
      ],
    },
    {
      // … and switches to its second table at the drop (FM growl → hard sync), back for the break,
      // and again halfway through the last drop (a stepped lane on its slots)
      id: "auto-bass-table",
      target: t(bass, "osc.0.slot"),
      on: true,
      points: [
        at(sBuild, 0, slot(0)),
        at(sDrop, 0, slot(1)),
        at(sBreak, 0, slot(0)),
        at(sDrop2, 8, slot(1)),
      ],
    },
  ];
  return p;
}
