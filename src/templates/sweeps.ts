/**
 * Sweeps and Bends (D239): the demo song for bends per note and the synth's automation. Synth
 * pop, 100 BPM, A minor, about fifty seconds, from built-in sounds only (the 909 kit and four
 * factory synths). Four patterns make five sections:
 *
 * - every note of the lead bends: Scoops into phrases, Falls at their ends, a Doit, a Dip, a
 *   Rise into the drop, a Next on a held note, a Shake on the last long note
 * - smooth synth lanes: the lead's Filter 1 cutoff opens over the build, the pad's LFO 1 rate
 *   speeds up into the drop, the bass's oscillator 2 detunes through the drop
 * - stepped lanes (D229): the pad's LFO 1 shape goes to Sample & hold for the break, the bass's
 *   voice mode goes legato in the drop, the lead's filter turns band-pass in the break, and the
 *   lead's delay is on in the break and the last bar
 */
import { makeEffect } from "../model/effects";
import { paramOf, toKnob } from "../model/patchParams";
import { switchOf } from "../model/patchSwitches";
import type { Project } from "../model/project";
import type { AutomationPoint, Lane, NoteBend, Pattern, Section, Track } from "../model/types";
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

type NoteList = [number, number[], number, boolean?][];

/** A knob's position (0..1) for a value of a synth knob. */
const knob = (path: string, value: number) => toKnob(paramOf(path)!, value);

/** A switch's position (0..1) for one of its options. */
function option(path: string, value: string | number | boolean | null) {
  const sw = switchOf(path)!;
  return sw.options.findIndex((o) => o.value === value) / (sw.options.length - 1);
}

/** Bend the note on step `i` of a lane (its only note). */
function bend(pattern: Pattern, track: Track, i: number, b: NoteBend) {
  const n = (pattern.lanes[track.id] as Lane).steps[i].notes?.[0];
  if (n) n.bend = b;
}

const s = (shape: NoteBend["shape"], amount: number, time: number, extra: Partial<NoteBend> = {}) =>
  ({ shape, amount, time, delay: 0, unit: "s", ...extra }) satisfies NoteBend;

export function sweepsAndBends(): Project {
  const p = emptyProject("Sweeps and Bends", 100);
  p.key = { root: 9, scale: "minor" };

  // ---------- tracks ----------
  const kick = hitsTrack("Kick", "kit:909:kick", "909 Kick", "kick", [
    makeEffect("Compressor", { threshold: 0.5, ratio: 0.25 }),
  ]);
  kick.volume = 0.82;
  const clap = hitsTrack("Clap", "kit:909:clap", "909 Clap", "clap");
  clap.volume = 0.7;
  clap.params["mix.sendA"] = 0.25;
  const hat = hitsTrack("Hat", "kit:909:chh", "909 Closed Hat", "hat");
  hat.volume = 0.46;
  const bass = notesTrack("Bass", synth("reese"), "Reese Bass", "bass");
  bass.volume = 0.8;
  const pad = notesTrack("Pad", synth("sweep-pad"), "Sweep Pad", "keys");
  pad.params["mix.sendA"] = 0.35;
  pad.volume = 0.6;
  // the lead's echo: on where its lane says (the break and the last bar)
  const echo = makeEffect("Delay", { time: 4 / 7, feedback: 0.4, mix: 0.3 });
  const lead = notesTrack("Lead", synth("lucky-man-lead"), "Lucky Man Lead", "keys", [echo]);
  lead.params["mix.sendA"] = 0.25;
  lead.volume = 0.66;
  p.tracks = [kick, clap, hat, bass, pad, lead];

  // ---------- parts ----------
  const PROG = ["Am", "F", "C", "G"];
  const chords = (pt: Pattern, names: string[], len: number, velocity = 0.55) =>
    notes(
      pt,
      pad,
      names.map((c, i) => [i * len, chord(c, 3), len]),
      velocity,
    );
  const roots = (pt: Pattern, names: string[], len: number) =>
    notes(
      pt,
      bass,
      names.flatMap((c, i) =>
        Array.from({ length: len / 2 }, (_, k) => [i * len + k * 2, [chord(c, 1)[0]], 2]),
      ) as NoteList,
      0.75,
    );

  // ---------- patterns ----------
  const intro = page(p, "Intro", 32, 2);
  chords(intro, ["Am", "F"], 16, 0.5);
  drum(intro, hat, "..x. ..x. ..x. ..x. ..x. ..x. ..x. ..xx");

  const build = page(p, "Build", 32, 2);
  chords(build, PROG, 8);
  drum(build, kick, "x... x... x... x... x... x... x... x.x.");
  drum(build, hat, "x.x. x.x. x.x. x.x. x.x. x.x. xxxx xxxx");
  notes(
    build,
    lead,
    [
      [0, [note("A", 4)], 6],
      [8, [note("C", 5)], 6],
      [16, [note("E", 5)], 6],
      [24, [note("E", 5)], 8],
    ],
    0.75,
  );
  bend(build, lead, 0, s("scoop", -3, 0.15, { ease: { type: "smooth" } }));
  bend(build, lead, 8, s("dip", -1, 0.25));
  bend(build, lead, 16, s("scoop", -2, 0.1));
  // up a fourth into the drop, over two beats
  bend(build, lead, 24, s("rise", 5, 2, { unit: "q", ease: { type: "exponential" } }));

  const drop = page(p, "Drop", 64, 2);
  drum(drop, kick, "x... x... x... x... ".repeat(4));
  drum(drop, clap, ".... x... .... x... ".repeat(4));
  drum(drop, hat, "..x. ..x. ..x. ..x. ".repeat(4));
  roots(drop, PROG, 16);
  chords(drop, PROG, 16, 0.5);
  notes(
    drop,
    lead,
    [
      [0, [note("E", 5)], 4],
      [4, [note("D", 5)], 2],
      [6, [note("C", 5)], 2],
      [8, [note("A", 4)], 6],
      [16, [note("E", 5)], 4],
      [20, [note("G", 5)], 2],
      [22, [note("E", 5)], 2],
      [24, [note("D", 5)], 6],
      [32, [note("C", 5)], 4],
      [36, [note("D", 5)], 2],
      [38, [note("E", 5)], 2],
      [40, [note("A", 5)], 8],
      [48, [note("G", 5)], 4],
      [52, [note("E", 5)], 4],
      [56, [note("A", 4)], 8],
    ],
    0.8,
  );
  bend(drop, lead, 0, s("scoop", -2, 0.12, { ease: { type: "smooth" } }));
  bend(drop, lead, 8, s("fall", -5, 0.3, { ease: { type: "exponential" } }));
  bend(drop, lead, 16, s("scoop", -2, 0.12, { ease: { type: "smooth" } }));
  bend(drop, lead, 24, s("doit", 3, 0.1, { ease: { type: "exponential" } }));
  bend(drop, lead, 32, s("scoop", -1, 0.08));
  // A to B, the next note of A minor, after a beat
  bend(drop, lead, 40, s("next", 2, 0.15, { delay: 0.6, ease: { type: "smooth" } }));
  bend(drop, lead, 52, s("dip", -1, 0.2));
  bend(drop, lead, 56, s("shake", 0.4, 0.9, { delay: 0.2, rate: 5.5 }));

  const brk = page(p, "Break", 32, 1);
  chords(brk, ["F", "G"], 16, 0.6);
  notes(
    brk,
    lead,
    [
      [0, [note("E", 5)], 14],
      [16, [note("D", 5)], 6],
      [24, [note("C", 5)], 6],
    ],
    0.75,
  );
  // a long note whose vibrato builds up, a bend up to the next note, a fall
  bend(brk, lead, 0, s("shake", 0.5, 1.6, { delay: 0.5, rate: 5 }));
  bend(brk, lead, 16, s("next", 2, 0.2, { delay: 0.3 }));
  bend(brk, lead, 24, s("fall", -7, 0.5, { ease: { type: "exponential" } }));

  // ---------- the song ----------
  const section = (pt: Pattern, repeats: number, settings: Partial<Section> = {}): Section => ({
    id: `slot-${pt.id}-${p.slots.length}`,
    patternId: pt.id,
    repeats,
    ...settings,
  });
  const add = (x: Section) => (p.slots.push(x), x);
  p.slots = [];
  const sIntro = add(section(intro, 2));
  const sBuild = add(section(build, 2));
  const sDrop = add(section(drop, 2));
  const sBreak = add(section(brk, 1));
  const sDrop2 = add(section(drop, 1));

  // ---------- automation: synth knobs and switches (D226, D231) ----------
  const at = (
    x: Section,
    q: number,
    value: number,
    eases: Pick<AutomationPoint, "in" | "out"> = {},
  ): AutomationPoint => ({ slotId: x.id, at: q, value, ...eases });
  const t = (track: Track, path: string) => `track:${track.id}:synth:${path}`;
  p.automation = [
    {
      // the lead opens over the build (slow at first), dims in the break, opens wide at the end
      id: "auto-lead-cutoff",
      target: t(lead, "filters.0.cutoff"),
      on: true,
      points: [
        at(sBuild, 0, knob("filters.0.cutoff", 500), {
          out: { type: "exponential", strength: 0.6 },
        }),
        at(sDrop, 0, knob("filters.0.cutoff", 2400)),
        at(sBreak, 0, knob("filters.0.cutoff", 1400)),
        at(sDrop2, 0, knob("filters.0.cutoff", 1800), { out: { type: "smooth" } }),
        at(sDrop2, 15.75, knob("filters.0.cutoff", 4500)),
      ],
    },
    {
      // the pad's filter wobbles faster and faster into the drop
      id: "auto-pad-lfo-rate",
      target: t(pad, "lfos.0.rate"),
      on: true,
      points: [
        at(sBuild, 0, knob("lfos.0.rate", 0.2), { out: { type: "exponential", strength: 0.7 } }),
        at(sBuild, 15.75, knob("lfos.0.rate", 6), { out: { type: "none" } }),
        at(sDrop, 0, knob("lfos.0.rate", 0.5)),
      ],
    },
    {
      // … and steps on Sample & hold in the break
      id: "auto-pad-lfo-shape",
      target: t(pad, "lfos.0.shape"),
      on: true,
      points: [
        at(sIntro, 0, option("lfos.0.shape", "sine")),
        at(sBreak, 0, option("lfos.0.shape", "sh")),
        at(sDrop2, 0, option("lfos.0.shape", "sine")),
      ],
    },
    {
      // the bass's second oscillator drifts sharp through the drop: a wider Reese
      id: "auto-bass-detune",
      target: t(bass, "osc.1.fine"),
      on: true,
      points: [
        at(sDrop, 0, knob("osc.1.fine", -9), { out: { type: "smooth" } }),
        at(sDrop, 31.75, knob("osc.1.fine", 35), { out: { type: "none" } }),
        at(sBreak, 0, knob("osc.1.fine", -9)),
      ],
    },
    {
      // legato in the drop: the eighths glide into each other without new attacks
      id: "auto-bass-mode",
      target: t(bass, "voice.mode"),
      on: true,
      points: [
        at(sIntro, 0, option("voice.mode", "mono")),
        at(sDrop, 0, option("voice.mode", "legato")),
      ],
    },
    {
      // the lead turns band-pass (thin, nasal) for the break
      id: "auto-lead-type",
      target: t(lead, "filters.0.type"),
      on: true,
      points: [
        at(sIntro, 0, option("filters.0.type", "lp")),
        at(sBreak, 0, option("filters.0.type", "bp")),
        at(sDrop2, 0, option("filters.0.type", "lp")),
      ],
    },
    {
      // its echo in the break and the last bar
      id: "auto-lead-echo",
      target: `track:${lead.id}:fx:${echo.id}:on`,
      on: true,
      points: [at(sIntro, 0, 0), at(sBreak, 0, 1), at(sDrop2, 0, 0), at(sDrop2, 12, 1)],
    },
  ];
  return p;
}
