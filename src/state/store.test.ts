import { beforeEach, describe, expect, it } from "vitest";
import { demoProject } from "../templates/nightDrive";
import { useStore } from "./store";

describe("play mode", () => {
  beforeEach(() => useStore.getState().loadProject(demoProject(), "test"));

  it("is saved with the project but isn't an undo step", () => {
    const s = useStore.getState();
    s.setPlayMode("loop");
    expect(useStore.getState().project.playMode).toBe("loop");
    expect(useStore.getState().past).toHaveLength(0);
  });

  it("survives undo and redo of other edits", () => {
    const s = useStore.getState();
    s.commit((p) => void (p.bpm = 99));
    s.setPlayMode("loop");
    useStore.getState().undo();
    expect(useStore.getState().project.bpm).not.toBe(99);
    expect(useStore.getState().project.playMode).toBe("loop");
    useStore.getState().redo();
    expect(useStore.getState().project.bpm).toBe(99);
    expect(useStore.getState().project.playMode).toBe("loop");
  });
});
