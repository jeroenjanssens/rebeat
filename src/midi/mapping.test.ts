import { describe, expect, it } from "vitest";
import type { MidiMapping } from "../model/project";
import { emptyProject, hitsTrack } from "../templates/builder";
import {
  CONTROLLER_MAPS,
  detectController,
  mapById,
  mappingsOf,
  missingSlots,
  correctedSlots,
  slotKind,
} from "./controllers";
import {
  detectMode,
  findMapping,
  pickedUp,
  readTarget,
  relativeDelta,
  resolveTarget,
  routeNote,
  walksLikeAbsolute,
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

  it("adds the slots a map gained to mappings saved before, keeping learned ones", () => {
    const map = mapById("minilab3")!;
    let n = 0;
    // saved before the encoder, its click and Shift were in the map; knob 1 learned again
    const old = mappingsOf(map, () => `old${n++}`)
      .filter((m) => !["encoder", "encoder-click", "encoder-shift", "shift"].includes(m.slot!))
      .map((m) => (m.slot === "knob1" ? { ...m, number: 99 } : m));
    const added = missingSlots(map, old, () => `new${n++}`);
    expect(added.map((m) => m.slot).sort()).toEqual([
      "encoder",
      "encoder-click",
      "encoder-shift",
      "shift",
    ]);
    expect(added.find((m) => m.slot === "encoder")).toMatchObject({ number: 114, mode: "rel64" });
    expect(missingSlots(map, [...old, ...added], () => "x")).toEqual([]);
  });

  it("corrects a slot's number the map has fixed, keeping one you learned", () => {
    const map = mapById("minilab3")!;
    let n = 0;
    const saved = mappingsOf(map, () => `id${n++}`).map((m) =>
      m.slot === "encoder" ? { ...m, number: 28 } : m.slot === "knob1" ? { ...m, number: 99 } : m,
    );
    const fixed = correctedSlots(map, saved);
    expect(fixed.find((m) => m.slot === "encoder")!.number).toBe(114);
    expect(fixed.find((m) => m.slot === "knob1")!.number).toBe(99);
    // untouched mappings stay the same objects
    expect(fixed.filter((m, i) => m !== saved[i])).toHaveLength(1);
    // learned again on another CC: kept
    const learned = saved.map((m) => (m.slot === "encoder" ? { ...m, number: 20 } : m));
    expect(correctedSlots(map, learned).find((m) => m.slot === "encoder")!.number).toBe(20);
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

describe("slotKind (D129)", () => {
  it("derives kind from slot ids", () => {
    expect(slotKind("fader1")).toBe("fader");
    expect(slotKind("fader4")).toBe("fader");
    expect(slotKind("knob1")).toBe("knob");
    expect(slotKind("knob8")).toBe("knob");
    expect(slotKind("encoder")).toBe("encoder");
    expect(slotKind("encoder-click")).toBe("button");
    expect(slotKind("shift")).toBe("button");
    expect(slotKind("play")).toBe("button");
    expect(slotKind("pad1")).toBe("pad");
  });

  it("MiniLab 3 faders are fader kind", () => {
    const map = mapById("minilab3")!;
    const faders = map.slots.filter((s) => s.slot.startsWith("fader"));
    expect(faders).toHaveLength(4);
    for (const s of faders) expect(slotKind(s.slot)).toBe("fader");
  });

  it("MiniLab 3 main encoder and click are encoder/button kind", () => {
    const map = mapById("minilab3")!;
    expect(slotKind(map.slots.find((s) => s.slot === "encoder")!.slot)).toBe("encoder");
    expect(slotKind(map.slots.find((s) => s.slot === "encoder-click")!.slot)).toBe("button");
  });
});

describe("detectMode — fader protection (D129)", () => {
  // D129: faders are never fed to detectMode (midi.ts checks slotKind first), so the function
  // itself is unchanged from D120. These tests confirm the boundary cases.

  it("a sweep through 64 stays absolute (64 is not a rel64 code)", () => {
    // A fader passing through the center includes 64; the no-64 check keeps it absolute.
    expect(detectMode([60, 60, 62, 64, 66, 68])).not.toBe("rel64");
    expect(detectMode([57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71])).toBe(
      "absolute",
    );
  });

  it("a real encoder near 64 with one repeat is still detected correctly", () => {
    // [63, 63, 62]: one repeat, all in rel64 range, no 64 → rel64
    expect(detectMode([63, 63, 62])).toBe("rel64");
    expect(detectMode([65, 65, 66])).toBe("rel64");
  });

  it("rel2c and relsign are unaffected", () => {
    expect(detectMode([127, 127, 126, 1, 1])).toBe("rel2c");
    expect(detectMode([65, 65, 66, 2, 2])).toBe("relsign");
  });
});

describe("detectMode — absolute knobs aren't taken for relative (D141)", () => {
  it("an absolute knob turned slowly, with a repeat or a wiggle, stays absolute", () => {
    expect(detectMode([66, 67, 67, 68, 69, 70])).toBe("absolute");
    expect(detectMode([66, 66, 67, 67, 68, 68])).toBe("absolute");
    expect(detectMode([70, 69, 69, 70, 71, 72])).toBe("absolute");
    expect(detectMode([71, 70, 70, 69])).toBe("absolute");
  });

  it("an absolute knob at its end isn't two's complement", () => {
    expect(detectMode([118, 121, 124, 127, 127, 127])).toBe("absolute");
    expect(detectMode([124, 127, 127, 127, 127, 127])).toBe("absolute");
    expect(detectMode([127, 127, 127, 127])).toBe("absolute");
  });

  it("relative knobs turned slowly are still found", () => {
    expect(detectMode([65, 65, 65, 65])).toBe("rel64");
    expect(detectMode([63, 63, 63, 62, 63, 63])).toBe("rel64");
    expect(detectMode([1, 1, 1, 1])).toBe("rel2c");
    expect(detectMode([127, 127, 127, 126])).toBe("rel2c");
    expect(detectMode([65, 65, 65, 1, 1])).toBe("relsign");
  });

  it("a knob taken for relative walks like an absolute one", () => {
    expect(walksLikeAbsolute([66, 67, 68, 69, 70, 71])).toBe(true);
    expect(walksLikeAbsolute([90, 85, 80, 76, 70, 66])).toBe(true);
    expect(walksLikeAbsolute([65, 65, 65, 65, 65, 65])).toBe(false);
    expect(walksLikeAbsolute([65, 66, 65, 66, 67, 65])).toBe(false);
    expect(walksLikeAbsolute([66, 67, 68])).toBe(false);
  });
});

describe("MiniLab 3 map — new encoder slots", () => {
  const minilab = mapById("minilab3")!;

  it("has the main encoder on CC 114 (formerly 28) with rel64 and browse:sound target", () => {
    const enc = minilab.slots.find((s) => s.slot === "encoder");
    expect(enc).toBeDefined();
    expect(enc?.number).toBe(114);
    expect(enc?.formerly).toEqual([28]);
    expect(enc?.mode).toBe("rel64");
    expect(enc?.target).toBe("browse:sound");
    expect(enc?.kind).toBe("encoder");
  });

  it("has Shift + turn on its own CC 112, browsing by section", () => {
    const enc = minilab.slots.find((s) => s.slot === "encoder-shift");
    expect(enc).toMatchObject({ number: 112, mode: "rel64", target: "browse:section" });
  });

  it("has the encoder click on CC 115 targeting keys.add-track", () => {
    const click = minilab.slots.find((s) => s.slot === "encoder-click");
    expect(click).toBeDefined();
    expect(click?.number).toBe(115);
    expect(click?.target).toBe("command:keys.add-track");
    expect(click?.kind).toBe("button");
  });

  it("has the Shift button on CC 9 targeting modifier:shift", () => {
    const shift = minilab.slots.find((s) => s.slot === "shift");
    expect(shift).toBeDefined();
    expect(shift?.number).toBe(9);
    expect(shift?.target).toBe("modifier:shift");
    expect(shift?.kind).toBe("button");
  });
});
