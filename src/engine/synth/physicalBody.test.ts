/**
 * P1.14: body arrays are sized from the data, not a hardcoded constant. Verify that every entry
 * in BODY_MODES fits within the size that PhysVoice allocates.
 */
import { describe, expect, it } from "vitest";
import { BODY_MODES } from "./modal";

describe("BODY_MODES fits within PhysVoice biquad arrays (P1.14)", () => {
  const maxModes = Math.max(...Object.values(BODY_MODES).map((m) => m.length));

  it("every body has at most maxModes biquads (no out-of-bounds writes)", () => {
    for (const [name, modes] of Object.entries(BODY_MODES)) {
      expect(modes.length, `${name}.length ≤ ${maxModes}`).toBeLessThanOrEqual(maxModes);
    }
  });

  it("the largest body fills exactly maxModes slots (no wasted allocation)", () => {
    const largest = Object.values(BODY_MODES).reduce((a, b) => (b.length > a.length ? b : a));
    expect(largest.length).toBe(maxModes);
  });
});
