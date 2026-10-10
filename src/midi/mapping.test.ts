import { describe, expect, it } from "vitest";
import type { MidiMapping } from "../model/project";
import { emptyProject, hitsTrack } from "../templates/builder";
import { CONTROLLER_MAPS, detectController, mappingsOf } from "./controllers";
import {
  detectMode,
  findMapping,
  pickedUp,
  readTarget,
  relativeDelta,
  resolveTarget,
  routeNote,
  withMapping,
  ROLES,
} from "./mapping";

describe("relative encoders (D120)", () => {
  it("decodes the three encodings", () => {
    expect(relativeDelta("rel64", 65)).toBe(1);
    expect(relativeDelta("rel64", 61)).toBe(-3);
    expect(relativeDelta("rel2c", 1)).toBe(1);
    expect(relativeDelta("rel2c", 127)).toBe(-1);
    expect(relativeDelta("rel2c", 124)).toBe(-4);
    expect(relativeDelta("relsign", 2)).toBe(2);
    expect(relativeDelta("relsign", 65)).toBe(-1);
    expect(relativeDelta("absolute", 100)).toBe(0);
  });

  it("tells absolute from relative by the first messages", () => {
    expect(detectMode([10, 11, 12, 13])).toBe("absolute");
    expect(detectMode([62, 63, 64, 65])).toBe("absolute"); // a fader passing the middle
    expect(detectMode([65, 65, 65])).toBe("rel64");
    expect(detectMode([63, 63, 62])).toBe("rel64");
    expect(detectMode([1, 1, 2])).toBe("rel2c");
    expect(detectMode([127, 127, 126])).toBe("rel2c");
    expect(detectMode([65, 65, 66])).toBe("rel64");
    expect(detectMode([1, 1, 65, 65])).toBe("relsign");
    expect(detectMode([40])).toBeNull();
  });
});

describe("roles and targets (D121)", () => {
  const project = emptyProject("t", 120);
  const kick = hitsTrack("Kick", "kit:808:kick", "808 Kick", "kick");
  const snare = hitsTrack("Snare", "kit:808:snare", "808 Snare", "snare");
  project.tracks.push(kick, snare);
  const ctx = (selected: string | null) => ({
    project,
    selectedTrackId: selected,
    soundIds: () => ["tune", "decay", "start"],
  });

  it("resolves the selected track's knobs, volume and sends, and tracks by position", () => {
    expect(resolveTarget(ROLES.selectedSound(1), ctx(snare.id))).toBe(
      `track:${snare.id}:sound.tune`,
    );
    expect(resolveTarget(ROLES.selectedSound(3), ctx(kick.id))).toBe(
      `track:${kick.id}:sound.start`,
    );
    expect(resolveTarget(ROLES.selectedSound(4), ctx(kick.id))).toBeNull();
    expect(resolveTarget(ROLES.selectedVolume, ctx(kick.id))).toBe(`track:${kick.id}:volume`);
    expect(resolveTarget(ROLES.selectedMix("sendA"), ctx(kick.id))).toBe(
      `track:${kick.id}:mix.sendA`,
    );
    expect(resolveTarget(ROLES.selectedVolume, ctx(null))).toBeNull();
    expect(resolveTarget(ROLES.trackVolume(2), ctx(null))).toBe(`track:${snare.id}:volume`);
    expect(resolveTarget(ROLES.trackVolume(3), ctx(null))).toBeNull();
    expect(resolveTarget("master:volume", ctx(null))).toBe("master:volume");
  });

  it("reads a target's value back", () => {
    kick.params["sound.tune"] = 0.3;
    expect(readTarget(`track:${kick.id}:sound.tune`, project)).toBe(0.3);
    expect(readTarget(`track:${kick.id}:volume`, project)).toBe(0.8);
    expect(readTarget("master:volume", project)).toBe(project.master.volume);
    expect(readTarget("perf:filter", project)).toBeNull();
  });
});

describe("mappings", () => {
  const m = (over: Partial<MidiMapping>): MidiMapping => ({
    id: "x",
    type: "cc",
    channel: 0,
    number: 74,
    device: "",
    target: "master:volume",
    label: "L",
    ...over,
  });

  it("this project's mappings win over global ones", () => {
    const x = { kind: "cc" as const, channel: 0, number: 74, device: "MiniLab3 MIDI" };
    const global = [m({ id: "g", target: ROLES.selectedSound(1) })];
    expect(findMapping(x, [], global)?.scope).toBe("global");
    expect(findMapping(x, [m({ id: "p" })], global)?.mapping.id).toBe("p");
    expect(findMapping({ ...x, number: 75 }, [], global)).toBeNull();
    // learned on another device: not this one
    expect(findMapping(x, [m({ device: "Other" })], [])).toBeNull();
  });

  it("a new mapping replaces the old one for its target and its control", () => {
    const list = [m({ id: "a", target: "t1", number: 1 }), m({ id: "b", target: "t2", number: 2 })];
    const next = withMapping(list, m({ id: "c", target: "t1", number: 2 }));
    expect(next.map((x) => x.id)).toEqual(["c"]);
  });
});

describe("notes by channel (D119)", () => {
  it("pads on their channel play tracks by position, whatever is selected", () => {
    expect(routeNote(9, 36, 9, true)).toEqual({ to: "pad", index: 0 });
    expect(routeNote(9, 51, 9, true)).toEqual({ to: "pad", index: 15 });
    expect(routeNote(0, 60, 9, true)).toEqual({ to: "notes" });
    expect(routeNote(0, 37, 9, false)).toEqual({ to: "pad", index: 1 });
    expect(routeNote(0, 37, "off", true)).toEqual({ to: "notes" });
    expect(routeNote(3, 40, "any", true)).toEqual({ to: "pad", index: 4 });
    expect(routeNote(9, 30, 9, true)).toBeNull();
  });
});

describe("pickup (D120)", () => {
  it("waits until the control reaches the value", () => {
    expect(pickedUp(undefined, 0.2, 0.7)).toBe(false);
    expect(pickedUp(0.2, 0.4, 0.7)).toBe(false);
    expect(pickedUp(0.6, 0.75, 0.7)).toBe(true);
    expect(pickedUp(undefined, 0.71, 0.7)).toBe(true);
  });
});

describe("controller maps (D124)", () => {
  it("every map has unique slots and controls, and becomes global mappings", () => {
    for (const map of CONTROLLER_MAPS) {
      expect(new Set(map.slots.map((s) => s.slot)).size).toBe(map.slots.length);
      const controls = map.slots
        .filter((s) => s.number !== null)
        .map((s) => `${s.type}:${s.channel}:${s.number}`);
      expect(new Set(controls).size).toBe(controls.length);
      let n = 0;
      const ms = mappingsOf(map, () => `id${n++}`);
      expect(ms).toHaveLength(map.slots.filter((x) => x.number !== null).length);
      expect(ms.every((x) => x.slot && x.label.startsWith(map.name))).toBe(true);
    }
  });

  it("knows a MiniLab 3 by its ports", () => {
    expect(detectController(["MiniLab3 MIDI", "MiniLab3 MCU"])?.id).toBe("minilab3");
    expect(detectController(["IAC Driver Bus 1"])).toBeUndefined();
    expect(detectController(["MPK mini 3"])?.id).toBe("mpkmini3");
    expect(detectController(["Launchkey Mini MK3 MIDI Port"])?.id).toBe("launchkeymini3");
    expect(detectController(["Launchkey Mini MIDI IN1"])?.id).toBe("launchkeymini3");
    expect(detectController(["Launchkey Mini 25 MK4"])?.id).toBe("launchkeymini4");
    expect(detectController(["Launchkey Mini 25 MK4 DAW Out"])?.id).toBe("launchkeymini4");
  });
});
