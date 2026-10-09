import { describe, expect, it } from "vitest";
import { CATALOG, FAMILIES, catalogId, gmName } from "./instruments";

describe("instrument catalog", () => {
  it("has unique ids that match the sources", () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CATALOG) expect(catalogId(c.source)).toBe(c.id);
  });

  it("fills every built-in family, with a license for each collection", () => {
    for (const f of FAMILIES.filter((f) => f !== "Your sounds"))
      expect(
        CATALOG.some((c) => c.family === f),
        f,
      ).toBe(true);
    for (const c of CATALOG) expect(c.collection.license, c.id).toBeTruthy();
    // 37 synths, 5 pianos, 128 GM, 14 mallets, 156 VCSL, 3 double basses
    expect(CATALOG.length).toBeGreaterThan(300);
  });

  it("keeps the instruments existing projects use", () => {
    for (const p of [
      "piano",
      "epiano:CP80",
      "epiano:WurlitzerEP200",
      "sf:string_ensemble_1",
      "sf:flute",
    ])
      expect(CATALOG.some((c) => c.source.preset === p)).toBe(true);
  });

  it("names General MIDI instruments readably and groups them by program", () => {
    expect(gmName("acoustic_grand_piano")).toBe("Acoustic Grand Piano");
    expect(gmName("lead_8_bass__lead")).toBe("Lead 8 (Bass + Lead)");
    expect(gmName("honkytonk_piano")).toBe("Honky-tonk Piano");
    const trumpet = CATALOG.find((c) => c.id === "smplr:sf:trumpet")!;
    expect(trumpet.group).toBe("Brass");
    expect(CATALOG.find((c) => c.id === "smplr:sf:acoustic_bass")!.low).toBe(true);
  });
});
