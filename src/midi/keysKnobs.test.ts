import { describe, expect, it } from "vitest";
import { KEYS_KNOBS, KEYS_KNOBS_BY_SLOT } from "./keysKnobs";
import { knobZone } from "./mapping";

describe("KEYS_KNOBS zone math (D140, D142, D148)", () => {
  it("every slot has an entry in KEYS_KNOBS_BY_SLOT", () => {
    for (const k of KEYS_KNOBS) {
      expect(KEYS_KNOBS_BY_SLOT[k.slot]).toBe(k);
    }
  });

  it("every knob covers the full CC range: zone 0 at CC=0, last zone at CC=127", () => {
    for (const { slot, values } of KEYS_KNOBS) {
      expect(knobZone(0, values), `${slot}: CC=0 should map to zone 0`).toBe(0);
      expect(knobZone(127, values), `${slot}: CC=127 should map to last zone`).toBe(values - 1);
    }
  });

  it("zones are equal-width: adjacent CCs map to at most two different zones", () => {
    for (const { slot, values } of KEYS_KNOBS) {
      for (let cc = 1; cc < 128; cc++) {
        const prev = knobZone(cc - 1, values);
        const curr = knobZone(cc, values);
        expect(curr - prev, `${slot} CC${cc}: zone must not decrease`).toBeGreaterThanOrEqual(0);
        expect(curr - prev, `${slot} CC${cc}: zone must increase by at most 1`).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });

  it("every zone is reachable from some CC value", () => {
    for (const { slot, values } of KEYS_KNOBS) {
      const reached = new Set<number>();
      for (let cc = 0; cc < 128; cc++) reached.add(knobZone(cc, values));
      expect(reached.size, `${slot}: all ${values} zones must be reachable`).toBe(values);
    }
  });
});
