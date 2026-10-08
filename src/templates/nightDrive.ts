import { TRACK_PALETTE } from "../model/colors";
import { defaultBuses, defaultMaster, defaultPerf, makeEffect } from "../model/effects";
import { makePattern, makeTrack, type Project } from "../model/project";
import type { StepLane } from "../model/types";
import { drum, notes } from "./builder";

export function demoProject(): Project {
  const kick = makeTrack("drum", "kick", "Kick", "909 Kick", [makeEffect("Compressor")]);
  const snare = makeTrack("drum", "snare", "Snare", "909 Snare", [makeEffect("Distortion")]);
  const clap = makeTrack("drum", "clap", "Clap", "909 Clap");
  const hat = makeTrack("drum", "hat", "Cl Hat", "909 Closed Hat");
  const ohat = makeTrack("drum", "hat", "Op Hat", "909 Open Hat");
  ohat.color = TRACK_PALETTE[4];
  ohat.params["sound.choke"] = 1 / 8;
  hat.params["sound.choke"] = 1 / 8;
  const perc = makeTrack("drum", "perc", "Rim", "909 Rim");
  const bass = makeTrack("instrument", "bass", "Bass", "Mono Bass · Acid", [
    makeEffect("Filter"),
    makeEffect("Distortion"),
  ]);
  const chords = makeTrack("instrument", "keys", "Chords", "Poly · Warm Pad", [
    makeEffect("Delay"),
    makeEffect("Reverb"),
  ]);
  const vox = makeTrack("audio", "vocal", "Vox", "Vox hook 112", [
    makeEffect("Compressor"),
    makeEffect("Delay"),
  ]);
  kick.sampleId = "kit:909:kick";
  snare.sampleId = "kit:909:snare";
  clap.sampleId = "kit:909:clap";
  hat.sampleId = "kit:909:chh";
  ohat.sampleId = "kit:909:ohh";
  perc.sampleId = "kit:909:rim";
  vox.sampleId = "demo:vox-hook";
  vox.params["mix.sendA"] = 0.35;
  chords.params["mix.sendA"] = 0.5;
  chords.volume = 0.62;

  const project: Project = {
    name: "Night Drive",
    bpm: 112,
    timeSignature: [4, 4],
    swing: 0.5,
    metronome: false,
    countIn: false,
    buses: defaultBuses(),
    master: defaultMaster(),
    key: { root: 0, scale: "minor" },
    midiMappings: [],
    playMode: "song",
    perf: defaultPerf(),
    tracks: [kick, snare, clap, hat, ohat, perc, bass, chords, vox],
    patterns: {},
    slots: [],
  };

  const intro = makePattern(project, "Intro");
  project.patterns[intro.id] = intro;
  drum(intro, kick, "x... x... x... x...");
  drum(intro, hat, "..x. ..x. ..x. ..xp");
  notes(intro, chords, [
    [0, [60, 63, 67], 8],
    [8, [56, 60, 63], 8],
  ]);

  const verse = makePattern(project, "Verse");
  project.patterns[verse.id] = verse;
  drum(verse, kick, "X... x..< x... x.p.");
  drum(verse, snare, ".... x... .... x..o");
  drum(verse, clap, ".... X... .... X...");
  drum(verse, hat, "xoxo xoxl xoxo xrxo");
  drum(verse, ohat, "..x. ..x. ..x. ..c.");
  drum(verse, perc, "x..x .x");
  (verse.lanes[perc.id] as StepLane).stepCountOverride = 6;
  notes(verse, bass, [
    [0, [36], 1],
    [2, [36], 1],
    [4, [39], 2, true],
    [7, [31], 1],
    [8, [36], 1],
    [10, [36], 1],
    [12, [41], 1],
    [14, [43], 2],
  ]);
  notes(verse, chords, [
    [0, [60, 63, 67], 6],
    [8, [56, 60, 63], 4],
    [12, [58, 62, 65], 3],
  ]);
  verse.lanes[vox.id] = { kind: "clip", active: true, launchMode: "loop" };
  verse.swing = 0.56;

  const fill = makePattern(project, "Fill", 8);
  project.patterns[fill.id] = fill;
  drum(fill, kick, "X... x.x.");
  drum(fill, snare, "..x. rxrX");
  drum(fill, hat, "xxxx xxxx");
  notes(fill, bass, [
    [0, [36], 1],
    [4, [48], 1],
    [6, [46], 2, true],
  ]);

  const drop = makePattern(project, "Drop", 32);
  project.patterns[drop.id] = drop;
  drum(drop, kick, "X..x x... x..x x... X..x x... x..x x.xx");
  drum(drop, snare, ".... X... .... X... .... X... .... X.rr");
  drum(drop, clap, ".... x... .... x... .... x... .... x...");
  drum(drop, hat, "xxXx xxXx xxXx xxXx xxXx xxXx xxXx xrXr");
  drum(drop, ohat, "..x. ..x. ..x. ..x. ..x. ..x. ..x. ..x.");
  notes(drop, bass, [
    [0, [36], 1],
    [2, [48], 1],
    [3, [36], 1],
    [6, [46], 2],
    [8, [36], 1],
    [11, [39], 1, true],
    [12, [41], 2],
    [16, [32], 1],
    [18, [44], 1],
    [19, [32], 1],
    [22, [43], 2],
    [24, [34], 1],
    [27, [46], 1],
    [28, [43], 4, true],
  ]);
  notes(drop, chords, [
    [0, [60, 63, 67], 8],
    [8, [58, 62, 65], 8],
    [16, [56, 60, 63], 8],
    [24, [55, 58, 62], 8],
  ]);
  drop.lanes[vox.id] = { kind: "clip", active: true, launchMode: "oneshot" };

  project.slots = [
    { id: "slot-intro", patternId: intro.id, repeats: 1 },
    { id: "slot-verse", patternId: verse.id, repeats: 2 },
    { id: "slot-fill", patternId: fill.id, repeats: 1 },
    { id: "slot-drop", patternId: drop.id, repeats: 2 },
    { id: "slot-intro-2", patternId: intro.id, repeats: 1 },
  ];
  return project;
}
