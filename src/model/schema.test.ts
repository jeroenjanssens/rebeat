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
