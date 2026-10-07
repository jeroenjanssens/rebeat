import { makePattern, makeTrack, type Project } from "../model/project";
import type { StepLane, Track } from "../model/types";
import { demoProject } from "./nightDrive";

export interface Template {
  id: string;
  name: string;
  description: string;
  create: () => Project;
}

function base(name: string, bpm: number): Project {
  return {
    name,
    bpm,
    timeSignature: [4, 4],
    swing: 0.5,
    metronome: false,
    countIn: false,
    tracks: [],
    patterns: {},
    slots: [],
  };
}

function drum(name: string, sampleId: string, source: string, category: Track["category"]) {
  const t = makeTrack("drum", category, name, source);
  t.sampleId = sampleId;
  return t;
}

function hits(p: Project, patternId: string, track: Track, code: string) {
  const lane = p.patterns[patternId].lanes[track.id] as StepLane;
  [...code.replace(/\s/g, "")].forEach((c, i) => {
    if (c === ".") return;
    lane.steps[i].on = true;
    lane.steps[i].velocity = c === "X" ? 1 : c === "o" ? 0.45 : 0.8;
  });
}

function withPage(p: Project, name = "Page 1") {
  const pattern = makePattern(p, name);
  p.patterns[pattern.id] = pattern;
  p.slots.push({ id: `slot-${pattern.id}`, patternId: pattern.id, repeats: 1 });
  return pattern.id;
}

function empty(): Project {
  const p = base("Untitled", 120);
  p.tracks = [
    drum("Kick", "kit:909:kick", "909 Kick", "kick"),
    drum("Snare", "kit:909:snare", "909 Snare", "snare"),
    drum("Cl Hat", "kit:909:chh", "909 Closed Hat", "hat"),
    drum("Clap", "kit:909:clap", "909 Clap", "clap"),
  ];
  withPage(p);
  return p;
}

function starter808(): Project {
  const p = base("808 starter", 96);
  const kick = drum("Kick", "kit:808:kick", "808 Kick", "kick");
  const snare = drum("Snare", "kit:808:snare", "808 Snare", "snare");
  const clap = drum("Clap", "kit:808:clap", "808 Clap", "clap");
  const chh = drum("Cl Hat", "kit:808:chh", "808 Closed Hat", "hat");
  const ohh = drum("Op Hat", "kit:808:ohh", "808 Open Hat", "hat");
  const cow = drum("Cowbell", "kit:808:cowbell", "808 Cowbell", "perc");
  const tom = drum("Tom", "kit:808:tom", "808 Tom", "tom");
  chh.params["sound.choke"] = 1 / 8;
  ohh.params["sound.choke"] = 1 / 8;
  p.tracks = [kick, snare, clap, chh, ohh, cow, tom];
  p.swing = 0.56;
  const a = withPage(p, "Groove");
  hits(p, a, kick, "X... ..x. ..X. ....");
  hits(p, a, snare, ".... X... .... X...");
  hits(p, a, chh, "x.x. x.xo x.x. x.x.");
  hits(p, a, ohh, ".... .... .... ..x.");
  hits(p, a, cow, "...x .... .x.. ....");
  const b = withPage(p, "Break");
  hits(p, b, kick, "X... .... X.x. ....");
  hits(p, b, clap, ".... X... .... X..x");
  hits(p, b, chh, "xxxx xxxx xxxx xxxx");
  hits(p, b, tom, ".... .... .... .xxx");
  return p;
}

function loopStation(): Project {
  const p = base("Loop station", 100);
  const kick = drum("Kick", "kit:909:kick", "909 Kick", "kick");
  const hat = drum("Hat", "kit:909:chh", "909 Closed Hat", "hat");
  const loops = ["Loop 1", "Loop 2", "Loop 3"].map((n) => {
    const t = makeTrack("audio", "vocal", n, "No clip");
    t.arm = n === "Loop 1";
    return t;
  });
  p.tracks = [kick, hat, ...loops];
  p.metronome = true;
  p.countIn = true;
  const a = withPage(p, "Loop");
  hits(p, a, kick, "x... x... x... x...");
  hits(p, a, hat, "..x. ..x. ..x. ..x.");
  return p;
}

export const TEMPLATES: Template[] = [
  { id: "empty", name: "Empty", description: "Four drum tracks, one page", create: empty },
  {
    id: "808",
    name: "808 starter",
    description: "An 808 kit with a groove and a break",
    create: starter808,
  },
  {
    id: "loops",
    name: "Loop station",
    description: "A beat and three audio tracks for live loops",
    create: loopStation,
  },
  {
    id: "night-drive",
    name: "Night Drive",
    description: "The demo song: drums, bass, chords, vocal",
    create: demoProject,
  },
];
