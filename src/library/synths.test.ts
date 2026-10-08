import { describe, expect, it } from "vitest";
import { sanitizePatch } from "../model/synth";
import { FACTORY_SYNTHS } from "./synths";

describe("factory synths", () => {
  it("have unique ids and names, and the original ten presets", () => {
    const ids = FACTORY_SYNTHS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(FACTORY_SYNTHS.map((s) => s.name)).size).toBe(ids.length);
    for (const id of [
      "warm-pad",
      "keys",
      "pluck",
      "init",
      "acid",
      "sub",
      "lead",
      "fm-epiano",
      "fm-bell",
      "am-organ",
    ])
      expect(ids).toContain(id);
    expect(FACTORY_SYNTHS.length).toBeGreaterThanOrEqual(30);
  });

  it("are within the ranges the engine expects", () => {
    for (const s of FACTORY_SYNTHS) expect(sanitizePatch(s.patch), s.id).toEqual(s.patch);
  });

  it("cover every group", () => {
    const groups = new Set(FACTORY_SYNTHS.map((s) => s.group));
    expect([...groups].sort()).toEqual(["Bass", "FX", "Keys", "Leads", "Pads", "Plucks & stabs"]);
  });
});
