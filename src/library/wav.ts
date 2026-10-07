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
