/** Destructive edits for the sample editor: they make new audio (samples stay immutable). */

export type Channels = Float32Array[];

const idx = (t: number, sr: number, n: number) => Math.max(0, Math.min(n, Math.round(t * sr)));

export function copyRange(ch: Channels, sr: number, start: number, end: number): Channels {
  const n = ch[0].length;
  return ch.map((c) => c.slice(idx(start, sr, n), idx(end, sr, n)));
}

export function cutRange(ch: Channels, sr: number, start: number, end: number): Channels {
  const n = ch[0].length;
  const a = idx(start, sr, n);
  const b = idx(end, sr, n);
  return ch.map((c) => {
    const out = new Float32Array(n - (b - a));
    out.set(c.subarray(0, a), 0);
    out.set(c.subarray(b), a);
    return out;
  });
}

export function cropRange(ch: Channels, sr: number, start: number, end: number): Channels {
  return copyRange(ch, sr, start, end);
}

export function silenceRange(ch: Channels, sr: number, start: number, end: number): Channels {
  const n = ch[0].length;
  return ch.map((c) => {
    const out = c.slice();
    out.fill(0, idx(start, sr, n), idx(end, sr, n));
    return out;
  });
}

/** Insert `clip` at `at` seconds (channel counts are matched). */
export function pasteAt(ch: Channels, sr: number, at: number, clip: Channels): Channels {
  const n = ch[0].length;
  const a = idx(at, sr, n);
  const m = clip[0].length;
  return ch.map((c, i) => {
    const out = new Float32Array(n + m);
    out.set(c.subarray(0, a), 0);
    out.set(clip[Math.min(i, clip.length - 1)], a);
    out.set(c.subarray(a), a + m);
    return out;
  });
}

/** Remove silent passages longer than `minGap` seconds (keeping a short tail around sounds). */
export function stripSilence(
  ch: Channels,
  sr: number,
  threshold = 0.01,
  minGap = 0.15,
  keep = 0.02,
): Channels {
  const n = ch[0].length;
  const loud = new Uint8Array(n);
  for (let i = 0; i < n; i++) loud[i] = ch.some((c) => Math.abs(c[i]) > threshold) ? 1 : 0;
  const pad = Math.round(keep * sr);
  const keepMask = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    if (loud[i])
      for (let k = Math.max(0, i - pad); k <= Math.min(n - 1, i + pad); k++) keepMask[k] = 1;
  // only drop gaps that are long enough
  const gap = Math.round(minGap * sr);
  let i = 0;
  while (i < n) {
    if (keepMask[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !keepMask[j]) j++;
    if (j - i < gap) keepMask.fill(1, i, j);
    i = j;
  }
  const total = keepMask.reduce((s, v) => s + v, 0);
  return ch.map((c) => {
    const out = new Float32Array(total);
    let o = 0;
    for (let k = 0; k < n; k++) if (keepMask[k]) out[o++] = c[k];
    return out;
  });
}

/** Slice boundaries: every marker splits; returns [start, end] pairs within [from, to]. */
export function slicesFromMarkers(markers: number[], from: number, to: number): [number, number][] {
  const cuts = [...new Set([from, ...markers.filter((m) => m > from && m < to), to])].sort(
    (a, b) => a - b,
  );
  return cuts.slice(0, -1).map((c, i) => [c, cuts[i + 1]]);
}

export function gridMarkers(from: number, to: number, count: number): number[] {
  return Array.from({ length: count - 1 }, (_, i) => from + ((i + 1) * (to - from)) / count);
}

/** The step each slice starts on, to rebuild the original rhythm as a pattern. */
export function sliceSteps(slices: [number, number][], stepSec: number): number[] {
  const t0 = slices[0]?.[0] ?? 0;
  return slices.map(([s]) => Math.round((s - t0) / stepSec));
}
