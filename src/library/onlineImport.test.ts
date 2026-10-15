import { describe, it, expect } from "vitest";
import { DownloadLru } from "./downloadLru";

describe("DownloadLru", () => {
  it("returns undefined for missing entries", () => {
    const lru = new DownloadLru();
    expect(lru.get("missing")).toBeUndefined();
  });

  it("returns a stored entry", async () => {
    const lru = new DownloadLru();
    const buf = new ArrayBuffer(8);
    const p = Promise.resolve(buf);
    lru.set("a", p);
    expect(await lru.get("a")).toBe(buf);
  });

  it("evicts the least recently used entry when at 64", async () => {
    const lru = new DownloadLru();
    // fill with 64 entries (each resolves to 1 byte, well under the size cap)
    for (let i = 0; i < 64; i++) {
      const buf = new ArrayBuffer(1);
      lru.set(`url${i}`, Promise.resolve(buf));
    }
    // access url1 so it becomes the MRU
    lru.get("url1");
    // wait for all sizes to be recorded
    await new Promise((r) => setTimeout(r, 0));
    // adding a 65th entry evicts url0 (the LRU)
    lru.set("url64", Promise.resolve(new ArrayBuffer(1)));
    await new Promise((r) => setTimeout(r, 0));
    expect(lru.get("url0")).toBeUndefined();
    // url1 was accessed so it's still there
    expect(lru.get("url1")).toBeDefined();
    // the new entry is there
    expect(lru.get("url64")).toBeDefined();
  });

  it("evicts entries to stay under 64 MB", async () => {
    const lru = new DownloadLru();
    // one entry of 63 MB
    const big = new ArrayBuffer(63 * 1024 * 1024);
    lru.set("big", Promise.resolve(big));
    await new Promise((r) => setTimeout(r, 0));
    expect(lru.get("big")).toBeDefined();
    // a second 2 MB entry: total > 64 MB, so 'big' is evicted (it was first)
    lru.set("big2", Promise.resolve(new ArrayBuffer(2 * 1024 * 1024)));
    await new Promise((r) => setTimeout(r, 0));
    expect(lru.get("big")).toBeUndefined();
    expect(lru.get("big2")).toBeDefined();
  });

  it("delete removes an entry and its size", async () => {
    const lru = new DownloadLru();
    lru.set("x", Promise.resolve(new ArrayBuffer(100)));
    await new Promise((r) => setTimeout(r, 0));
    lru.delete("x");
    expect(lru.get("x")).toBeUndefined();
  });
});
