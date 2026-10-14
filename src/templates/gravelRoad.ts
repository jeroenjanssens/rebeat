/**
 * Gravel Road: a country song. 112 BPM, G major, about two minutes, made of
 * physical models (D249) and a few synths, and the arrangement tools:
 *
 * - a strummed acoustic guitar (its strings staggered within each step, down and up strokes,
 *   boom-chick), an upright bass, a banjo rolling sixteenths, a bowed fiddle, a harmonica (a reed
 *   on a closed tube) whose blue notes bend, a pedal steel (a synth) that swells and bends up a
 *   whole step like its pedals, and a brush train beat
 * - section settings (D183): the banjo sits out the first verse; the last choruses and the outro
 *   go up a whole step (the truck driver's key change, G → A)
 * - lanes on the models' knobs: the guitar's pickup moves toward the bridge in the choruses, the
 *   fiddle bows harder through the bridge; a stepped lane turns the steel's echo on in the
 *   choruses; the steel opens up in the last chorus
 * - a tempo ramp: the outro slows down to the last chord
 */
import { makeEffect } from "../model/effects";
import { paramOf, toKnob } from "../model/patchParams";
import type { Project } from "../model/project";
import { makePatch, type PatchSpec } from "../model/synth";
import type {
  AutomationPoint,
  Lane,
  NoteBend,
  Pattern,
  Section,
  Sound,
  SoundCategory,
  Track,
} from "../model/types";
import { drum, emptyProject, hitsTrack, notes, notesTrack, page } from "./builder";

/** A knob's position (0..1) for a value of a synth knob. */
const knob = (path: string, value: number) => toKnob(paramOf(path)!, value);

/** A sound of its own (a patch made here), named. */
const own = (name: string, spec: PatchSpec): Sound => ({
  source: "synth",
  preset: "init",
  patch: makePatch(spec),
  name,
});

/** A physical model (D249): no filter, an amp envelope that leaves the decay to it. */
const phys = (physical: PatchSpec["physical"], spec: PatchSpec = {}, volume = -12): PatchSpec => ({
  source: "physical",
  filters: [{ on: false }],
  envs: [{ attack: 0.001, sustain: 1, release: 1.5, velocity: 0 }],
  physical,
  output: { volume, spread: 0 },
  ...spec,
});

function track(name: string, sound: Sound, category: SoundCategory, volume: number) {
  const t = notesTrack(name, sound, sound.name ?? name, category);
  t.volume = volume;
  return t;
}

/** A Hits track playing a sound of its own (a synth's one note per hit). */
function hits(name: string, sound: Sound, volume: number) {
  const t = track(name, sound, "perc", volume);
  t.mode = "hits";
  t.hitNote = 60;
  return t;
}

/** Bend the note on step `i` of a lane (its first note). */
function bend(pattern: Pattern, t: Track, i: number, b: NoteBend) {
  const n = (pattern.lanes[t.id] as Lane).steps[i].notes?.[0];
  if (n) n.bend = b;
}
const b = (shape: NoteBend["shape"], amount: number, time: number, extra: Partial<NoteBend> = {}) =>
  ({ shape, amount, time, delay: 0, unit: "s", ...extra }) satisfies NoteBend;

// ---------- the guitar's chords (low string to high, open voicings) ----------
const VOICING: Record<string, number[]> = {
  G: [43, 47, 50, 55, 59, 67],
  C: [48, 52, 55, 60, 64],
  D: [50, 57, 62, 66],
  Em: [40, 47, 52, 55, 59, 64],
};
/** The bass note of each chord (the boom), and its fifth (the alternate boom). */
const ROOT: Record<string, [number, number]> = {
  G: [43, 38],
  C: [48, 43],
  D: [50, 45],
  Em: [40, 47],
};
const BASS: Record<string, [number, number]> = {
  G: [31, 38],
  C: [36, 31],
  D: [38, 33],
  Em: [28, 35],
};
/** A banjo's forward roll over a chord: eight sixteenths, twice a bar. */
const ROLL: Record<string, number[]> = {
  G: [55, 59, 62, 67, 59, 62, 67, 62],
  C: [55, 60, 64, 67, 60, 64, 67, 64],
  D: [57, 62, 66, 69, 62, 66, 69, 66],
  Em: [55, 59, 64, 67, 59, 64, 67, 64],
};

export function gravelRoad(): Project {
  const p = emptyProject("Gravel Road", 112);
  p.key = { root: 7, scale: "major" };

  // ---------- tracks ----------
  const kick = hitsTrack("Kick", "kit:808:kick", "808 Kick", "kick");
  kick.volume = 0.58;
  const brush = hits(
    "Brush",
    own("Brush snare", {
      osc: [{ on: false, level: 0 }],
      noise: { level: 0.9, color: "pink" },
      filters: [{ type: "bp", cutoff: 2800, reso: 0.15, keytrack: 0 }],
      envs: [{ attack: 0.004, decay: 0.14, sustain: 0, release: 0.1, velocity: 0.9 }],
      output: { volume: 2 },
    }),
    0.85,
  );
  brush.params["mix.sendA"] = 0.15;
  const shaker = hits(
    "Shaker",
    own("Shaker", {
      osc: [{ on: false, level: 0 }],
      noise: { level: 0.8, color: "white" },
      filters: [{ type: "hp", cutoff: 7000, reso: 0.1, keytrack: 0 }],
      envs: [{ attack: 0.01, decay: 0.05, sustain: 0, release: 0.04, velocity: 0.8 }],
      output: { volume: -4, pan: 0.4 },
    }),
    0.5,
  );
  const guitar = track(
    "Guitar",
    own(
      "Acoustic guitar",
      phys(
        {
          exciter: { type: "pluck", hardness: 0.62, position: 0.15, noise: 0.18, velocity: 0.6 },
          resonator: {
            model: "string",
            decay: 3,
            damping: 0.4,
            pickup: 0.18,
            width: 0.5,
            release: 0.6,
          },
          body: { type: "guitar", mix: 0.6 },
        },
        {},
        -16,
      ),
    ),
    "keys",
    0.75,
  );
  guitar.params["mix.pan"] = 0.675;
  guitar.params["mix.sendA"] = 0.15;
  const bass = track(
    "Upright bass",
    own(
      "Upright bass",
      phys(
        {
          exciter: { type: "pluck", hardness: 0.35, position: 0.2, noise: 0.1, velocity: 0.5 },
          resonator: { model: "string", decay: 1.2, damping: 0.65, pickup: 0.25, release: 0.85 },
          body: { type: "cello", mix: 0.6, size: 1.4 },
        },
        { voice: { mode: "mono" } },
        -6,
      ),
    ),
    "bass",
    0.65,
  );
  const banjo = track(
    "Banjo",
    own(
      "Banjo",
      phys(
        {
          exciter: { type: "pluck", hardness: 0.95, position: 0.1, noise: 0.25, velocity: 0.6 },
          resonator: { model: "string", decay: 0.9, damping: 0.45, pickup: 0.06, release: 0.4 },
          body: { type: "box", mix: 0.6, size: 0.55 },
        },
        {},
        -14,
      ),
    ),
    "keys",
    0.75,
  );
  banjo.params["mix.pan"] = 0.3;
  banjo.params["mix.sendA"] = 0.15;
  const fiddle = track(
    "Fiddle",
    own(
      "Fiddle",
      phys(
        {
          exciter: { type: "bow", pressure: 0.5, hardness: 0.55, position: 0.1, noise: 0.25 },
          resonator: { model: "string", decay: 2, damping: 0.45, pickup: 0.12, release: 0.5 },
          body: { type: "violin", mix: 0.65 },
        },
        {
          envs: [{ attack: 0.08, sustain: 1, release: 0.35, velocity: 0 }],
          lfos: [{ rate: 5.6, delay: 0.35, mode: "voice" }],
          matrix: [{ source: "lfo1", dest: "pitch", amount: 0.005 }],
          voice: { mode: "legato", glide: 0.05 },
        },
        -9,
      ),
    ),
    "keys",
    0.6,
  );
  fiddle.params["mix.pan"] = 0.4;
  fiddle.params["mix.sendA"] = 0.3;
  const harp = track(
    "Harmonica",
    own(
      "Harmonica",
      phys(
        {
          exciter: { type: "blow", pressure: 0.85, noise: 0.3, hardness: 0.7 },
          resonator: { model: "tube", end: "closed", decay: 2, damping: 0.3 },
        },
        {
          envs: [{ attack: 0.03, sustain: 1, release: 0.15, velocity: 0 }],
          voice: { mode: "legato", glide: 0.03 },
        },
        -9,
      ),
    ),
    "keys",
    0.55,
  );
  harp.params["mix.pan"] = 0.575;
  harp.params["mix.sendA"] = 0.25;
  // the steel's echo: on where its lane says (the choruses)
  const echo = makeEffect("Delay", { time: 0.5, feedback: 0.35, mix: 0.25 });
  const steel = notesTrack(
    "Pedal steel",
    own("Pedal steel", {
      osc: [
        { shape: 1, drift: 0 },
        { shape: 0, octave: 1, level: 0.3, drift: 0 },
      ],
      filters: [{ cutoff: 2600, reso: 0.1, keytrack: 0.4 }],
      // the volume pedal: every note swells in
      envs: [{ attack: 0.35, decay: 0.5, sustain: 0.85, release: 1.2, velocity: 0.3 }],
      lfos: [{ rate: 4.8, delay: 0.6, mode: "voice" }],
      matrix: [{ source: "lfo1", dest: "pitch", amount: 0.003 }],
      output: { volume: -13, spread: 0.3 },
    }),
    "Pedal steel",
    "keys",
    [echo],
  );
  steel.volume = 0.45;
  steel.params["mix.pan"] = 0.65;
  steel.params["mix.sendA"] = 0.4;
  p.tracks = [kick, brush, shaker, guitar, bass, banjo, fiddle, harp, steel];

  // ---------- parts ----------
  const BAR = 16;
  /** A strum: the chord's strings a little apart within the step (down: low to high). */
  const strum = (
    pt: Pattern,
    step: number,
    name: string,
    len: number,
    up = false,
    velocity = 0.7,
  ) => {
    const v = VOICING[name];
    const strings = up ? v.slice(-4).reverse() : v;
    const s = (pt.lanes[guitar.id] as Lane).steps[step];
    s.on = true;
    s.velocity = velocity;
    s.notes = strings.map((pitch, k) => ({
      pitch,
      length: len,
      velocity: velocity * (up ? 0.75 : 1) * (1 - k * 0.04),
      ...(k ? { offset: k * 0.07 } : {}),
    }));
  };
  /** Boom-chick: the bass string on 1 and 3, the strum on 2 and 4, an up stroke before 1. */
  const boomChick = (pt: Pattern, chords: string[]) =>
    chords.forEach((c, i) => {
      const at = i * BAR;
      const [root, fifth] = ROOT[c];
      notes(pt, guitar, [[at, [root], 3]], 0.75);
      strum(pt, at + 4, c, 3);
      notes(pt, guitar, [[at + 8, [fifth], 3]], 0.7);
      strum(pt, at + 12, c, 2);
      strum(pt, at + 14, c, 2, true, 0.6);
    });
  const walking = (pt: Pattern, chords: string[]) =>
    chords.forEach((c, i) => {
      const [root, fifth] = BASS[c];
      notes(
        pt,
        bass,
        [
          [i * BAR, [root], 6],
          [i * BAR + 8, [fifth], 6],
        ],
        0.8,
      );
    });
  const rolls = (pt: Pattern, chords: string[], bars = chords.length) =>
    chords
      .slice(0, bars)
      .forEach((c, i) =>
        ROLL[c]
          .concat(ROLL[c])
          .forEach((n, k) => notes(pt, banjo, [[i * BAR + k, [n], 1]], k % 4 === 0 ? 0.75 : 0.55)),
      );
  /** The train beat: brushes on every sixteenth, the backbeat accented; the kick on 1 and 3. */
  const train = (pt: Pattern, bars: number, soft = false) => {
    drum(pt, kick, "x... .... x... .... ".repeat(bars));
    drum(pt, brush, (soft ? "o..o X..o o..o X..o " : "oooo Xooo oooo Xooo ").repeat(bars));
  };

  // ---------- patterns (four bars each) ----------
  const intro = page(p, "Intro", 64, 1);
  rolls(intro, ["G", "C", "D", "G"]);
  notes(
    intro,
    fiddle,
    [
      [0, [74], 28],
      [32, [69], 12],
      [48, [71], 16],
    ],
    0.6,
  );
  bend(intro, fiddle, 0, b("scoop", -2, 0.3, { ease: { type: "smooth" } }));
  notes(intro, bass, [[48, [31], 8]], 0.75);
  // the harmonica's pickup into the verse
  notes(
    intro,
    harp,
    [
      [56, [67], 2],
      [58, [70], 2],
      [60, [71], 4],
    ],
    0.75,
  );
  bend(intro, harp, 58, b("scoop", -1, 0.12));
  drum(intro, brush, ".... .... .... .... ".repeat(3) + "o.o. X.o. o.o. XoXo ");

  const verse = page(p, "Verse", 64, 2);
  const VERSE = ["G", "C", "G", "D"];
  boomChick(verse, VERSE);
  walking(verse, VERSE);
  rolls(verse, VERSE);
  train(verse, 4, true);
  // the harmonica answers at the end of bars 2 and 4
  notes(
    verse,
    harp,
    [
      [24, [74], 2],
      [26, [71], 2],
      [28, [67], 4],
      [56, [69], 2],
      [58, [71], 2],
      [60, [74], 4],
    ],
    0.7,
  );
  bend(verse, harp, 24, b("scoop", -1, 0.1));
  bend(verse, harp, 58, b("scoop", -1, 0.12, { ease: { type: "smooth" } }));
  bend(verse, harp, 60, b("fall", -3, 0.25));

  const chorus = page(p, "Chorus", 64, 1);
  const CHORUS = ["C", "G", "D", "G"];
  boomChick(chorus, CHORUS);
  walking(chorus, CHORUS);
  rolls(chorus, CHORUS);
  train(chorus, 4);
  drum(chorus, shaker, "x.x. x.x. x.x. x.x. ".repeat(4));
  notes(
    chorus,
    fiddle,
    [
      [0, [76], 4],
      [4, [74], 2],
      [6, [72], 2],
      [8, [76], 4],
      [12, [79], 4],
      [16, [74], 8],
      [24, [71], 4],
      [28, [74], 4],
      [32, [78], 6],
      [38, [76], 2],
      [40, [74], 4],
      [44, [69], 4],
      [48, [67], 14],
    ],
    0.7,
  );
  bend(chorus, fiddle, 0, b("scoop", -2, 0.12, { ease: { type: "smooth" } }));
  bend(chorus, fiddle, 16, b("scoop", -1, 0.15));
  bend(chorus, fiddle, 32, b("scoop", -2, 0.1));
  bend(chorus, fiddle, 48, b("shake", 0.3, 1, { delay: 0.3, rate: 5.6 }));
  // the steel: swells, and a whole step up on its pedals in bars 2 and 4
  notes(
    chorus,
    steel,
    [
      [0, [67, 72], 15],
      [16, [69, 74], 15],
      [32, [66, 69], 15],
      [48, [69, 71], 15],
    ],
    0.6,
  );
  bend(chorus, steel, 16, b("rise", 2, 0.45, { delay: 0.5, ease: { type: "smooth" } }));
  bend(chorus, steel, 48, b("rise", 2, 0.6, { delay: 0.3, ease: { type: "smooth" } }));

  const bridge = page(p, "Bridge", 64, 1);
  const BRIDGE = ["Em", "C", "G", "D"];
  boomChick(bridge, BRIDGE);
  walking(bridge, BRIDGE);
  train(bridge, 4, true);
  // the fiddle takes a solo; the steel holds the chords underneath
  notes(
    bridge,
    fiddle,
    [
      [0, [76], 8],
      [8, [79], 4],
      [12, [83], 4],
      [16, [84], 8],
      [24, [83], 4],
      [28, [81], 4],
      [32, [79], 8],
      [40, [74], 8],
      [48, [78], 8],
      [56, [81], 8],
    ],
    0.75,
  );
  bend(bridge, fiddle, 0, b("scoop", -2, 0.2, { ease: { type: "smooth" } }));
  bend(bridge, fiddle, 16, b("scoop", -1, 0.15));
  bend(bridge, fiddle, 32, b("shake", 0.35, 0.8, { delay: 0.2, rate: 6 }));
  // F♯ up to G, the next note of G major, after a beat
  bend(bridge, fiddle, 48, b("next", 1, 0.2, { delay: 0.5, ease: { type: "smooth" } }));
  notes(
    bridge,
    steel,
    [
      [0, [64, 71], 15],
      [16, [64, 72], 15],
      [32, [67, 71], 15],
      [48, [66, 69], 15],
    ],
    0.5,
  );

  const outro = page(p, "Outro", 64, 1);
  const OUTRO = ["G", "C", "G"];
  boomChick(outro, OUTRO);
  walking(outro, OUTRO);
  rolls(outro, OUTRO, 2);
  drum(outro, kick, "x... .... x... .... ".repeat(3) + "x... .... .... .... ");
  drum(outro, brush, "o..o X..o o..o X..o ".repeat(3) + "X... .... .... .... ");
  // the last chord rings: a slow strum, the bass, the steel and the fiddle on top
  strum(outro, 48, "G", 16, false, 0.8);
  notes(outro, bass, [[48, [31], 16]], 0.8);
  notes(outro, steel, [[48, [67, 71, 74], 16]], 0.55);
  notes(
    outro,
    fiddle,
    [
      [32, [74], 12],
      [48, [79], 16],
    ],
    0.65,
  );
  bend(outro, fiddle, 48, b("shake", 0.3, 1.5, { delay: 0.4, rate: 5 }));
  bend(outro, steel, 48, b("scoop", -2, 0.6, { ease: { type: "smooth" } }));

  // ---------- the song ----------
  const section = (pt: Pattern, repeats: number, settings: Partial<Section> = {}): Section => ({
    id: `slot-${pt.id}-${p.slots.length}`,
    patternId: pt.id,
    repeats,
    ...settings,
  });
  const add = (x: Section) => (p.slots.push(x), x);
  p.slots = [];
  const UP = 2;
  add(section(intro, 1));
  // the banjo sits out the first verse
  const sVerse1 = add(section(verse, 2, { mutes: [banjo.id] }));
  const sChorus1 = add(section(chorus, 2));
  const sVerse2 = add(section(verse, 2));
  const sChorus2 = add(section(chorus, 2));
  const sBridge = add(section(bridge, 1));
  // the key change: a whole step up for the last choruses and the outro
  const sChorus3 = add(section(chorus, 2, { transpose: UP }));
  const sOutro = add(section(outro, 1, { transpose: UP }));

  // ---------- tempo: the outro slows down to the last chord ----------
  p.tempo = [
    { slotId: sOutro.id, at: 0, bpm: 112 },
    { slotId: sOutro.id, at: 12, bpm: 84, ramp: true, in: { type: "smooth" } },
  ];

  // ---------- automation ----------
  const at = (
    x: Section,
    q: number,
    value: number,
    eases: Pick<AutomationPoint, "in" | "out"> = {},
  ): AutomationPoint => ({ slotId: x.id, at: q, value, ...eases });
  const t = (tr: Track, path: string) => `track:${tr.id}:synth:${path}`;
  const pickup = (v: number) => knob("physical.resonator.pickup", v);
  p.automation = [
    {
      // the guitar's pickup moves toward the bridge in the choruses: brighter, more snap
      id: "auto-guitar-pickup",
      target: t(guitar, "physical.resonator.pickup"),
      on: true,
      points: [
        at(sVerse1, 0, pickup(0.22)),
        at(sChorus1, 0, pickup(0.08)),
        at(sVerse2, 0, pickup(0.22)),
        at(sChorus2, 0, pickup(0.08)),
        at(sBridge, 0, pickup(0.3)),
        at(sChorus3, 0, pickup(0.06)),
      ],
    },
    {
      // the fiddle bows harder and harder through its solo
      id: "auto-fiddle-pressure",
      target: t(fiddle, "physical.exciter.pressure"),
      on: true,
      points: [
        at(sBridge, 0, knob("physical.exciter.pressure", 0.35), { out: { type: "smooth" } }),
        at(sBridge, 15.75, knob("physical.exciter.pressure", 0.8), { out: { type: "none" } }),
        at(sChorus3, 0, knob("physical.exciter.pressure", 0.55)),
      ],
    },
    {
      // the steel's echo is on in the choruses (a stepped lane)
      id: "auto-steel-echo",
      target: `track:${steel.id}:fx:${echo.id}:on`,
      on: true,
      points: [
        at(sVerse1, 0, 0),
        at(sChorus1, 0, 1),
        at(sVerse2, 0, 0),
        at(sChorus2, 0, 1),
        at(sBridge, 0, 0),
        at(sChorus3, 0, 1),
      ],
    },
    {
      // and it opens up over the last choruses
      id: "auto-steel-cutoff",
      target: t(steel, "filters.0.cutoff"),
      on: true,
      points: [
        at(sChorus3, 0, knob("filters.0.cutoff", 2600), { out: { type: "smooth" } }),
        at(sChorus3, 31.75, knob("filters.0.cutoff", 6500)),
        at(sOutro, 8, knob("filters.0.cutoff", 3000)),
      ],
    },
  ];
  return p;
}
