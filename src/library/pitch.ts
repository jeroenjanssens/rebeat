/**
 * A sample's pitch (D133): YIN on its first second, mono. A sound with a clear pitch (a note,
 * a bass, a vocal) gets its MIDI note, so the keys play it as it is on that key; drums and
 * noises have none (null). Pure: works on plain arrays, unit-tested on synthetic tones.
 */

/** The fundamental in Hz of a mono signal, or null when it has no clear pitch. */
export function detectPitchHz(
  x: Float32Array,
  sampleRate: number,
  { minHz = 40, maxHz = 2000, threshold = 0.15 } = {},
): number | null {
  // the loudest stretch of the first second (past the attack), at most 4096 samples
  const n = Math.min(x.length, Math.round(sampleRate), 4096 * 2);
  if (n < 1024) return null;
  const start = attackEnd(x, n);
  const w = Math.min(2048, Math.floor((n - start) / 2));
  const maxLag = Math.min(Math.floor(sampleRate / minHz), w);
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  if (maxLag <= minLag) return null;
  // difference function and its cumulative mean normalized form (YIN steps 2 and 3)
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = x[start + i] - x[start + i + lag];
      sum += diff * diff;
    }
    d[lag] = sum;
  }
  let running = 0;
  let best = -1;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag];
    const cmnd = running > 0 ? (d[lag] * lag) / running : 1;
    d[lag] = cmnd;
  }
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (d[lag] < threshold) {
      // the bottom of this dip
      while (lag + 1 <= maxLag && d[lag + 1] < d[lag]) lag++;
      best = lag;
      break;
    }
  }
  if (best < 0) return null;
  // parabolic interpolation around the dip for a finer lag
  const a = d[best - 1] ?? d[best];
  const b = d[best];
  const c = d[best + 1] ?? d[best];
  const shift = a + c - 2 * b !== 0 ? (a - c) / (2 * (a + c - 2 * b)) : 0;
  return sampleRate / (best + shift);
}

/** Where the attack is over: the first sample after the peak of the first 50 ms. */
function attackEnd(x: Float32Array, n: number): number {
  let peak = 0;
  let at = 0;
  const end = Math.min(n, 2400);
  for (let i = 0; i < end; i++) {
    const v = Math.abs(x[i]);
    if (v > peak) {
      peak = v;
      at = i;
    }
  }
  return Math.min(at, n - 2048);
}

export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

/** The MIDI note a buffer's pitch is closest to, or null. */
export function detectRootNote(buffer: {
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(c: number): Float32Array;
}): number | null {
  const ch0 = buffer.getChannelData(0);
  let x = ch0;
  if (buffer.numberOfChannels > 1) {
    const ch1 = buffer.getChannelData(1);
    const n = Math.min(ch0.length, buffer.sampleRate * 2);
    x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = (ch0[i] + ch1[i]) / 2;
  }
  const hz = detectPitchHz(x, buffer.sampleRate);
  if (hz === null) return null;
  const midi = Math.round(hzToMidi(hz));
  return midi >= 21 && midi <= 108 ? midi : null;
}
