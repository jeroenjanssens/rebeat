/** Decoded audio buffers by sample id, plus waveform peaks for drawing. */

export interface SampleInfo {
  id: string;
  name: string;
  category?: string;
  /** Original tempo of loops (for warp). */
  bpm?: number;
}

const buffers = new Map<string, AudioBuffer>();
const infos = new Map<string, SampleInfo>();
const peaksCache = new Map<string, Float32Array>();
const listeners = new Set<() => void>();
let version = 0;

export function registerSample(info: SampleInfo, buffer: AudioBuffer) {
  buffers.set(info.id, buffer);
  infos.set(info.id, info);
  for (const k of peaksCache.keys()) if (k.startsWith(`${info.id}:`)) peaksCache.delete(k);
  version += 1;
  for (const fn of listeners) fn();
}

export function getBuffer(id: string | undefined): AudioBuffer | undefined {
  return id ? buffers.get(id) : undefined;
}

export function sampleInfo(id: string | undefined): SampleInfo | undefined {
  return id ? infos.get(id) : undefined;
}

export function allSamples(): SampleInfo[] {
  return [...infos.values()];
}

export function onSamplesChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function samplesVersion() {
  return version;
}

/** Peak amplitude (0..1) per bucket, over all channels. */
export function computePeaks(
  buffer: AudioBuffer,
  n: number,
  start = 0,
  end = buffer.length,
): Float32Array {
  const out = new Float32Array(n);
  const len = Math.max(1, end - start);
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < n; i++) {
    const a = start + Math.floor((i / n) * len);
    const b = Math.max(a + 1, start + Math.floor(((i + 1) / n) * len));
    let max = 0;
    // stride through long buckets: peaks only need to look right, not be exact
    const stride = Math.max(1, Math.floor((b - a) / 256));
    for (const d of chans)
      for (let j = a; j < b; j += stride) max = Math.max(max, Math.abs(d[j] || 0));
    out[i] = Math.min(1, max);
  }
  return out;
}

const FLAT = new Float32Array(512);

export function samplePeaks(id: string | undefined, n = 512): Float32Array {
  const buf = getBuffer(id);
  if (!buf || !id) return FLAT;
  const key = `${id}:${n}`;
  let p = peaksCache.get(key);
  if (!p) {
    p = computePeaks(buf, n);
    peaksCache.set(key, p);
  }
  return p;
}
