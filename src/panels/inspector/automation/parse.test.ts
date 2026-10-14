import { describe, expect, it } from "vitest";
import { EFFECT_PARAMS, MIX_PARAMS, SOUND_PARAMS } from "../../../model/params";
import { FX_ON } from "../../../model/automation";
import { emptyProject, page } from "../../../templates/builder";
import { formatInSection, formatPosition, numberIn, parsePosition, parseValue } from "./parse";

const def = (id: string) =>
  [...MIX_PARAMS, ...Object.values(SOUND_PARAMS).flat()].find((d) => d.id === id)!;

describe("positions (D204)", () => {
  // two bars × 2, then a 2-beat section
  const p = emptyProject("P", 120);
  page(p, "A", 32, 2);
  page(p, "Stop", 8, 1);

  it("formats bar.beat.16th, with a fraction of a 16th", () => {
    expect(formatPosition(p, 0)).toBe("1.1.1");
    expect(formatPosition(p, 5.25)).toBe("2.2.2");
    expect(formatPosition(p, 5.375)).toBe("2.2.2.5");
    expect(formatInSection(p, 16.5)).toBe("2 Stop · 1.3");
  });

  it("reads them back, and section:beat.16th", () => {
    for (const q of [0, 5.25, 5.375, 13.75, 17])
      expect(parsePosition(p, formatPosition(p, q))).toBeCloseTo(q);
    expect(parsePosition(p, "2:1.3")).toBeCloseTo(16.5);
    expect(parsePosition(p, "1:5.1")).toBeCloseTo(4);
    expect(parsePosition(p, "nonsense")).toBeNull();
  });
});

describe("values (D204)", () => {
  it("reads numbers in a knob's units", () => {
    expect(numberIn("1.2k")).toBe(1200);
    expect(numberIn("L20")).toBe(-20);
    expect(numberIn("1.50s")).toBe(1500);
    expect(numberIn("-6.0")).toBe(-6);
  });

  it("finds the knob position for a typed value, through the knob's own format", () => {
    for (const [id, v] of [
      ["cutoff", 0.37],
      ["pan", 0.2],
      ["low", 0.81],
      ["volume", 0.66],
    ] as const) {
      const d = def(id);
      const back = parseValue(d, d.format(v))!;
      expect(d.format(back)).toBe(d.format(v));
    }
    expect(parseValue(def("cutoff"), "50%")).toBe(0.5);
    expect(parseValue(def("pan"), "R100")).toBe(1);
    expect(parseValue(def("pan"), "huh")).toBeNull();
  });
});

describe("stepped values (D229)", () => {
  it("picks a value by its name, or a number on its band", () => {
    const on = FX_ON;
    expect(parseValue(on, "on")).toBe(1);
    expect(parseValue(on, "Off")).toBe(0);
    const type = EFFECT_PARAMS.Filter.find((d) => d.id === "type")!;
    const names = Array.from({ length: type.steps! }, (_, i) => type.format(i / (type.steps! - 1)));
    expect(parseValue(type, names[1])).toBeCloseTo(1 / (type.steps! - 1));
  });
});
