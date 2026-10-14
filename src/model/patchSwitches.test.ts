import { describe, expect, it } from "vitest";
import { makePatch } from "./synth";
import { optionLabels, sourceName, switchDef, switchOf } from "./patchSwitches";

describe("the matrix's sources name the macros as the patch does", () => {
  const p = makePatch({});

  it("by their names, or their number when a macro has none", () => {
    expect(sourceName("macro1", p)).toBe("Brightness");
    expect(sourceName("macro7", p)).toBe("Movement");
    expect(sourceName("lfo1", p)).toBe("LFO 1");
    const unnamed = JSON.parse(JSON.stringify(p));
    unnamed.macros[2].name = " ";
    expect(sourceName("macro3", unnamed)).toBe("Macro 3");
    expect(sourceName(null, p, "always")).toBe("always");
  });

  it("in the menus and in a lane's values", () => {
    expect(optionLabels("matrix.0.source", p)?.("macro2", "Macro 2")).toBe("Bite");
    expect(optionLabels("lfos.0.shape", p)).toBeUndefined();
    const sw = switchOf("matrix.3.via")!;
    const def = switchDef(sw, null, p);
    const i = sw.options.findIndex((o) => o.value === "macro8");
    expect(def.format(i / (sw.options.length - 1))).toBe("Drive");
  });
});
