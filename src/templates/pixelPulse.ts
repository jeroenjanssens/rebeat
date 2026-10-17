/**
 * Pixel Pulse (D292): the demo song for what FT2 modules brought (D284–D289), written the Rebeat
 * way. Chiptune, 140 BPM, C minor (Cm A♭ E♭ B♭), about fifty seconds, from built-in sounds only.
 *
 * - **Arp** bends (D284): the chiptune synth holds one note a bar and an Arp makes it the chord,
 *   as a tracker's 037 and 047 would (a step every tick: 24 a quarter note); wider in the break
 * - bends on a **sample** (D285): the 808 kick, played as notes, is the bass, with Scoops into its
 *   phrases, Rises into the next section and a Fall at the very end
 * - **Shake**, **Scoop** and **Rise** on the square lead (D286): vibrato that builds on its long
 *   notes, glides between notes (a tone portamento), a slide up an octave out of the chorus
 * - **pan and level automation** (D288, D289): the arp fades in and swings left and right, faster
 *   in the break, and the song fades out
 */
import type { Project } from "../model/project";
import type { AutomationPoint, Lane, NoteBend, Pattern, Section, Track } from "../model/types";
import { drum, emptyProject, hitsTrack, note, notes, notesTrack, page, synth } from "./builder";

type NoteList = [number, number[], number, boolean?][];

/** Bend the note on step `i` of a lane (its only note). */
function bend(pattern: Pattern, track: Track, i: number, b: NoteBend) {
  const n = (pattern.lanes[track.id] as Lane).steps[i].notes?.[0];
  if (n) n.bend = b;
}

/** A tracker's arpeggio over `quarters`: the note, +x, +y, a step every tick (24 a quarter). */
const arp = (x: number, y: number, quarters: number): NoteBend => ({
  shape: "arp",
  amount: x,
  second: y,
  rate: 24,
  time: quarters,
  delay: 0,
  unit: "q",
});

const b = (shape: NoteBend["shape"], amount: number, time: number, extra: Partial<NoteBend> = {}) =>
  ({ shape, amount, time, delay: 0, unit: "s", ...extra }) satisfies NoteBend;

/** The progression: each bar's root (octave 4 for the arp) and its arpeggio (minor 037, major 047). */
const BARS: [string, number, number][] = [
  ["C", 3, 7],
  ["G#", 4, 7],
  ["D#", 4, 7],
  ["A#", 4, 7],
];

export function pixelPulse(): Project {
  const p = emptyProject("Pixel Pulse", 140);
  p.key = { root: 0, scale: "minor" };

  // ---------- tracks ----------
  const kick = hitsTrack("Kick", "kit:808:kick", "808 Kick", "kick");
  kick.volume = 0.76;
  const snare = hitsTrack("Snare", "kit:808:snare", "808 Snare", "snare");
  snare.volume = 0.82;
  snare.params["mix.sendA"] = 0.18;
  const hat = hitsTrack("Hat", "kit:909:chh", "909 Closed Hat", "hat");
  hat.volume = 0.6;
  // the 808's boom as a bass: a sample playing notes, rooted on its own G1 (D285)
  const bass = notesTrack(
    "808 Bass",
    { source: "sample", sampleId: "kit:808:kick", rootNote: 31, name: "808 Boom" },
    "808 Boom",
    "bass",
  );
  bass.volume = 0.74;
  const chip = notesTrack("Arp", synth("chiptune"), "Chiptune", "keys");
  chip.volume = 0.56;
  chip.params["mix.sendB"] = 0.12;
  const lead = notesTrack("Lead", synth("lead"), "Mono · Square Lead", "keys");
  lead.volume = 0.74;
  lead.params["mix.sendA"] = 0.2;
  p.tracks = [kick, snare, hat, bass, chip, lead];

  // ---------- parts ----------
  /** The arp: a note a bar, its chord as an Arp. */
  const arps = (pt: Pattern, wide = false, velocity = 0.7) => {
    notes(
      pt,
      chip,
      BARS.slice(0, pt.stepCount / 16).map(([root], i) => [i * 16, [note(root, 4)], 16]),
      velocity,
    );
    BARS.slice(0, pt.stepCount / 16).forEach(([, x, y], i) =>
      // the break goes wide: the fifth and the octave (07C)
      bend(pt, chip, i * 16, wide ? arp(7, 12, 4) : arp(x, y, 4)),
    );
  };
  /** The 808: a syncopated figure a bar, each bar scooping in from below. */
  const boom = (pt: Pattern) => {
    const list: NoteList = [];
    BARS.forEach(([root], i) => {
      const r = note(root, root === "C" || root === "D#" ? 2 : 1);
      list.push([i * 16, [r], 6], [i * 16 + 6, [r], 4], [i * 16 + 10, [r], 6]);
    });
    notes(pt, bass, list, 0.85);
    for (let i = 0; i < 4; i++)
      bend(pt, bass, i * 16, b("scoop", -5, 0.09, { ease: { type: "smooth" } }));
  };
  const beat = (pt: Pattern, bars = 4) => {
    drum(pt, kick, "x... ..x. x... .... ".repeat(bars));
    drum(pt, snare, ".... x... .... x... ".repeat(bars));
    drum(pt, hat, "x.x. x.x. x.x. xxx. ".repeat(bars));
  };

  // ---------- patterns ----------
  const intro = page(p, "Intro", 64, 1);
  arps(intro, false, 0.65);
  drum(intro, hat, "..x. ..x. ..x. ..x. ".repeat(4));

  const verse = page(p, "Verse", 64, 2);
  beat(verse);
  boom(verse);
  arps(verse);
  // the last boom rises a tone into the next section
  bend(verse, bass, 58, b("rise", 2, 1, { unit: "q", ease: { type: "exponential" } }));

  const chorus = page(p, "Chorus", 64, 2);
  beat(chorus);
  boom(chorus);
  arps(chorus, false, 0.55);
  notes(
    chorus,
    lead,
    [
      [0, [note("G", 5)], 6],
      [6, [note("D#", 5)], 2],
      [8, [note("F", 5)], 8],
      [16, [note("G#", 5)], 6],
      [22, [note("G", 5)], 2],
      [24, [note("D#", 5)], 8],
      [32, [note("G", 5)], 4],
      [36, [note("A#", 5)], 4],
      [40, [note("G", 5)], 8],
      [48, [note("F", 5)], 4],
      [52, [note("D#", 5)], 4],
      [56, [note("D", 5)], 8],
    ],
    0.78,
  );
  // vibrato that builds on the long notes (FT2's 4xy), glides in from the note before (3xx)
  const vib = b("shake", 0.35, 0.45, { delay: 0.18, rate: 6 });
  for (const i of [8, 24, 40]) bend(chorus, lead, i, vib);
  bend(chorus, lead, 6, b("scoop", 4, 0.07));
  bend(chorus, lead, 22, b("scoop", 1, 0.06));
  bend(chorus, lead, 36, b("scoop", -3, 0.08));
  bend(chorus, lead, 52, b("scoop", 2, 0.06));
  // out of the chorus: a slide up an octave (1xx) over two beats
  bend(
    chorus,
    lead,
    56,
    b("rise", 12, 2, { unit: "q", delay: 0.1, ease: { type: "exponential" } }),
  );

  const brk = page(p, "Break", 32, 1);
  arps(brk, true, 0.7);
  drum(brk, kick, "x... .... x... .... x... .... x.x. x.x.");
  notes(
    brk,
    bass,
    [
      [0, [note("C", 2)], 14],
      [16, [note("G#", 1)], 14],
    ],
    0.8,
  );
  bend(brk, bass, 0, b("scoop", -7, 0.2, { ease: { type: "smooth" } }));
  bend(brk, bass, 16, b("rise", 4, 2, { unit: "q", delay: 1, ease: { type: "smooth" } }));

  const outro = page(p, "Outro", 64, 1);
  beat(outro);
  boom(outro);
  arps(outro);
  // the very last boom falls away
  bend(outro, bass, 58, b("fall", -12, 0.6, { ease: { type: "exponential" } }));

  // ---------- the song ----------
  const section = (pt: Pattern, repeats: number): Section => ({
    id: `slot-${pt.id}-${p.slots.length}`,
    patternId: pt.id,
    repeats,
  });
  const add = (x: Section) => (p.slots.push(x), x);
  p.slots = [];
  const sIntro = add(section(intro, 1));
  add(section(verse, 2));
  const sChorus = add(section(chorus, 2));
  const sBreak = add(section(brk, 1));
  const sChorus2 = add(section(chorus, 1));
  const sOutro = add(section(outro, 1));

  // ---------- automation: pan and level (D288, D289) ----------
  const at = (
    x: Section,
    q: number,
    value: number,
    eases: Pick<AutomationPoint, "in" | "out"> = {},
  ): AutomationPoint => ({ slotId: x.id, at: q, value, ...eases });
  const smooth = { out: { type: "smooth" as const } };
  const hold = { out: { type: "none" as const } };
  // the arp swings left and right a bar at a time in the intro, a beat at a time in the break
  const swing = (x: Section, quarters: number, every: number) =>
    Array.from({ length: quarters / every + 1 }, (_, i) =>
      at(x, Math.min(quarters - 0.01, i * every), i % 2 ? 0.8 : 0.2, smooth),
    );
  p.automation = [
    {
      id: "auto-arp-pan",
      target: `track:${chip.id}:mix.pan`,
      on: true,
      points: [
        ...swing(sIntro, 16, 4),
        at(sIntro, 15.99, 0.5, hold),
        at(sChorus, 0, 0.5, hold),
        ...swing(sBreak, 8, 1),
        at(sChorus2, 0, 0.5, hold),
      ],
    },
    {
      // the arp comes in from almost nothing over the intro
      id: "auto-arp-level",
      target: `track:${chip.id}:volume`,
      on: true,
      points: [
        at(sIntro, 0, 0.15, { out: { type: "exponential", strength: 0.4 } }),
        at(sIntro, 15.99, chip.volume, hold),
      ],
    },
    {
      // and the song fades out over its last two bars
      id: "auto-master-fade",
      target: "master:volume",
      on: true,
      points: [at(sOutro, 8, 0.8, smooth), at(sOutro, 15.99, 0, hold)],
    },
  ];
  return p;
}
