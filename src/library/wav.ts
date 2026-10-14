/** WAV encoding (16/24-bit PCM or 32-bit float) and trimming silence. */

export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  bits: 16 | 24 | 32 = 16,
): ArrayBuffer {
  const n = channels[0]?.length ?? 0;
  const nch = channels.length;
  const bps = bits / 8;
  const float = bits === 32;
  const data = n * nch * bps;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + data, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, float ? 3 : 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nch * bps, true);
  v.setUint16(32, nch * bps, true);
  v.setUint16(34, bits, true);
  str(36, "data");
  v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nch; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      if (float) v.setFloat32(o, x, true);
      else if (bits === 16) v.setInt16(o, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
      else {
        const s = Math.round(x < 0 ? x * 0x800000 : x * 0x7fffff);
        v.setUint8(o, s & 0xff);
        v.setUint8(o + 1, (s >> 8) & 0xff);
        v.setUint8(o + 2, (s >> 16) & 0xff);
      }
      o += bps;
    }
  return buf;
}

export function audioBufferChannels(b: AudioBuffer): Float32Array[] {
  return Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
}

/** Drop leading/trailing silence (below `threshold`), keeping a few ms around the sound. */
export function trimSilence(
  channels: Float32Array[],
  sampleRate: number,
  threshold = 0.01,
  padMs = 10,
): Float32Array[] {
  const n = channels[0]?.length ?? 0;
  const loud = (i: number) => channels.some((c) => Math.abs(c[i]) > threshold);
  let a = 0;
  while (a < n && !loud(a)) a++;
  let b = n - 1;
  while (b > a && !loud(b)) b--;
  if (a >= n) return channels.map(() => new Float32Array(0));
  const pad = Math.round((padMs / 1000) * sampleRate);
  return channels.map((c) => c.slice(Math.max(0, a - pad), Math.min(n, b + 1 + pad)));
}

/**
 * A WAV file's samples as they are, mixed to mono, without resampling (decodeAudioData would
 * resample to the context's rate, which breaks a wavetable's 2048-sample frames). PCM 8, 16, 24
 * and 32 bits and 32-bit float; null for anything else.
 */
export function decodeWav(bytes: Uint8Array): { data: Float32Array; sampleRate: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let format = 0;
  let channels = 1;
  let rate = 44100;
  let bits = 16;
  for (let i = 12; i + 8 <= bytes.length;) {
    const id = tag(i);
    const size = v.getUint32(i + 4, true);
    if (id === "fmt ") {
      format = v.getUint16(i + 8, true);
      channels = v.getUint16(i + 10, true);
      rate = v.getUint32(i + 12, true);
      bits = v.getUint16(i + 22, true);
      // WAVE_FORMAT_EXTENSIBLE: the real format is in the sub-format GUID
      if (format === 0xfffe && size >= 40) format = v.getUint16(i + 32, true);
    } else if (id === "data") {
      const step = bits / 8;
      const frames = Math.floor(Math.min(size, bytes.length - i - 8) / (step * channels));
      const out = new Float32Array(frames);
      const read = (at: number) => {
        if (format === 3 && bits === 32) return v.getFloat32(at, true);
        if (format !== 1) return NaN;
        if (bits === 8) return (v.getUint8(at) - 128) / 128;
        if (bits === 16) return v.getInt16(at, true) / 32768;
        if (bits === 24) {
          const x = v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getInt8(at + 2) << 16);
          return x / 8388608;
        }
        if (bits === 32) return v.getInt32(at, true) / 2147483648;
        return NaN;
      };
      for (let f = 0; f < frames; f++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += read(i + 8 + (f * channels + c) * step);
        out[f] = s / channels;
      }
      return Number.isNaN(out[0] ?? 0) ? null : { data: out, sampleRate: rate };
    }
    i += 8 + size + (size % 2);
  }
  return null;
}
