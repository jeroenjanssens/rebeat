import { describe, expect, it } from "vitest";
import { sortLabel, sortSamples } from "./sort";

const s = (name: string, duration: number, createdAt: number) => ({ name, duration, createdAt });
const list = [s("Kick 10", 0.5, 3), s("snare", 0.2, 1), s("Kick 2", 2, 2), s("Atmo", 9, 0)];
const names = (l: { name: string }[]) => l.map((x) => x.name);

describe("sorting samples", () => {
  it("sorts by name naturally, ignoring case", () => {
    expect(names(sortSamples(list, { by: "name", dir: "asc" }))).toEqual([
      "Atmo",
      "Kick 2",
      "Kick 10",
      "snare",
    ]);
    expect(names(sortSamples(list, { by: "name", dir: "desc" }))[0]).toBe("snare");
  });

  it("sorts by duration and by date in both directions", () => {
    expect(names(sortSamples(list, { by: "duration", dir: "asc" }))).toEqual([
      "snare",
      "Kick 10",
      "Kick 2",
      "Atmo",
    ]);
    expect(names(sortSamples(list, { by: "duration", dir: "desc" }))[0]).toBe("Atmo");
    expect(names(sortSamples(list, { by: "recent", dir: "desc" }))[0]).toBe("Kick 10");
    expect(names(sortSamples(list, { by: "recent", dir: "asc" }))[0]).toBe("Atmo");
  });

  it("keeps ties in order and doesn't change the input", () => {
    const kit = [s("B", 1, 0), s("A", 1, 0)];
    expect(names(sortSamples(kit, { by: "recent", dir: "desc" }))).toEqual(["B", "A"]);
    expect(names(kit)).toEqual(["B", "A"]);
  });

  it("labels the button", () => {
    expect(sortLabel({ by: "name", dir: "asc" })).toBe("Name ↑");
    expect(sortLabel({ by: "duration", dir: "desc" })).toBe("Duration ↓");
    expect(sortLabel({ by: "recent", dir: "desc" })).toBe("Newest");
  });
});
