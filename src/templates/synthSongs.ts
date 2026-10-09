/**
 * Two example songs that show off the complete synth (§0.6e I): every melodic sound is a synth,
 * so they render offline without the network. Original compositions.
 *
 * - Hyperdrive: a hard-sync lead swept by the mod envelope, a PWM string pad, ring-mod bells, a
 *   wide stereo-unison supersaw, pitch-envelope zaps and synth toms, and Brightness macro locks
 *   that open the supersaw over the build.
 * - Laser Highway: synthwave that kicks. A driven 909 kick, a gated-style big snare, Moroder
 *   octave bass, a dotted-delay arp, Juno strings and Vangelis brass, all pumping on the beat
 *   (Pump, D104), an Axel lead hook doubled by a supersaw, risers, zaps and synth tom fills.
 * - Liquid Ladder: a self-oscillating ladder bassline with accents and slides, a sample & hold
 *   LFO on its second filter, velocity in the mod matrix, Bite and Movement macro locks per step,
 *   a drifting pad on looping envelopes, and drums made of synths with pitch envelopes.
 */
import { makeEffect } from "../model/effects";
import { makeTrack, type Project } from "../model/project";
import { makePatch, type PatchSpec } from "../model/synth";
import type { Effect, Pattern, SoundCategory, Lane, Track } from "../model/types";
import {
  chord,
  drum,
  emptyProject,
  hitsTrack,
  note,
  notes,
  notesTrack,
  page,
  splitLongPages,
  synth,
} from "./builder";

type NoteList = [number, number[], number, boolean?][];

/** A track playing a synth patch of its own (built from a spec on the init patch). */
function patchTrack(
  name: string,
  label: string,
  category: SoundCategory,
  spec: PatchSpec,
  effects: Effect[] = [],
): Track {
  const sound = { source: "synth", preset: "init", patch: makePatch(spec), name: label } as const;
  return makeTrack("notes", category, name, label, effects, sound);
}

/**
 * A synth playing hits (D93), from a step string (as `drum`): `x` on, `X` accent, `o` soft, at
 * `pitch` (the track's hit note, the first time; later pitches are the steps' own) for `gate`.
 */
function hits(pattern: Pattern, track: Track, code: string, pitch: number, gate = 1) {
  track.mode = "hits";
  track.hitNote ??= pitch;
  const lane = pattern.lanes[track.id] as Lane;
  [...code.replace(/\s/g, "")].forEach((ch, i) => {
    if (ch === ".") return;
    const s = lane.steps[i];
    s.on = true;
    s.velocity = ch === "X" ? 1 : ch === "o" ? 0.45 : 0.8;
    if (ch === "X") s.accent = true;
    s.pitch = pitch - track.hitNote!;
    s.gate = gate;
  });
}

/** Parameter locks on a track's steps: step → { "sound.macro1": 0.8 }. */
function lock(pattern: Pattern, track: Track, steps: [number, Record<string, number>][]) {
  const lane = pattern.lanes[track.id] as Lane;
  for (const [i, locks] of steps) lane.steps[i].locks = { ...lane.steps[i].locks, ...locks };
}

const perBar = (progression: string[], fn: (name: string, at: number) => NoteList) =>
  progression.flatMap((c, bar) => fn(c, bar * 16));

const bars = (code: string, n: number) => code.repeat(n);

const split = (make: () => Project) => () => {
  const p = make();
  splitLongPages(p);
  return p;
};

// ---------- Hyperdrive: electro / synthwave-techno, 124 BPM, E minor ----------

const DRIVE = ["Em", "C", "G", "D"];

function hyperdrive(): Project {
  const p = emptyProject("Hyperdrive", 124);
  p.key = { root: 4, scale: "minor" };
  const kick = hitsTrack("Kick", "kit:909:kick", "909 Kick", "kick", [makeEffect("Compressor")]);
  const clap = hitsTrack("Clap", "kit:909:clap", "909 Clap", "snare");
  clap.params["mix.sendA"] = 0.35;
  const hat = hitsTrack("Cl Hat", "kit:909:chh", "909 Closed Hat", "hat");
  hat.volume = 0.5;
  const ohat = hitsTrack("Op Hat", "kit:909:ohh", "909 Open Hat", "hat");
  ohat.volume = 0.45;
  const bass = notesTrack("Bass", synth("moroder-bass"), "Moroder Bass", "bass");
  bass.volume = 0.75;
  // hard sync, swept by the mod envelope on every note (the factory Numan lead)
  const lead = notesTrack("Sync Lead", synth("numan-lead"), "Numan Lead", "keys", [
    makeEffect("Delay"),
  ]);
  lead.params["mix.sendA"] = 0.25;
  lead.volume = 0.7;
  // pulse width modulation (the factory Juno strings)
  const pad = notesTrack("Strings", synth("juno-strings"), "Juno Strings", "keys", [
    makeEffect("Chorus"),
  ]);
  pad.params["mix.sendA"] = 0.4;
  pad.volume = 0.55;
  const bells = patchTrack(
    "Bells",
    "Ring Bells",
    "keys",
    {
      // two sines a little more than a fourth apart, multiplied: metallic partials
      osc: [
        { shape: 0, level: 0.25, retrigger: true },
        { shape: 0, level: 0, octave: 1, semi: 5, fine: 31, retrigger: true },
      ],
      ring: 0.9,
      filters: [{ cutoff: 9000, keytrack: 0 }],
      envs: [{ attack: 0.001, decay: 1.4, sustain: 0, release: 1.2, curve: 0.6, velocity: 0.5 }],
      output: { volume: -10, spread: 0.6 },
    },
    [makeEffect("Delay")],
  );
  bells.params["mix.sendA"] = 0.5;
  bells.volume = 0.6;
  // a wide stereo-unison supersaw (the factory one: 7 voices, 90% wide)
  const saw = notesTrack("Supersaw", synth("supersaw"), "Supersaw", "keys");
  saw.params["mix.sendA"] = 0.3;
  saw.volume = 0.6;
  // pitch-envelope zaps (the factory laser)
  const zap = notesTrack("Zap", synth("laser"), "Laser Zap", "fx");
  zap.volume = 0.45;
  const toms = patchTrack("Toms", "Synth Toms", "tom", {
    osc: [{ shape: 0, retrigger: true, phase: 0.25, drift: 0 }],
    noise: { level: 0.08 },
    filters: [{ cutoff: 3000, keytrack: 0 }],
    envs: [
      { attack: 0.001, decay: 0.32, sustain: 0, release: 0.2, curve: 0.7, velocity: 0.6 },
      {},
      // the pitch falls a fifth as the tom rings
      { attack: 0.001, decay: 0.18, sustain: 0, release: 0.1, curve: 0.5 },
    ],
    matrix: [{ source: "env3", dest: "pitch", amount: 7 / 24 }],
    output: { volume: -6 },
  });
  p.tracks = [kick, clap, hat, ohat, bass, lead, pad, bells, saw, zap, toms];

  const sequence = (pt: Pattern) =>
    notes(
      pt,
      bass,
      perBar(DRIVE, (c, at) => {
        const root = chord(c, 1)[0];
        return [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 12].map((o, i) => [
          at + i,
          [root + o],
          1,
        ]) as NoteList;
      }),
      0.7,
    );
  const strings = (pt: Pattern) =>
    notes(
      pt,
      pad,
      perBar(DRIVE, (c, at) => [[at, chord(c, 3), 16]]),
      0.55,
    );
  const ring = (pt: Pattern) =>
    notes(
      pt,
      bells,
      perBar(DRIVE, (c, at) => {
        const [a, b, d] = chord(c, 5);
        return [
          [at + 2, [a], 2],
          [at + 6, [d], 2],
          [at + 10, [b], 2],
          [at + 14, [a + 12], 2],
        ] as NoteList;
      }),
      0.6,
    );
  const melody: NoteList = [
    [0, [note("B", 4)], 4],
    [4, [note("G", 4)], 2],
    [6, [note("A", 4)], 2],
    [8, [note("B", 4)], 6],
    [14, [note("D", 5)], 2],
    [16, [note("E", 5)], 4],
    [20, [note("D", 5)], 2],
    [22, [note("C", 5)], 2],
    [24, [note("B", 4)], 4],
    [28, [note("G", 4)], 4],
    [32, [note("D", 5)], 4],
    [36, [note("B", 4)], 2],
    [38, [note("D", 5)], 2],
    [40, [note("G", 5)], 6],
    [46, [note("F#", 5)], 2],
    [48, [note("E", 5)], 4],
    [52, [note("D", 5)], 4],
    [56, [note("A", 4)], 8],
  ];
  const stabs = (pt: Pattern) =>
    notes(
      pt,
      saw,
      perBar(DRIVE, (c, at) => [0, 3, 6, 10, 12].map((i) => [at + i, chord(c, 4), 2]) as NoteList),
      0.7,
    );
  const fill = (pt: Pattern) =>
    notes(
      pt,
      toms,
      [
        [56, [note("A", 3)], 2],
        [58, [note("F#", 3)], 2],
        [60, [note("D", 3)], 1],
        [61, [note("D", 3)], 1],
        [62, [note("A", 2)], 2],
      ],
      0.85,
    );

  const intro = page(p, "Intro", 64, 1);
  drum(intro, kick, bars("x... x... x... x...", 4));
  drum(intro, hat, bars("..x. ..x. ..x. ..x.", 4));
  strings(intro);
  ring(intro);

  const verse = page(p, "Verse", 64, 2);
  drum(verse, kick, bars("x... x... x... x...", 4));
  drum(verse, clap, bars(".... x... .... x...", 4));
  drum(verse, hat, bars("xxox xxox xxox xxox", 4));
  sequence(verse);
  strings(verse);
  notes(verse, lead, melody, 0.75);

  const build = page(p, "Build", 64, 1);
  drum(build, kick, bars("x... x... x... x...", 4));
  drum(
    build,
    clap,
    ".... x... .... x... .... x... .... x... x... x... x... x... x.x. x.x. xxxx rrrr",
  );
  drum(build, hat, bars("x.x. x.x. x.x. x.x.", 4));
  sequence(build);
  strings(build);
  // the supersaw on every eighth, its Brightness macro opening from dark to bright
  notes(
    build,
    saw,
    perBar(
      DRIVE,
      (c, at) => Array.from({ length: 8 }, (_, i) => [at + i * 2, chord(c, 4), 1]) as NoteList,
    ),
    0.65,
  );
  lock(
    build,
    saw,
    Array.from({ length: 32 }, (_, i) => [i * 2, { "sound.macro1": 0.05 + (0.9 * i) / 31 }]),
  );
  fill(build);
  hits(
    build,
    zap,
    ".... .... .... .... .... .... .... .... .... .... .... .... .... .... .... ...X",
    note("C", 6),
  );

  const chorus = page(p, "Chorus", 64, 2);
  drum(chorus, kick, bars("x... x... x... x...", 4));
  drum(chorus, clap, bars(".... x... .... x...", 4));
  drum(chorus, hat, bars("xxox xxox xxox xxox", 4));
  drum(chorus, ohat, bars("..x. ..x. ..x. ..x.", 4));
  sequence(chorus);
  strings(chorus);
  stabs(chorus);
  ring(chorus);
  notes(chorus, lead, melody, 0.8);
  hits(chorus, zap, bars("X... .... .... ....", 4), note("C", 6));
  fill(chorus);

  const outro = page(p, "Outro", 64, 1);
  drum(outro, kick, "x... x... x... x... x... x... x... x...");
  strings(outro);
  ring(outro);
  return p;
}

// ---------- Liquid Ladder: acid / IDM, 132 BPM, A minor ----------

function liquidLadder(): Project {
  const p = emptyProject("Liquid Ladder", 132);
  p.key = { root: 9, scale: "minor" };
  // drums made of synths: pitch envelopes do the work
  const kick = patchTrack(
    "Kick",
    "Synth Kick",
    "kick",
    {
      osc: [{ shape: 0, retrigger: true, phase: 0.25, drift: 0 }],
      filters: [{ cutoff: 4000, keytrack: 0 }],
      envs: [
        { attack: 0.001, decay: 0.38, sustain: 0, release: 0.08, curve: 0.5, velocity: 0.3 },
        {},
        // two octaves down in 50 ms: the 808-style thump
        { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05, curve: 0.8 },
      ],
      matrix: [{ source: "env3", dest: "pitch", amount: 1 }],
      voice: { mode: "mono" },
      output: { drive: 0.3, volume: -10, spread: 0 },
    },
    [makeEffect("Compressor")],
  );
  const snare = patchTrack("Snare", "Synth Snare", "snare", {
    osc: [{ shape: 1, level: 0.5, retrigger: true, drift: 0 }],
    noise: { level: 0.8 },
    filters: [{ type: "bp", cutoff: 1800, reso: 0.2, keytrack: 0 }],
    envs: [
      { attack: 0.001, decay: 0.16, sustain: 0, release: 0.12, curve: 0.7 },
      {},
      { attack: 0.001, decay: 0.03, sustain: 0, release: 0.03 },
    ],
    matrix: [{ source: "env3", dest: "pitch", amount: 0.5 }],
    output: { volume: -11, spread: 0 },
  });
  snare.params["mix.sendA"] = 0.3;
  const hat = patchTrack("Hats", "Synth Hat", "hat", {
    osc: [{ on: false, level: 0 }],
    noise: { level: 1 },
    filters: [{ type: "hp", cutoff: 7500, reso: 0.2, keytrack: 0 }],
    envs: [{ attack: 0.001, decay: 0.045, sustain: 0, release: 0.04, curve: 0.8, velocity: 0.7 }],
    output: { volume: -15, spread: 0 },
  });
  hat.volume = 0.6;
  const perc = patchTrack(
    "Perc",
    "Blip Perc",
    "perc",
    {
      osc: [{ shape: 0, retrigger: true, drift: 0 }],
      filters: [{ cutoff: 9000, keytrack: 0 }],
      envs: [
        { attack: 0.001, decay: 0.09, sustain: 0, release: 0.06, curve: 0.6 },
        {},
        { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
      ],
      matrix: [{ source: "env3", dest: "pitch", amount: 0.75 }],
      output: { volume: -10, spread: 0.5 },
    },
    [makeEffect("Delay")],
  );
  perc.params["mix.sendA"] = 0.3;
  perc.volume = 0.55;
  // the ladder near self-oscillation, accents and slides; velocity opens it further,
  // and a sample & hold LFO jumps the cutoff of a second filter after it
  const acid = patchTrack(
    "Acid",
    "Liquid 303",
    "bass",
    {
      osc: [{ shape: 2, drift: 0.05 }],
      filters: [
        { model: "ladder", cutoff: 260, reso: 0.93, keytrack: 0.3, env: 4, drive: 0.3 },
        { model: "svf", type: "lp", cutoff: 2600, reso: 0.35, keytrack: 0 },
      ],
      envs: [
        { attack: 0.002, decay: 0.3, sustain: 0.7, release: 0.06, velocity: 0.3 },
        { attack: 0.002, decay: 0.2, sustain: 0.05, release: 0.1 },
      ],
      lfos: [
        undefined,
        { shape: "triangle", rate: 0.25, mode: "global" },
        { shape: "sh", sync: "1/16", mode: "global" },
      ],
      matrix: [
        { source: "velocity", dest: "filter1.cutoff", amount: 0.25 },
        { source: "lfo3", dest: "filter2.cutoff", amount: 0.25 },
      ],
      voice: { mode: "mono" },
      output: { drive: 0.2, volume: -16, spread: 0 },
    },
    [makeEffect("Delay")],
  );
  acid.params["mix.sendB"] = 0.2;
  acid.volume = 0.75;
  // a drifting analog pad; looping envelopes move its filter in slow waves
  const pad = patchTrack(
    "Pad",
    "Drift Pad",
    "keys",
    {
      osc: [
        { shape: 2, unison: 3, detune: 14, width: 0.8, drift: 0.45 },
        { shape: 3, pw: 0.35, level: 0.5, octave: -1, drift: 0.45 },
      ],
      filters: [{ model: "ladder", cutoff: 700, reso: 0.35, keytrack: 0.3, env: 1.5 }],
      envs: [
        { attack: 1.2, decay: 1, sustain: 0.9, release: 2.5 },
        { attack: 1.4, decay: 1.8, sustain: 0.2, release: 2, loop: true },
        { attack: 0.6, decay: 0.9, sustain: 0.3, release: 1, loop: true },
      ],
      matrix: [{ source: "env3", dest: "osc2.pw", amount: 0.6 }],
      output: { volume: -19, spread: 0.5 },
    },
    [makeEffect("Chorus")],
  );
  pad.params["mix.sendA"] = 0.5;
  pad.volume = 0.6;
  p.tracks = [kick, snare, hat, perc, acid, pad];

  // one bar of acid: [step, note, accent, slide]
  const LINE: [number, string, number, boolean?, boolean?][] = [
    [0, "A", 2, true],
    [1, "A", 2],
    [2, "A", 3, false, true],
    [4, "C", 3],
    [5, "A", 2],
    [6, "G", 2, false, true],
    [7, "A", 2, true],
    [9, "E", 3],
    [10, "A", 2],
    [11, "A", 3, true, true],
    [12, "G", 3, false, true],
    [13, "E", 3],
    [14, "C", 3, true],
    [15, "A", 2],
  ];
  const acidBar = (pt: Pattern, at: number, transpose = 0) => {
    const lane = pt.lanes[acid.id] as Lane;
    for (const [i, name, octave, accent, slide] of LINE) {
      const s = lane.steps[at + i];
      const velocity = accent ? 1 : 0.55;
      s.on = true;
      s.velocity = velocity;
      if (accent) s.accent = true;
      s.notes = [
        {
          pitch: note(name, octave) + transpose,
          length: 1,
          velocity,
          ...(slide ? { slide: true } : {}),
        },
      ];
    }
  };
  const acidPage = (pt: Pattern) => [0, 0, 5, 3].forEach((t, bar) => acidBar(pt, bar * 16, t));
  const drums = (pt: Pattern, full = true) => {
    hits(pt, kick, bars("x... x... x... x...", 4), note("A", 1));
    if (full) hits(pt, snare, bars(".... x... .... x..o", 4), note("D", 3));
    hits(pt, hat, bars("oxXx oxXx oxXx oxXo", 4), note("C", 5));
  };
  const blips = (pt: Pattern) => {
    const lane = pt.lanes[perc.id] as Lane;
    const tune = [note("E", 5), note("A", 5), note("C", 6), note("G", 5)];
    [3, 6, 9, 14].forEach((i, k) => {
      for (let bar = 0; bar < 4; bar++) {
        const s = lane.steps[bar * 16 + i];
        s.on = true;
        s.velocity = 0.7;
        s.notes = [{ pitch: tune[(k + bar) % 4], length: 1, velocity: 0.7 }];
      }
    });
  };
  const pads = (pt: Pattern) =>
    notes(
      pt,
      pad,
      [
        [0, chord("Am7", 3), 32],
        [32, chord("Fmaj7", 3), 32],
      ],
      0.5,
    );

  const intro = page(p, "Intro", 64, 1);
  drums(intro, false);
  pads(intro);

  const groove = page(p, "Acid", 64, 2);
  drums(groove);
  acidPage(groove);
  pads(groove);
  // Bite on the accents of the last two bars
  lock(groove, acid, [
    [39, { "sound.macro2": 0.85 }],
    [43, { "sound.macro2": 0.95 }],
    [55, { "sound.macro2": 0.85 }],
    [59, { "sound.macro2": 1 }],
  ]);

  const brk = page(p, "Break", 64, 1);
  hits(brk, hat, bars("..x. ..x. ..x. ..x.", 4), note("C", 5));
  blips(brk);
  acidPage(brk);
  pads(brk);
  // Movement (LFO 2 on the ladder) rising bar by bar
  lock(
    brk,
    acid,
    Array.from(
      { length: 64 },
      (_, i) =>
        [i, { "sound.macro7": Math.min(1, 0.15 + i / 64) }] as [number, Record<string, number>],
    ).filter(([i]) => (brk.lanes[acid.id] as Lane).steps[i].on),
  );

  const peak = page(p, "Peak", 64, 2);
  drums(peak);
  blips(peak);
  acidPage(peak);
  pads(peak);
  // Bite and Movement per step: the line squelches differently on every beat
  lock(
    peak,
    acid,
    [0, 4, 7, 11, 14, 16, 20, 23, 27, 30, 32, 36, 39, 43, 46, 48, 52, 55, 59, 62].map(
      (i, k) =>
        [
          i,
          { "sound.macro2": [0.3, 0.6, 1, 0.8][k % 4], "sound.macro7": [0, 0.4, 0.8, 0.2][k % 4] },
        ] as [number, Record<string, number>],
    ),
  );

  const outro = page(p, "Outro", 64, 1);
  hits(outro, kick, "x... x... x... x... x... x... x... x...", note("A", 1));
  pads(outro);
  return p;
}

// ---------- Laser Highway: synthwave / outrun, 118 BPM, A minor ----------

const HIGHWAY = ["Am", "F", "C", "G"];
const HIGHWAY_CHORUS = ["F", "G", "Em", "Am"];

/** The pump of the genre (D104): ducking on every beat, as if keyed by the kick. */
const pump = (depth: number) => makeEffect("Pump", { rate: 0.5, depth, release: 0.55 });

function laserHighway(): Project {
  const p = emptyProject("Laser Highway", 118);
  p.key = { root: 9, scale: "minor" };
  // a kick that kicks: compressed, driven, with its low end lifted
  const kick = hitsTrack("Kick", "kit:909:kick", "909 Kick", "kick", [
    makeEffect("EQ3", { low: 0.68 }),
    makeEffect("Distortion", { drive: 0.25, output: 0.38 }),
    makeEffect("Compressor", { threshold: 0.45, ratio: 0.3 }),
  ]);
  kick.volume = 0.6;
  // the big 80s snare: a 909 snare and clap on the same steps, into a short, dense, wet room
  // that's squeezed (gated reverb, in spirit)
  const room = () => [
    makeEffect("Reverb", { size: 0.35, decay: 0.2, predelay: 0, damp: 0.3, mix: 0.5 }),
    makeEffect("Compressor", { threshold: 0.35, ratio: 0.45, release: 0.15 }),
  ];
  const snare = hitsTrack("Snare", "kit:909:snare", "909 Snare", "snare", room());
  snare.volume = 0.72;
  const clap = hitsTrack("Clap", "kit:909:clap", "909 Clap", "clap", room());
  clap.volume = 0.6;
  const hat = hitsTrack("Cl Hat", "kit:909:chh", "909 Closed Hat", "hat");
  hat.volume = 0.42;
  const ohat = hitsTrack("Op Hat", "kit:909:ohh", "909 Open Hat", "hat");
  ohat.volume = 0.38;
  const crash = hitsTrack("Crash", "kit:909:crash", "909 Crash", "hat");
  crash.volume = 0.42;
  crash.params["mix.sendA"] = 0.3;
  // synth toms for the fills (their pitch falls as they ring)
  const toms = patchTrack("Toms", "Synth Toms", "tom", {
    osc: [{ shape: 0, retrigger: true, phase: 0.25, drift: 0 }],
    noise: { level: 0.08 },
    filters: [{ cutoff: 3000, keytrack: 0 }],
    envs: [
      { attack: 0.001, decay: 0.34, sustain: 0, release: 0.2, curve: 0.7, velocity: 0.6 },
      {},
      { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1, curve: 0.5 },
    ],
    matrix: [{ source: "env3", dest: "pitch", amount: 7 / 24 }],
    output: { volume: -6 },
  });
  toms.params["mix.sendA"] = 0.3;
  const bass = notesTrack("Bass", synth("moroder-bass"), "Moroder Bass", "bass", [pump(0.5)]);
  bass.volume = 0.75;
  const arp = notesTrack("Arp", synth("upside-down-arp"), "Upside Down Arp", "keys", [
    // a dotted-eighth echo, the arp's shadow
    makeEffect("Delay", { time: 4 / 7, feedback: 0.42, mix: 0.3 }),
    pump(0.35),
  ]);
  arp.volume = 0.5;
  const pad = notesTrack("Pad", synth("juno-strings"), "Juno Strings", "keys", [
    makeEffect("Chorus"),
    pump(0.65),
  ]);
  pad.params["mix.sendA"] = 0.45;
  pad.volume = 0.6;
  const brass = notesTrack("Brass", synth("vangelis-brass"), "Vangelis Brass", "keys", [pump(0.3)]);
  brass.params["mix.sendA"] = 0.35;
  brass.volume = 0.5;
  const lead = notesTrack("Lead", synth("axel-lead"), "Axel Lead", "keys", [
    makeEffect("Delay", { time: 4 / 7, feedback: 0.3, mix: 0.22 }),
  ]);
  lead.params["mix.sendA"] = 0.3;
  lead.volume = 0.6;
  const saw = notesTrack("Supersaw", synth("supersaw"), "Supersaw", "keys", [pump(0.5)]);
  saw.params["mix.sendA"] = 0.3;
  saw.volume = 0.55;
  const riser = notesTrack("Riser", synth("noise-riser"), "Noise Riser", "fx");
  riser.volume = 0.4;
  const zap = notesTrack("Zap", synth("laser"), "Laser Zap", "fx");
  zap.volume = 0.4;
  p.tracks = [
    kick,
    snare,
    clap,
    hat,
    ohat,
    crash,
    toms,
    bass,
    arp,
    pad,
    brass,
    lead,
    saw,
    riser,
    zap,
  ];

  // ---------- parts ----------
  const backbeat = (pt: Pattern, n = 4) => {
    drum(pt, kick, bars("x... x... x... x...", n));
    drum(pt, snare, bars(".... x... .... x...", n));
    drum(pt, clap, bars(".... x... .... x...", n));
    drum(pt, hat, bars("xoXo xoXo xoXo xoXo", n));
  };
  // octave sixteenths, the motor of the genre
  const octaves = (pt: Pattern, progression: string[]) =>
    notes(
      pt,
      bass,
      perBar(progression, (c, at) => {
        const root = chord(c, 1)[0];
        return Array.from({ length: 16 }, (_, i) => [at + i, [root + (i % 2) * 12], 1]) as NoteList;
      }),
      0.72,
    );
  // up and down the chord, two octaves, in sixteenths
  const arpeggio = (pt: Pattern, progression: string[], velocity = 0.62) =>
    notes(
      pt,
      arp,
      perBar(progression, (c, at) => {
        const [r, t, f] = chord(c, 4);
        const tones = [r, t, f, r + 12];
        return [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 3].map((k, i) => [
          at + i,
          [tones[k]],
          1,
        ]) as NoteList;
      }),
      velocity,
    );
  const strings = (pt: Pattern, progression: string[], velocity = 0.55) =>
    notes(
      pt,
      pad,
      perBar(progression, (c, at) => [[at, chord(c, 3), 16]]),
      velocity,
    );
  const stabs = (pt: Pattern) =>
    notes(
      pt,
      brass,
      perBar(HIGHWAY_CHORUS, (c, at) => [
        [at, chord(c, 4), 3],
        [at + 10, chord(c, 4), 2],
      ]),
      0.7,
    );
  // the hook: original, in A minor over F – G – Em – Am
  const hook: NoteList = [
    [0, [note("A", 5)], 3],
    [3, [note("C", 6)], 3],
    [6, [note("A", 5)], 2],
    [8, [note("G", 5)], 3],
    [11, [note("F", 5)], 3],
    [14, [note("E", 5)], 2],
    [16, [note("D", 5)], 3],
    [19, [note("G", 5)], 3],
    [22, [note("B", 5)], 2],
    [24, [note("D", 6)], 4],
    [28, [note("C", 6)], 2],
    [30, [note("B", 5)], 2],
    [32, [note("E", 5)], 3],
    [35, [note("G", 5)], 3],
    [38, [note("B", 5)], 2],
    [40, [note("E", 6)], 6],
    [46, [note("D", 6)], 2],
    [48, [note("C", 6)], 3],
    [51, [note("B", 5)], 3],
    [54, [note("A", 5)], 6],
    [60, [note("E", 5)], 2],
    [62, [note("G", 5)], 2],
  ];

  // ---------- pages ----------
  const intro = page(p, "Intro", 64);
  strings(intro, HIGHWAY, 0.5);
  // Brightness opens bar by bar
  lock(
    intro,
    pad,
    [0, 16, 32, 48].map((s, i) => [s, { "sound.macro1": 0.12 + 0.18 * i }]),
  );
  arpeggio(intro, HIGHWAY, 0.5);
  // the arp comes in for the second half
  for (const st of (intro.lanes[arp.id] as Lane).steps.slice(0, 32)) {
    st.on = false;
    delete st.notes;
  }
  drum(
    intro,
    hat,
    ".... .... .... .... .... .... .... .... oxox oxox oxox oxox oxXx oxXx oxXx oxXx",
  );
  drum(
    intro,
    kick,
    ".... .... .... .... .... .... .... .... .... .... .... .... x... x... x... x...",
  );
  notes(intro, riser, [[32, [note("C", 4)], 32]], 0.6);

  const verse = page(p, "Verse", 64, 2);
  backbeat(verse);
  octaves(verse, HIGHWAY);
  arpeggio(verse, HIGHWAY);
  strings(verse, HIGHWAY);

  const build = page(p, "Build", 64);
  drum(build, kick, bars("x... x... x... x...", 3) + "x.x. x.x. x.x. xxxx");
  // the snare rolls in: backbeat, then eighths, then sixteenths and ratchets
  drum(
    build,
    snare,
    ".... x... .... x... ..x. x... ..x. x.x. x.x. x.x. x.x. x.x. xxxx xxxx rrrr rrrr",
  );
  drum(build, hat, bars("xoxo xoxo xoxo xoxo", 3) + ".... .... .... ....");
  octaves(build, HIGHWAY);
  arpeggio(build, HIGHWAY);
  strings(build, HIGHWAY, 0.5);
  // Movement builds on the arp, step by step
  lock(
    build,
    arp,
    Array.from({ length: 64 }, (_, i) => [i, { "sound.macro7": (0.9 * i) / 63 }]),
  );
  notes(build, riser, [[0, [note("C", 4)], 64]], 0.7);
  // the fill: four toms falling down to the chorus
  const fill = ".... ".repeat(14);
  hits(build, toms, `${fill}xX.. ....`, note("E", 3));
  hits(build, toms, `${fill}..xX ....`, note("C", 3));
  hits(build, toms, `${fill}.... xX..`, note("A", 2));
  hits(build, toms, `${fill}.... ..xX`, note("F", 2));

  const chorus = page(p, "Chorus", 64, 2);
  backbeat(chorus);
  drum(chorus, ohat, bars("..x. ..x. ..x. ..x.", 4));
  drum(chorus, crash, `X... ${".... ".repeat(15)}`);
  octaves(chorus, HIGHWAY_CHORUS);
  arpeggio(chorus, HIGHWAY_CHORUS, 0.55);
  strings(chorus, HIGHWAY_CHORUS);
  stabs(chorus);
  notes(chorus, lead, hook, 0.8);
  hits(chorus, zap, `X... ${".... ".repeat(15)}`, note("C", 6));

  const breakdown = page(p, "Breakdown", 64, 2);
  strings(breakdown, HIGHWAY_CHORUS, 0.6);
  arpeggio(breakdown, HIGHWAY_CHORUS, 0.5);
  notes(
    breakdown,
    bass,
    perBar(HIGHWAY_CHORUS, (c, at) => [[at, [chord(c, 1)[0]], 8]]),
    0.6,
  );
  notes(breakdown, lead, hook, 0.55);
  drum(breakdown, hat, bars(".... ..x. .... ..x.", 4));

  const final = page(p, "Final Chorus", 64, 3);
  backbeat(final);
  drum(final, ohat, bars("..x. ..x. ..x. ..x.", 4));
  drum(final, crash, `X... ${".... ".repeat(15)}`);
  octaves(final, HIGHWAY_CHORUS);
  arpeggio(final, HIGHWAY_CHORUS, 0.55);
  strings(final, HIGHWAY_CHORUS);
  stabs(final);
  notes(final, lead, hook, 0.82);
  // the supersaw doubles the hook an octave down, and fills the chords
  notes(
    final,
    saw,
    hook.map(([at, ps, len]) => [at, ps.map((x) => x - 12), len]),
    0.6,
  );
  hits(final, zap, `X... ${".... ".repeat(15)}`, note("C", 6));

  const outro = page(p, "Outro", 64, 2);
  strings(outro, HIGHWAY, 0.5);
  arpeggio(outro, HIGHWAY, 0.45);
  // Brightness closes again as it drives away
  lock(
    outro,
    pad,
    [0, 16, 32, 48].map((s, i) => [s, { "sound.macro1": 0.66 - 0.18 * i }]),
  );
  drum(outro, kick, "x... x... x... x... x... x... x... x... " + ".... ".repeat(8));
  drum(outro, hat, bars("xoxo xoxo xoxo xoxo", 2) + ".... ".repeat(8));

  // the second build comes back as a copy of the first (the slot order makes the song)
  const order = [intro, verse, build, chorus, breakdown, build, final, outro];
  p.slots = order.map((pt, i) => ({
    id: `slot-${pt.id}-${i}`,
    patternId: pt.id,
    repeats:
      pt === verse || pt === chorus || pt === breakdown || pt === outro ? 2 : pt === final ? 3 : 1,
  }));
  return p;
}

export const SYNTH_SONGS = {
  hyperdrive: split(hyperdrive),
  liquidLadder: split(liquidLadder),
  laserHighway: split(laserHighway),
};
