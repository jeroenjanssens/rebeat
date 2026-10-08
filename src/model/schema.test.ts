import { describe, expect, it } from "vitest";
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
    if (lane.kind === "steps") lane.steps = lane.steps.slice(0, 4);
    p.slots.push({ id: "x", patternId: "missing", repeats: 1 });
    const fixed = deserializeProject(JSON.parse(JSON.stringify(serializeProject(p))));
    const fp = fixed.patterns[pattern.id];
    expect(fp.lanes[p.tracks[0].id]).toBeDefined();
    const l1 = fp.lanes[p.tracks[1].id];
    expect(l1.kind === "steps" && l1.steps.length).toBe(MAX_STEPS);
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
    const p = demoProject();
    const json = JSON.parse(JSON.stringify(p));
    const pattern = Object.values(
      json.patterns as Record<
        string,
        { lanes: Record<string, { kind: string; steps: Record<string, unknown>[] }> }
      >,
    )[1];
    const bassLane = pattern.lanes[p.tracks[6].id];
    bassLane.steps[4] = {
      ...bassLane.steps[4],
      notes: [39],
      length: 2,
      slide: true,
      velocity: 0.7,
    };
    const m = deserializeProject({ format: "rebeat-project", schemaVersion: 2, project: json });
    const lane = Object.values(m.patterns)[1].lanes[p.tracks[6].id];
    expect(lane.kind === "steps" && lane.steps[4].notes).toEqual([
      { pitch: 39, length: 2, velocity: 0.7, slide: true },
    ]);
    expect(lane.kind === "steps" && "length" in lane.steps[4]).toBe(false);
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
