import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { demoProject } from "../templates/nightDrive";
import { db } from "./db";
import { exportRebeat, importRebeat, rebeatFileName } from "./rebeatFile";

describe(".rebeat files", () => {
  beforeEach(async () => {
    await db.samples.clear();
    await db.blobs.clear();
  });

  it("round-trips a project with an embedded library sample", async () => {
    const p = demoProject();
    p.tracks[0].sampleId = "abc123";
    await db.samples.put({
      id: "abc123",
      name: "My kick",
      folder: "",
      tags: ["drums"],
      favorite: 0,
      createdAt: 1,
      duration: 0.5,
      sampleRate: 44100,
      channels: 1,
      mime: "audio/wav",
      size: 4,
      peaks: [0.5],
    });
    await db.blobs.put({ id: "abc123", blob: new Blob([new Uint8Array([1, 2, 3, 4])]) });
    const file = await exportRebeat(p);

    await db.samples.clear();
    await db.blobs.clear();
    const back = await importRebeat(file);
    expect(back).toEqual(p);
    expect((await db.samples.get("abc123"))?.name).toBe("My kick");
    const blob = (await db.blobs.get("abc123"))!.blob;
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });

  it("rejects files without a project", async () => {
    await expect(
      importRebeat(new Blob([new Uint8Array([80, 75, 5, 6, ...new Array(18).fill(0)])])),
    ).rejects.toThrow();
  });

  it("makes a safe file name", () => {
    expect(rebeatFileName({ ...demoProject(), name: "A/B: mix?" })).toBe("A-B- mix-.rebeat");
  });
});
