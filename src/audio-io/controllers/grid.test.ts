import { describe, expect, it } from "vitest";
import { demoProject } from "../../templates/nightDrive";
import { slotPattern } from "../../model/project";
import { DEVICES, detectDevice, relative } from "./devices";
import { gridColors, padTarget } from "./grid";

describe("grid controllers", () => {
  const p = demoProject();
  const pattern = slotPattern(p, "slot-verse");

  it("lights steps in track colors and the playhead in white", () => {
    const colors = gridColors(p, pattern, { trackOffset: 0, stepOffset: 0 }, 4);
    // the kick (red) plays on step 0 of the verse
    expect(colors[0][0][0]).toBeGreaterThan(colors[0][0][2]);
    expect(colors[0][4]).toEqual([255, 255, 255]);
    expect(colors[0][1][0]).toBeLessThan(40);
  });

  it("lights a Clip track's row while its clip plays on the page", () => {
    const vox = p.tracks.findIndex((t) => t.mode === "clip");
    const view = { trackOffset: vox - 7, stepOffset: 0 };
    const on = gridColors(p, pattern, view, null)[7];
    // the verse plays the vocal clip: the whole row in its color
    expect(new Set(on.map((c) => c.join()))).toHaveProperty("size", 1);
    expect(Math.max(...on[0])).toBeGreaterThan(60);
    const intro = slotPattern(p, p.slots[0].id);
    expect(Math.max(...gridColors(p, intro, view, null)[7][0])).toBeLessThan(20);
  });

  it("maps pad presses to tracks and steps", () => {
    expect(padTarget(p, { trackOffset: 1, stepOffset: 8 }, 0, 3)).toEqual({
      trackId: p.tracks[1].id,
      step: 11,
    });
  });

  it("finds devices by port name and encodes Launchpad pads", () => {
    const lp = detectDevice("Launchpad Mini MK3 LPMiniMK3 MIDI In")!;
    expect(lp.id).toBe("launchpad-mini");
    expect(lp.pad(11)).toEqual({ row: 7, col: 0 });
    expect(lp.pad(88)).toEqual({ row: 0, col: 7 });
    const msg = lp.lights(
      Array.from({ length: 8 }, () =>
        Array.from({ length: 8 }, () => [255, 0, 0] as [number, number, number]),
      ),
    )[0];
    expect(msg.slice(0, 7)).toEqual([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0d, 0x03]);
    expect(msg.length).toBe(7 + 64 * 5 + 1);
  });

  it("encodes Push pads and relative encoders", () => {
    const push = DEVICES.find((d) => d.id === "push2")!;
    expect(push.pad(36)).toEqual({ row: 7, col: 0 });
    expect(push.pad(99)).toEqual({ row: 0, col: 7 });
    expect(relative(1)).toBe(1);
    expect(relative(127)).toBe(-1);
  });
});
