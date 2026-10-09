/** Resampling to the model's rate with a windowed-sinc low-pass (like the training's resample_poly). */

export const MODEL_RATE = 16000;

/** Mix channels to mono. */
export function mono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const c of channels) for (let i = 0; i < out.length; i++) out[i] += c[i] / channels.length;
  return out;
}

export function resample(x: Float32Array, from: number, to = MODEL_RATE): Float32Array {
  if (from === to) return x;
  const ratio = to / from;
  const n = Math.floor(x.length * ratio);
  const out = new Float32Array(n);
  // cutoff just under the lower Nyquist; the kernel widens when downsampling
  const fc = 0.475 * Math.min(1, ratio);
  const half = Math.ceil(12 / Math.min(1, ratio));
  for (let i = 0; i < n; i++) {
    const t = i / ratio;
    const c = Math.floor(t);
    let acc = 0;
    let norm = 0;
    for (let k = c - half + 1; k <= c + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = t - k;
      const s = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
      // Blackman window over the kernel
      const u = (d + half) / (2 * half);
      const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u);
      acc += x[k] * s * w;
      norm += s * w;
    }
    out[i] = norm ? acc / norm : 0;
  }
  return out;
}
