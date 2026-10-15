/**
 * LRU cache for online downloads (P2.8): at most MAX_ENTRIES entries or MAX_BYTES total,
 * whichever comes first. A unit test covers the eviction logic.
 */
const MAX_ENTRIES = 64;
const MAX_BYTES = 64 * 1024 * 1024; // 64 MB

/**
 * LRU keyed by URL: entries are ordered by last access (Map preserves insertion order).
 * Sizes are tracked once the promise resolves; a fetch that fails is removed by its caller.
 */
export class DownloadLru {
  private cache = new Map<string, Promise<ArrayBuffer>>();
  private sizes = new Map<string, number>();
  private totalBytes = 0;

  get(url: string): Promise<ArrayBuffer> | undefined {
    const p = this.cache.get(url);
    if (!p) return undefined;
    // move to end (most recently used)
    this.cache.delete(url);
    this.cache.set(url, p);
    return p;
  }

  set(url: string, p: Promise<ArrayBuffer>): void {
    this.cache.set(url, p);
    // record size once resolved, then trim if over the limits
    void p.then((b) => {
      if (!this.cache.has(url)) return; // evicted while fetching
      this.sizes.set(url, b.byteLength);
      this.totalBytes += b.byteLength;
      this.trim();
    });
  }

  delete(url: string): void {
    this.cache.delete(url);
    const s = this.sizes.get(url);
    if (s !== undefined) {
      this.totalBytes -= s;
      this.sizes.delete(url);
    }
  }

  private trim(): void {
    for (const [url] of this.cache) {
      if (this.cache.size <= MAX_ENTRIES && this.totalBytes <= MAX_BYTES) break;
      this.delete(url);
    }
  }
}
