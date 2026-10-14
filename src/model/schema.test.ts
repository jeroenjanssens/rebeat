import { describe, expect, it } from "vitest";
import { v6Project } from "./fixtures/v6";
import { demoProject } from "../templates/nightDrive";
import {
  SCHEMA_VERSION,
  deserializeProject,
  migrate,
  projectSampleIds,
  serializeProject,
} from "./schema";
import { MAX_STEPS } from "./types";
import { curveAt, lanePoints, snapStep } from "./arrangement";
import { makeEffect } from "./effects";
import { makePatch } from "./synth";
import { patchOf } from "../library/synthTrack";
import type { Track } from "./types";

describe("project schema", () => {
  it("round-trips through JSON", () => {
    const p = demoProject();
    const json = JSON.parse(JSON.stringify(serializeProject(p)));
    expect(json.schemaVersion).toBe(SCHEMA_VERSION);
    expect(deserializeProject(json)).toEqual(p);
  });

  it("migrates a mockup-era project (no schema version)", () => {
    const p = demoProject() as unknown as Record<string, unknown>;
    delete p.timeSignature;
    delete p.swing;
    delete p.metronome;
    delete p.countIn;
    const m = migrate(p);
    expect(m.timeSignature).toEqual([4, 4]);
    expect(m.swing).toBe(0.5);
  });

  it("refuses projects from a newer version", () => {
    expect(() => migrate({ format: "rebeat-project", schemaVersion: 999, project: {} })).toThrow(
      /newer/,
    );
  });

  it("repairs missing lanes, short step arrays and dangling slots", () => {
    const p = demoProject();
    const pattern = Object.values(p.patterns)[0];
    delete pattern.lanes[p.tracks[0].id];
    const lane = pattern.lanes[p.tracks[1].id];
    lane.steps = lane.steps.slice(0, 4);
    p.slots.push({ id: "x", patternId: "missing", repeats: 1 });
    const fixed = deserializeProject(JSON.parse(JSON.stringify(serializeProject(p))));
    const fp = fixed.patterns[pattern.id];
    expect(fp.lanes[p.tracks[0].id]).toBeDefined();
    const l1 = fp.lanes[p.tracks[1].id];
    expect(l1.steps.length).toBe(MAX_STEPS);
    expect(fixed.slots.some((s) => s.id === "x")).toBe(false);
  });

  it("lists the samples a project uses", () => {
    expect(projectSampleIds(demoProject())).toContain("kit:909:kick");
  });
});

describe("migration 1 → 2", () => {
  it("adds buses, a master chain, the key and effect ids", () => {
    const p = demoProject() as unknown as Record<string, unknown>;
    delete p.buses;
    delete p.master;
    delete p.key;
    const tracks = p.tracks as { effects: { id?: string }[] }[];
    for (const t of tracks) for (const fx of t.effects) delete fx.id;
    const m = deserializeProject({ format: "rebeat-project", schemaVersion: 1, project: p });
    expect(m.buses.map((b) => b.name)).toEqual(["Reverb", "Delay"]);
    expect(m.master.effects.map((e) => e.name)).toEqual(["EQ3", "Compressor", "Limiter"]);
    expect(m.key).toEqual({ root: 0, scale: "minor" });
    expect(m.tracks[0].effects[0].id).toMatch(/^fx-/);
  });
});

describe("migration 2 → 3", () => {
  it("turns step notes into notes with their own length and velocity", () => {
    // the demo as saved before step tracks (later migrations leave version 2 data like it)
    const json = v6Project("example-night-drive").project as Record<string, unknown>;
    const bass = (json.tracks as { id: string }[])[6].id;
    const pattern = Object.values(
      json.patterns as Record<
        string,
        { lanes: Record<string, { kind: string; steps: Record<string, unknown>[] }> }
      >,
    )[1];
    const bassLane = pattern.lanes[bass];
    bassLane.steps[4] = {
      ...bassLane.steps[4],
      notes: [39],
      length: 2,
      slide: true,
      velocity: 0.7,
    };
    const m = deserializeProject({ format: "rebeat-project", schemaVersion: 2, project: json });
    const lane = Object.values(m.patterns)[1].lanes[bass];
    expect(lane.steps[4].notes).toEqual([{ pitch: 39, length: 2, velocity: 0.7, slide: true }]);
    expect("length" in lane.steps[4]).toBe(false);
  });

  it("saves the play mode, and opens older projects in song mode", () => {
    const p = demoProject() as unknown as Record<string, unknown>;
    expect(p.playMode).toBe("song");
    delete p.playMode;
    const m = deserializeProject({ format: "rebeat-project", schemaVersion: 4, project: p });
    expect(m.playMode).toBe("song");
    const loop = deserializeProject(serializeProject({ ...demoProject(), playMode: "loop" }));
    expect(loop.playMode).toBe("loop");
  });
});

describe("migration 6 → 7: step tracks (D93, D94)", () => {
  const steps = (n = 4) => Array.from({ length: n }, () => ({ on: false }));
  const v6 = (tracks: object[], lanes: Record<string, object>, extra = {}) =>
    deserializeProject({
      format: "rebeat-project",
      schemaVersion: 6,
      project: { name: "t", bpm: 120, tracks, patterns: { p1: { id: "p1", lanes } }, ...extra },
    });
  const track = (id: string, kind: string, more = {}) => ({
    id,
    kind,
    name: id,
    category: "keys",
    params: {},
    effects: [],
    ...more,
  });

  it("turns track kinds into modes and sources into sounds", () => {
    const p = v6(
      [
        track("drum", "drum", { sampleId: "kit:909:kick" }),
        track("audio", "audio", { sampleId: "lib:loop" }),
        track("synth", "instrument", { instrument: { source: "synth", preset: "acid" } }),
        track("default", "instrument", { category: "bass" }),
        track("sampler", "instrument", {
          sampleId: "kit:909:kick",
          instrument: { source: "sampler", preset: "sampler", sampleId: "lib:a", rootNote: 48 },
        }),
        track("multi", "instrument", {
          instrument: {
            source: "sampler",
            preset: "sampler",
            name: "Mine",
            from: "user:x",
            zones: [{ note: 60, sampleId: "lib:c4" }],
          },
        }),
        track("piano", "instrument", { instrument: { source: "smplr", preset: "piano" } }),
        track("sf2", "instrument", {
          instrument: { source: "sf2", preset: "Flute", sampleId: "sf2:abc" },
        }),
      ],
      {
        drum: { kind: "steps", steps: steps() },
        audio: { kind: "clip", active: true, launchMode: "oneshot" },
      },
    );
    const by = (id: string) => p.tracks.find((t) => t.id === id)!;
    expect(by("drum")).toMatchObject({
      mode: "hits",
      sound: { source: "sample", sampleId: "kit:909:kick" },
    });
    expect(by("audio")).toMatchObject({
      mode: "clip",
      sound: { source: "sample", sampleId: "lib:loop" },
    });
    expect(by("synth")).toMatchObject({
      mode: "notes",
      sound: { source: "synth", preset: "acid" },
    });
    // without a source, instrument tracks played a bass or a pad
    expect(by("default").sound).toEqual({ source: "synth", preset: "acid" });
    // a sampler is a sample in Notes mode (the drum sample it had before is gone)
    expect(by("sampler").sound).toEqual({ source: "sample", sampleId: "lib:a", rootNote: 48 });
    expect(by("multi").sound).toEqual({
      source: "multi",
      name: "Mine",
      from: "user:x",
      zones: [{ note: 60, sampleId: "lib:c4" }],
    });
    expect(by("piano").sound).toEqual({ source: "smplr", preset: "piano" });
    expect(by("sf2").sound).toEqual({ source: "sf2", preset: "Flute", sampleId: "sf2:abc" });
    for (const t of p.tracks) {
      expect(t).not.toHaveProperty("kind");
      expect(t).not.toHaveProperty("sampleId");
      expect(t).not.toHaveProperty("instrument");
    }
    // every lane has steps; the clip lane keeps its settings beside them
    const lanes = p.patterns.p1.lanes;
    expect(lanes.audio.steps).toHaveLength(MAX_STEPS);
    expect(lanes.audio.clip).toEqual({ active: true, launchMode: "oneshot" });
    expect(lanes.drum).not.toHaveProperty("kind");
    expect(lanes.drum.clip).toBeUndefined();
  });

  it("renames the voices' ADSR decay in params, step locks and MIDI mappings", () => {
    const p = v6(
      [
        track("piano", "instrument", {
          instrument: { source: "smplr", preset: "piano" },
          params: { "sound.decay": 0.9 },
        }),
        track("drum", "drum", { sampleId: "kit:909:kick", params: { "sound.decay": 0.3 } }),
      ],
      {
        piano: { kind: "steps", steps: [{ on: true, locks: { "sound.decay": 0.2 } }] },
        drum: { kind: "steps", steps: [{ on: true, locks: { "sound.decay": 0.1 } }] },
      },
      {
        midiMappings: [
          {
            id: "m1",
            type: "cc",
            channel: 0,
            number: 1,
            device: "",
            label: "",
            target: "track:piano:sound.decay",
          },
          {
            id: "m2",
            type: "cc",
            channel: 0,
            number: 2,
            device: "",
            label: "",
            target: "track:drum:sound.decay",
          },
        ],
      },
    );
    const [piano, drum] = p.tracks;
    expect(piano.params["sound.envDecay"]).toBe(0.9);
    expect(piano.params).not.toHaveProperty("sound.decay");
    // a hit's decay keeps its name
    expect(drum.params["sound.decay"]).toBe(0.3);
    expect(p.patterns.p1.lanes.piano.steps[0].locks).toEqual({ "sound.envDecay": 0.2 });
    expect(p.patterns.p1.lanes.drum.steps[0].locks).toEqual({ "sound.decay": 0.1 });
    expect(p.midiMappings.map((m) => m.target)).toEqual([
      "track:piano:sound.envDecay",
      "track:drum:sound.decay",
    ]);
  });

  it.each([
    "example-night-drive",
    "example-blue-monday",
    "example-billie-jean",
    "example-planet-rock",
    "example-sweet-dreams",
    "example-neon-horizon",
    "example-late-night-cafe",
    "example-hyperdrive",
    "example-liquid-ladder",
    "example-around-the-world",
    "template-empty",
    "template-808",
    "template-loops",
  ])("loads %s as saved by version 6", (name) => {
    const saved = v6Project(name);
    const old = saved.project as unknown as {
      tracks: { id: string; kind: string; sampleId?: string; instrument?: { source: string } }[];
    };
    const p = deserializeProject(saved);
    expect(p.tracks.map((t) => t.id)).toEqual(old.tracks.map((t) => t.id));
    p.tracks.forEach((t, i) => {
      const was = old.tracks[i];
      expect(t.mode).toBe({ drum: "hits", instrument: "notes", audio: "clip" }[was.kind]);
      if (was.kind !== "instrument") expect(t.sound?.sampleId).toBe(was.sampleId);
      else
        expect(t.sound?.source).toBe(
          was.instrument?.source === "sampler" ? "sample" : (was.instrument?.source ?? "synth"),
        );
    });
    // a second trip changes nothing
    expect(deserializeProject(serializeProject(structuredClone(p)))).toEqual(p);
  });
});

describe("migration 10 → 11 (D196)", () => {
  it("turns a held point into an ease out of None", () => {
    const p = demoProject();
    const json = JSON.parse(JSON.stringify(serializeProject(p)));
    json.schemaVersion = 10;
    json.project.automation = [
      {
        id: "a",
        target: "master:volume",
        on: true,
        points: [
          { slotId: p.slots[0].id, at: 0, value: 0.5, hold: true },
          { slotId: p.slots[0].id, at: 1, value: 0.7, hold: false },
        ],
      },
    ];
    const d = deserializeProject(json);
    expect(d.automation![0].points).toEqual([
      { slotId: p.slots[0].id, at: 0, value: 0.5, out: { type: "none" } },
      { slotId: p.slots[0].id, at: 1, value: 0.7 },
    ]);
  });
});

describe("migration 11 → 12 (D229, D230)", () => {
  it("keeps what an old lane on an effect's On played, as points on its bands", () => {
    const p = demoProject();
    const kick = p.tracks.find((t) => t.name === "Kick")!;
    const fx = makeEffect("Tremolo");
    kick.effects.push(fx);
    const slotId = p.slots[0].id;
    const old = [
      { slotId, at: 0, value: 0 },
      { slotId, at: 4, value: 1, in: { type: "smooth" as const } },
      { slotId, at: 6, value: 0.2, out: { type: "none" as const } },
      { slotId, at: 7, value: 0.9 },
    ];
    const json = JSON.parse(JSON.stringify(serializeProject(p)));
    json.schemaVersion = 11;
    json.project.automation = [
      { id: "a", target: `track:${kick.id}:fx:${fx.id}:on`, on: true, points: old },
      { id: "b", target: `track:${kick.id}:mix.pan`, on: true, points: old },
    ];
    const d = deserializeProject(json);
    const stepped = d.automation![0];
    // every point on a band, no eases
    for (const pt of stepped.points) {
      expect([0, 1]).toContain(pt.value);
      expect(pt.in ?? pt.out).toBeUndefined();
    }
    // and it plays what the old lane did (rounded), away from the crossings
    const before = lanePoints(p, old);
    const after = lanePoints(d, stepped.points, 2);
    for (let q = 0.01; q < 8; q += 0.05)
      expect(curveAt(after, q), `at ${q}`).toBe(snapStep(curveAt(before, q)!, 2));
    // a smooth knob's lane stays as it was
    expect(d.automation![1].points).toEqual(old);
  });
});

describe("bends per note (D224)", () => {
  it("keeps a note's bend and drops one that isn't", () => {
    const p = demoProject();
    const lane = Object.values(p.patterns)[0].lanes[p.tracks.find((t) => t.mode === "notes")!.id];
    lane.steps[0] = {
      ...lane.steps[0],
      on: true,
      notes: [
        {
          pitch: 60,
          length: 1,
          velocity: 0.8,
          bend: { shape: "scoop", amount: -2, time: 0.1, delay: 0, unit: "s" },
        },
        { pitch: 64, length: 1, velocity: 0.8, bend: { shape: "wobble", amount: 1 } as never },
      ],
    };
    const d = deserializeProject(JSON.parse(JSON.stringify(serializeProject(p))));
    const notes = Object.values(d.patterns)[0].lanes[p.tracks.find((t) => t.mode === "notes")!.id]
      .steps[0].notes!;
    expect(notes[0].bend).toEqual({ shape: "scoop", amount: -2, time: 0.1, delay: 0, unit: "s" });
    expect(notes[1].bend).toBeUndefined();
  });

  it("loads a version 11 project unchanged", () => {
    const p = demoProject();
    const v11 = { ...JSON.parse(JSON.stringify(serializeProject(p))), schemaVersion: 11 };
    expect(deserializeProject(v11)).toEqual(p);
  });
});

describe("migration 12 → 13 (D257)", () => {
  it("loads a version 12 project unchanged; its synths' version 2 patches play as version 3", () => {
    const p = demoProject();
    const v12 = { ...JSON.parse(JSON.stringify(serializeProject(p))), schemaVersion: 12 };
    const synth = v12.project.tracks.find((t: Track) => t.sound?.source === "synth");
    synth.sound.patch = { ...makePatch({ osc: [{ shape: 1 }] }), version: 2 };
    delete synth.sound.patch.source;
    delete synth.sound.patch.physical;
    const d = deserializeProject(v12);
    expect(d.tracks.length).toBe(p.tracks.length);
    const patch = patchOf(d.tracks.find((t) => t.id === synth.id)!.sound!);
    expect(patch.version).toBe(3);
    expect(patch.source).toBe("oscillators");
    expect(patch.osc[0]).toMatchObject({ type: "analog", shape: 1 });
  });
});

describe("migration 9 → 10 (D182)", () => {
  it("loads a version 9 project unchanged", () => {
    const p = demoProject();
    const v9 = { ...JSON.parse(JSON.stringify(serializeProject(p))), schemaVersion: 9 };
    expect(deserializeProject(v9)).toEqual(p);
  });

  it("drops anchors without their section and lists the regions' samples", () => {
    const p = demoProject();
    const slot = p.slots[0].id;
    p.tempo = [
      { slotId: slot, at: 0, bpm: 999 },
      { slotId: "gone", at: 0, bpm: 90 },
    ];
    p.regions = [
      {
        id: "r",
        trackId: p.tracks[0].id,
        sampleId: "abc",
        start: { slotId: slot, at: 0 },
        length: 4,
        offset: 0,
      },
    ];
    p.slots[0].transpose = 30;
    p.slots[0].mutes = ["nobody"];
    const d = deserializeProject(JSON.parse(JSON.stringify(serializeProject(p))));
    expect(d.tempo).toEqual([{ slotId: slot, at: 0, bpm: 300 }]);
    expect(d.slots[0].transpose).toBe(12);
    expect(d.slots[0].mutes).toBeUndefined();
    expect(projectSampleIds(d)).toContain("abc");
  });
});

describe("migration 7 → 8", () => {
  it("marks the old MIDI mappings absolute (D120)", () => {
    const p = demoProject();
    const saved = JSON.parse(JSON.stringify(serializeProject(p)));
    saved.schemaVersion = 7;
    saved.project.midiMappings = [
      {
        id: "m",
        type: "cc",
        channel: 0,
        number: 74,
        device: "",
        target: "master:volume",
        label: "Master",
      },
    ];
    const back = deserializeProject(saved);
    expect(back.midiMappings[0].mode).toBe("absolute");
  });
});
