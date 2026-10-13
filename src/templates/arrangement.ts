/**
 * Long Way Home (D194): the timeline's demo song. Nu-disco / synth-pop, 112 BPM, C minor, about
 * two minutes, from built-in sounds only (the 909 kit, factory synths and the two built-in
 * vocals). Four patterns make ten sections, and each section shows something the timeline does:
 *
 * - Intro → Verse 1: one automation lane (the pad's Brightness) over two sections
 * - Verse 1 / Verse 2: one pattern, Op Hat and Keys muted in Verse 1 only
 * - Pre: fill on the last repeat; the master's high-pass sweeps up and drops at the Chorus
 * - Pre → Chorus 1: the four-bar vocal starts in the Pre and runs into the Chorus
 * - Verse 2: the hook vocal, its last word thrown into the reverb (Vox Send A)
 * - Break: a clone of the chorus with the drums and bass muted, and a tempo jump to 100
 * - Stop: the chorus again, playing only its first 8 steps (a short bar)
 * - Pre 2: a tempo ramp back up to 112 under the high-pass sweep
 * - Final: a clone of the chorus transposed +2 (the key change), fill on the last repeat
 * - Outro: a ritardando down to 88 while the master fades out
 *
 * The vocals are at their own tempo and key (112, C minor): never in a tempo change or the key
 * change, so the song renders the same offline (exports repitch warped audio, §0.7).
 */
import { makeEffect } from "../model/effects";
import type { Project } from "../model/project";
import type { AutomationPoint, Lane, Pattern, Section, Track } from "../model/types";
import {
  chord,
  clipTrack,
  drum,
  emptyProject,
  hitsTrack,
  note,
  notes,
  notesTrack,
  page,
  synth,
} from "./builder";

type NoteList = [number, number[], number, boolean?][];

const VERSE = ["Cm", "Ab", "Eb", "Bb"];
const CHORUS = ["Ab", "Bb", "Gm", "Cm"];
const PRE = ["Fm", "G"];
const INTRO = ["Cm", "Ab"];

/** Steps that play only on a fill (`FILL`), from a step string as `drum`. */
function fill(pattern: Pattern, track: Track, code: string) {
  const lane = pattern.lanes[track.id] as Lane;
  [...code.replace(/\s/g, "")].forEach((ch, i) => {
    if (ch === ".") return;
    const s = lane.steps[i];
    s.on = true;
    s.velocity = ch === "X" ? 1 : ch === "o" ? 0.5 : 0.8;
    s.condition = "FILL";
  });
}

/** Steps that make way for a fill (`!FILL`). */
function notOnFill(pattern: Pattern, track: Track, from: number, to: number) {
  const lane = pattern.lanes[track.id] as Lane;
  for (let i = from; i < to; i++) if (lane.steps[i].on) lane.steps[i].condition = "!FILL";
}

const perBar = (progression: string[], fn: (name: string, at: number) => NoteList) =>
  progression.flatMap((c, bar) => fn(c, bar * 16));

export function longWayHome(): Project {
  const p = emptyProject("Long Way Home", 112);
  p.key = { root: 0, scale: "minor" };

  // ---------- tracks ----------
  const kick = hitsTrack("Kick", "kit:909:kick", "909 Kick", "kick", [
    makeEffect("Compressor", { threshold: 0.5, ratio: 0.25 }),
  ]);
  kick.volume = 0.84;
  const snare = hitsTrack("Snare", "kit:909:snare", "909 Snare", "snare");
  snare.volume = 0.72;
  snare.params["mix.sendA"] = 0.25;
  const clap = hitsTrack("Clap", "kit:909:clap", "909 Clap", "clap", [
    makeEffect("Reverb", { size: 0.3, decay: 0.2, mix: 0.3 }),
  ]);
  clap.volume = 0.78;
  const hat = hitsTrack("Cl Hat", "kit:909:chh", "909 Closed Hat", "hat");
  hat.volume = 0.48;
  const ohat = hitsTrack("Op Hat", "kit:909:ohh", "909 Open Hat", "hat");
  ohat.volume = 0.46;
  const crash = hitsTrack("Crash", "kit:909:crash", "909 Crash", "hat");
  crash.volume = 0.4;
  crash.params["mix.sendA"] = 0.3;
  const bass = notesTrack("Bass", synth("deep-house-bass"), "Deep House Bass", "bass");
  bass.volume = 0.88;
  const pad = notesTrack("Pad", synth("juno-strings"), "Juno Strings", "keys", [
    makeEffect("Chorus"),
  ]);
  pad.params["mix.sendA"] = 0.4;
  pad.volume = 0.56;
  // a dotted-eighth echo, synced: it follows the tempo changes (D192)
  const keys = notesTrack("Keys", synth("fm-epiano"), "FM E-Piano", "keys", [
    makeEffect("Delay", { time: 4 / 7, feedback: 0.35, mix: 0.25 }),
  ]);
  keys.volume = 0.56;
  const lead = notesTrack("Lead", synth("levels-pluck"), "Levels Pluck", "keys", [
    makeEffect("Delay", { time: 4 / 7, feedback: 0.3, mix: 0.2 }),
  ]);
  lead.params["mix.sendA"] = 0.3;
  lead.volume = 0.64;
  const riser = notesTrack("Riser", synth("noise-riser"), "Noise Riser", "fx");
  riser.volume = 0.36;
  // the vocals: timeline audio only (D188), so the sections' own clips are off
  const vox = clipTrack("Vox", "demo:vox-verse", "Vox verse 112", "vocal", [
    makeEffect("Compressor", { threshold: 0.5, ratio: 0.2 }),
  ]);
  vox.params["mix.sendA"] = 0.2;
  vox.volume = 0.56;
  p.tracks = [kick, snare, clap, hat, ohat, crash, bass, pad, keys, lead, riser, vox];

  // the master's high-pass, open (20 Hz) except where it's automated
  const hp = makeEffect("Filter", { type: 0.5, cutoff: 0, reso: 0.25, depth: 0 });
  p.master.effects.unshift(hp);

  // ---------- parts ----------
  const groove = (pt: Pattern, nBars: number, open = true) => {
    const b = (code: string) => code.repeat(nBars);
    drum(pt, kick, b("x... x... x... x..."));
    drum(pt, clap, b(".... x... .... x..."));
    drum(pt, hat, b("xoxo xoxo xoxo xoxo"));
    if (open) drum(pt, ohat, b("..x. ..x. ..x. ..x."));
  };
  // octave bass in eighths, the disco motor
  const octaves = (pt: Pattern, progression: string[]) =>
    notes(
      pt,
      bass,
      perBar(progression, (c, at) => {
        const root = chord(c, 1)[0];
        return Array.from({ length: 8 }, (_, i) => [
          at + i * 2,
          [root + (i % 2) * 12],
          1,
        ]) as NoteList;
      }),
      0.75,
    );
  const strings = (pt: Pattern, progression: string[], velocity = 0.55) =>
    notes(
      pt,
      pad,
      perBar(progression, (c, at) => [[at, chord(c, 3), 16]]),
      velocity,
    );
  // off-beat chord stabs
  const stabs = (pt: Pattern, progression: string[]) =>
    notes(
      pt,
      keys,
      perBar(
        progression,
        (c, at) => [2, 6, 10, 14].map((s) => [at + s, chord(c, 4), 1]) as NoteList,
      ),
      0.6,
    );

  // ---------- patterns ----------
  const intro = page(p, "Intro", 32, 2);
  strings(intro, INTRO, 0.5);
  drum(intro, hat, "..x. ..x. ..x. ..x. ..x. ..x. ..x. ..xo");
  drum(intro, kick, "x... .... .... .... x... .... .... ....");

  const verse = page(p, "Verse", 64, 2);
  groove(verse, 4);
  octaves(verse, VERSE);
  strings(verse, VERSE, 0.5);
  stabs(verse, VERSE);

  const pre = page(p, "Pre", 32, 2);
  groove(pre, 2, false);
  octaves(pre, PRE);
  strings(pre, PRE, 0.6);
  stabs(pre, PRE);
  // the snare rolls in on the fill (the last repeat): eighths, then sixteenths
  notOnFill(pre, clap, 16, 32);
  fill(pre, snare, ".... .... .... .... x.x. x.x. xxxx xxXX");
  // the riser builds over the second time round (2:2)
  notes(pre, riser, [[0, [note("C", 4)], 32]], 0.6);
  (pre.lanes[riser.id] as Lane).steps[0].condition = "2:2";

  const chorus = page(p, "Chorus", 64, 2);
  groove(chorus, 4);
  drum(chorus, crash, "X..." + ".... ".repeat(15));
  octaves(chorus, CHORUS);
  strings(chorus, CHORUS);
  stabs(chorus, CHORUS);
  // the hook: an answer to the vocal, up to E♭ and home to C
  notes(
    chorus,
    lead,
    [
      [0, [note("C", 5)], 2],
      [2, [note("Eb", 5)], 2],
      [4, [note("F", 5)], 4],
      [10, [note("Eb", 5)], 2],
      [12, [note("D", 5)], 4],
      [16, [note("D", 5)], 2],
      [18, [note("F", 5)], 2],
      [20, [note("G", 5)], 4],
      [26, [note("F", 5)], 2],
      [28, [note("Eb", 5)], 4],
      [32, [note("D", 5)], 2],
      [34, [note("Eb", 5)], 2],
      [36, [note("Bb", 4)], 6],
      [44, [note("C", 5)], 2],
      [46, [note("D", 5)], 2],
      [48, [note("Eb", 5)], 4],
      [52, [note("D", 5)], 2],
      [54, [note("C", 5)], 8],
    ],
    0.8,
  );
  // its fill: a snare roll into what follows
  notOnFill(chorus, clap, 48, 64);
  fill(chorus, snare, ".... .... .... .... ".repeat(3) + "x.x. x.x. xxxx xXXX");

  // ---------- the song: ten sections of four patterns ----------
  const section = (pt: Pattern, repeats: number, settings: Partial<Section> = {}): Section => ({
    id: `slot-${pt.id}-${p.slots.length}`,
    patternId: pt.id,
    repeats,
    ...settings,
  });
  const add = (s: Section) => (p.slots.push(s), s);
  p.slots = [];
  const sIntro = add(section(intro, 2));
  const sVerse1 = add(section(verse, 2, { mutes: [ohat.id, keys.id] }));
  const sPre = add(section(pre, 2, { fill: "last" }));
  const sChorus = add(section(chorus, 2));
  const sVerse2 = add(section(verse, 2));
  const sBreak = add(
    section(chorus, 1, { mutes: [kick.id, snare.id, clap.id, hat.id, ohat.id, crash.id, bass.id] }),
  );
  add(section(chorus, 1, { steps: 8 }));
  const sPre2 = add(section(pre, 2, { fill: "last" }));
  const sFinal = add(section(chorus, 2, { transpose: 2, fill: "last" }));
  const sOutro = add(section(intro, 2, { transpose: 2 }));

  // ---------- tempo changes (D192) ----------
  p.tempo = [
    // the break floats at 100…
    { slotId: sBreak.id, at: 0, bpm: 100 },
    // …and Pre 2 ramps back up to 112 for the final chorus
    { slotId: sPre2.id, at: 0, bpm: 100 },
    { slotId: sFinal.id, at: 0, bpm: 112, ramp: true },
    // a ritardando to the end
    { slotId: sOutro.id, at: 0, bpm: 112 },
    { slotId: sOutro.id, at: 15.99, bpm: 88, ramp: true },
  ];

  // ---------- automation (D186) ----------
  const at = (s: Section, q: number, value: number, hold = false): AutomationPoint => ({
    slotId: s.id,
    at: q,
    value,
    ...(hold ? { hold } : {}),
  });
  // a high-pass sweep up the build, and the drop at once (a held point)
  const sweep = (s: Section, next: Section) => [
    at(s, 0, 0),
    at(s, 15.75, 0.55, true),
    at(next, 0, 0),
  ];
  p.automation = [
    {
      id: "auto-brightness",
      target: `track:${pad.id}:sound.macro1`,
      on: true,
      points: [
        at(sIntro, 0, 0.08),
        at(sVerse1, 16, 0.62),
        at(sOutro, 0, 0.62),
        at(sOutro, 15.75, 0.12),
      ],
    },
    {
      id: "auto-highpass",
      target: `master:fx:${hp.id}:cutoff`,
      on: true,
      points: [...sweep(sPre, sChorus), ...sweep(sPre2, sFinal)],
    },
    {
      id: "auto-throw",
      // the hook's last word into the reverb, and back
      target: `track:${vox.id}:mix.sendA`,
      on: true,
      points: [
        at(sVerse2, 31, 0.2),
        at(sVerse2, 31.25, 0.9),
        at(sVerse2, 31.75, 0.9),
        at(sBreak, 1, 0.2),
      ],
    },
    {
      id: "auto-fade",
      target: "master:volume",
      on: true,
      points: [at(sOutro, 0, 0.8), at(sOutro, 15.9, 0)],
    },
  ];

  // ---------- the vocals on the timeline (D188) ----------
  // the clip lanes stay off: the vocals are timeline audio only
  for (const pt of Object.values(p.patterns))
    (pt.lanes[vox.id] as Lane).clip = { active: false, launchMode: "loop" };
  p.regions = [
    // the four-bar verse starts in the Pre's last two bars and runs into the Chorus
    {
      id: "rgn-verse",
      trackId: vox.id,
      sampleId: "demo:vox-verse",
      start: { slotId: sPre.id, at: 8 },
      length: 16,
      offset: 0,
      fadeOut: 0.5,
    },
    // the hook in Verse 2's last two bars
    {
      id: "rgn-hook",
      trackId: vox.id,
      sampleId: "demo:vox-hook",
      start: { slotId: sVerse2.id, at: 24 },
      length: 8,
      offset: 0,
    },
  ];
  return p;
}
