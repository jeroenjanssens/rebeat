import { describe, expect, it } from "vitest";
import { isAutomatable } from "../model/automation";
import { deserializeProject, serializeProject } from "../model/schema";
import { pixelPulse } from "./pixelPulse";

describe("Pixel Pulse (D292)", () => {
  const p = pixelPulse();
  const bends = (name: string) => {
    const t = p.tracks.find((x) => x.name === name)!;
    const shapes = new Set<string>();
    for (const pt of Object.values(p.patterns))
      for (const st of pt.lanes[t.id].steps)
        for (const n of st.notes ?? []) if (n.bend) shapes.add(n.bend.shape);
    return [...shapes].sort();
  };

  it("arpeggiates with Arp bends, bends a sample, and the lead's vibrato, glides and slide", () => {
    expect(bends("Arp")).toEqual(["arp"]);
    const bass = p.tracks.find((t) => t.name === "808 Bass")!;
    expect(bass.sound).toMatchObject({ source: "sample", sampleId: "kit:808:kick" });
    expect(bends("808 Bass")).toEqual(["fall", "rise", "scoop"]);
    expect(bends("Lead")).toEqual(["rise", "scoop", "shake"]);
  });

  it("automates pan and level, all of it automatable", () => {
    const targets = p.automation!.map((l) => l.target.replace(/track:[^:]+:/, ""));
    expect(targets.sort()).toEqual(["master:volume", "mix.pan", "volume"]);
    for (const lane of p.automation!) expect(isAutomatable(p, lane.target), lane.target).toBe(true);
  });

  it("survives saving and loading", () => {
    const back = deserializeProject(JSON.parse(JSON.stringify(serializeProject(p))));
    expect(back.tracks.length).toBe(p.tracks.length);
    expect(back.automation?.length).toBe(3);
  });
});
