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
