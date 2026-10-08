import { describe, expect, it } from "vitest";
import {
  kitDefaults,
  kitSoundList,
  searchSounds,
  soundFile,
  soundLabel,
  soundName,
  type OnlineKit,
} from "./onlineKits";

const base = "https://example.com/machines/";
const kits: OnlineKit[] = [
  {
    machine: "RolandTR808",
    sounds: {
      hh: [`${base}RolandTR808/rolandtr808-hh/Hat%20Closed.wav`],
      bd: [
        `${base}RolandTR808/rolandtr808-bd/BD0000.wav`,
        `${base}RolandTR808/rolandtr808-bd/BD0010.wav`,
      ],
      cb: [`${base}RolandTR808/rolandtr808-cb/Cowbell.wav`],
    },
  },
  {
    machine: "LinnDrum",
    sounds: {
      sd: [`${base}LinnDrum/linndrum-sd/Snarepop.wav`],
      oh: [`${base}LinnDrum/linndrum-oh/Open.wav`],
    },
  },
];

describe("online kits", () => {
  it("lists sounds in kit order with names and file names", () => {
    const list = kitSoundList(kits[0]);
    expect(list.map(soundLabel)).toEqual(["Kick 1", "Kick 2", "Cl Hat", "Cowbell"]);
    expect(soundName(list[2])).toBe("Roland TR808 Cl Hat");
    expect(soundFile(list[2])).toBe("Hat Closed.wav");
    expect(kitDefaults(kits[0]).map(soundLabel)).toEqual(["Kick 1", "Cl Hat", "Cowbell"]);
  });

  it("finds sounds by type, synonym, machine and file name", () => {
    const labels = (q: string) => searchSounds(kits, q).map((s) => `${s.machine} ${soundLabel(s)}`);
    // hats on both machines, closed and open
    expect(labels("hat")).toEqual(["RolandTR808 Cl Hat", "LinnDrum Op Hat"]);
    expect(labels("hihat")).toHaveLength(2);
    expect(labels("808 kick")).toEqual(["RolandTR808 Kick 1", "RolandTR808 Kick 2"]);
    expect(labels("snarepop")).toEqual(["LinnDrum Snare"]);
    expect(labels("linn open")).toEqual(["LinnDrum Op Hat"]);
    expect(labels("")).toEqual([]);
    expect(labels("tambourine")).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(searchSounds(kits, "o", 2)).toHaveLength(2);
  });
});
