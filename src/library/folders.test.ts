import { describe, expect, it } from "vitest";
import { inFolder, parentOf, planRemoval } from "./folders";

describe("removing a library folder (D100)", () => {
  const samples = [
    { id: "a", folder: "Kits/TR808" },
    { id: "b", folder: "Kits/TR808" },
    { id: "c", folder: "Kits/TR808/Extra" },
    { id: "d", folder: "Kits/TR8080" },
    { id: "e", folder: "" },
  ];

  it("takes the folder and the ones inside it, not folders with a similar name", () => {
    expect(inFolder("Kits/TR808/Extra", "Kits/TR808")).toBe(true);
    expect(inFolder("Kits/TR8080", "Kits/TR808")).toBe(false);
    expect(planRemoval(samples, "Kits/TR808", new Set()).remove).toEqual(["a", "b", "c"]);
  });

  it("keeps the samples a project plays, in the folder above", () => {
    const plan = planRemoval(samples, "Kits/TR808", new Set(["b", "e"]));
    expect(plan.remove).toEqual(["a", "c"]);
    expect(plan.keep).toEqual(["b"]);
    expect(plan.parent).toBe("Kits");
    expect(parentOf("Drums")).toBe("");
  });
});
