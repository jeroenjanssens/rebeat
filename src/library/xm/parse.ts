/**
 * Reading Fast Tracker 2 modules (`.xm`, D279). Pure: bytes in, the module out, with its samples
 * decoded to floats (−1..1). The format: a header (speed, BPM, the order list), packed patterns,
 * then instruments, each with its sample headers followed by delta-encoded sample data.
 */

/** One cell of a pattern: an XM note (1–96, 97 key-off, 0 none), instrument (1-based, 0 none),
 * volume column byte, effect type and parameter. */
export interface XmCell {
  note: number;
  instrument: number;
  volume: number;
  effect: number;
  param: number;
}

export interface XmPattern {
  rows: number;
  /** rows × channels */
  cells: XmCell[][];
}

export interface XmSample {
  name: string;
  /** Frames (not bytes). */
  length: number;
  loopStart: number;
  loopLength: number;
  /** 0 none, 1 forward, 2 ping-pong. */
  loopType: 0 | 1 | 2;
  volume: number;
  finetune: number;
  panning: number;
  relativeNote: number;
  data: Float32Array;
}

/** An envelope: points of (tick, value 0–64), an optional sustain point and loop (indexes). */
export interface XmEnvelope {
  points: [number, number][];
  sustain?: number;
  loop?: [number, number];
}

export interface XmInstrument {
  name: string;
  /** For each of the 96 notes, the sample it plays (index into `samples`). */
  keymap: number[];
  samples: XmSample[];
  /** How much the volume falls per tick after key-off, of 32768 (0: it doesn't). */
  fadeout: number;
  volumeEnvelope?: XmEnvelope;
  panEnvelope?: XmEnvelope;
  /** The instrument's own vibrato: type, sweep (ticks to full depth), depth and rate. */
  vibrato?: { type: number; sweep: number; depth: number; rate: number };
}

export interface XmModule {
  name: string;
  tracker: string;
  channels: number;
  /** The order list (pattern numbers), `songLength` long. */
  orders: number[];
  restart: number;
  linear: boolean;
  speed: number;
  bpm: number;
  patterns: XmPattern[];
  instruments: XmInstrument[];
}

const EMPTY: XmCell = { note: 0, instrument: 0, volume: 0, effect: 0, param: 0 };

export class XmError extends Error {}

/** Read an `.xm` file. Throws XmError when it isn't one. */
export function parseXm(buffer: ArrayBuffer): XmModule {
  const bytes = new Uint8Array(buffer);
  const v = new DataView(buffer);
  const text = (at: number, n: number) =>
    String.fromCharCode(...bytes.subarray(at, Math.min(bytes.length, at + n)))
      .replace(/\0.*$/s, "")
      .trimEnd();
  if (bytes.length < 80 || text(0, 17) !== "Extended Module:")
    throw new XmError("This isn't a Fast Tracker 2 module (.xm)");
  const need = (at: number, n: number) => {
    if (at + n > bytes.length) throw new XmError("The module is cut short");
  };
  const name = text(17, 20).trim();
  const tracker = text(38, 20).trim();
  const headerSize = v.getUint32(60, true);
  const songLength = v.getUint16(64, true);
  const restart = v.getUint16(66, true);
  const channels = v.getUint16(68, true);
  const patternCount = v.getUint16(70, true);
  const instrumentCount = v.getUint16(72, true);
  const flags = v.getUint16(74, true);
  const speed = v.getUint16(76, true) || 6;
  const bpm = v.getUint16(78, true) || 125;
  if (!channels || channels > 64) throw new XmError("The module has no channels");
  const orders = [...bytes.subarray(80, 80 + Math.min(256, songLength))];

  let at = 60 + headerSize;
  const patterns: XmPattern[] = [];
  for (let p = 0; p < patternCount; p++) {
    need(at, 9);
    const len = v.getUint32(at, true);
    const rows = v.getUint16(at + 5, true) || 64;
    const packed = v.getUint16(at + 7, true);
    at += len;
    const cells: XmCell[][] = [];
    if (!packed) {
      for (let r = 0; r < rows; r++) cells.push(Array.from({ length: channels }, () => EMPTY));
    } else {
      need(at, packed);
      let i = at;
      for (let r = 0; r < rows; r++) {
        const row: XmCell[] = [];
        for (let c = 0; c < channels; c++) {
          const b = bytes[i++] ?? 0;
          if (b & 0x80) {
            row.push({
              note: b & 0x01 ? bytes[i++] : 0,
              instrument: b & 0x02 ? bytes[i++] : 0,
              volume: b & 0x04 ? bytes[i++] : 0,
              effect: b & 0x08 ? bytes[i++] : 0,
              param: b & 0x10 ? bytes[i++] : 0,
            });
          } else {
            row.push({
              note: b,
              instrument: bytes[i++],
              volume: bytes[i++],
              effect: bytes[i++],
              param: bytes[i++],
            });
          }
        }
        cells.push(row);
      }
      at += packed;
    }
    patterns.push({ rows, cells });
  }

  const instruments: XmInstrument[] = [];
  for (let n = 0; n < instrumentCount && at + 29 <= bytes.length; n++) {
    const start = at;
    const size = v.getUint32(at, true);
    const iname = text(at + 4, 22).trim();
    const sampleCount = v.getUint16(at + 27, true);
    const inst: XmInstrument = {
      name: iname,
      keymap: new Array(96).fill(0),
      samples: [],
      fadeout: 0,
    };
    if (sampleCount === 0) {
      at = start + size;
      instruments.push(inst);
      continue;
    }
    need(at, 243);
    const sampleHeaderSize = v.getUint32(at + 29, true) || 40;
    inst.keymap = [...bytes.subarray(at + 33, at + 33 + 96)];
    // the envelopes: 12 points each, then their counts, sustain and loop points, and types
    const envelope = (points: number, count: number, sus: number, loop: number, type: number) => {
      if (!(type & 1) || count < 1) return undefined;
      const n = Math.min(12, count);
      const env: XmEnvelope = {
        points: Array.from({ length: n }, (_, i) => [
          v.getUint16(points + 4 * i, true),
          Math.min(64, v.getUint16(points + 4 * i + 2, true)),
        ]),
      };
      if (type & 2 && bytes[sus] < n) env.sustain = bytes[sus];
      if (type & 4 && bytes[loop] < n && bytes[loop + 1] < n && bytes[loop] <= bytes[loop + 1])
        env.loop = [bytes[loop], bytes[loop + 1]];
      return env;
    };
    inst.volumeEnvelope = envelope(at + 129, bytes[at + 225], at + 227, at + 228, bytes[at + 233]);
    inst.panEnvelope = envelope(at + 177, bytes[at + 226], at + 230, at + 231, bytes[at + 234]);
    if (bytes[at + 237] && bytes[at + 238])
      inst.vibrato = {
        type: bytes[at + 235],
        sweep: bytes[at + 236],
        depth: bytes[at + 237],
        rate: bytes[at + 238],
      };
    inst.fadeout = v.getUint16(at + 239, true);
    at = start + size;
    const headers: (Omit<XmSample, "data" | "length" | "loopStart" | "loopLength"> & {
      bytes: number;
      loopStartBytes: number;
      loopLengthBytes: number;
      is16: boolean;
      adpcm: boolean;
    })[] = [];
    for (let s = 0; s < sampleCount; s++) {
      need(at, 40);
      const type = bytes[at + 14];
      headers.push({
        bytes: v.getUint32(at, true),
        loopStartBytes: v.getUint32(at + 4, true),
        loopLengthBytes: v.getUint32(at + 8, true),
        volume: Math.min(64, bytes[at + 12]),
        finetune: v.getInt8(at + 13),
        loopType: (type & 3) === 3 ? 2 : ((type & 3) as 0 | 1 | 2),
        is16: !!(type & 0x10),
        panning: bytes[at + 15],
        relativeNote: v.getInt8(at + 16),
        adpcm: bytes[at + 17] === 0xad,
        name: text(at + 18, 22).trim(),
      });
      at += sampleHeaderSize;
    }
    for (const h of headers) {
      const data = decodeSample(bytes, at, h.bytes, h.is16, h.adpcm);
      at += h.adpcm ? 16 + Math.ceil(h.bytes / 2) : h.bytes;
      const unit = h.is16 ? 2 : 1;
      const length = data.length;
      const loopStart = Math.min(length, Math.floor(h.loopStartBytes / unit));
      const loopLength = Math.min(length - loopStart, Math.floor(h.loopLengthBytes / unit));
      inst.samples.push({
        name: h.name,
        length,
        loopStart,
        loopLength,
        loopType: loopLength > 0 ? h.loopType : 0,
        volume: h.volume,
        finetune: h.finetune,
        panning: h.panning,
        relativeNote: h.relativeNote,
        data,
      });
    }
    instruments.push(inst);
  }

  return {
    name,
    tracker,
    channels,
    orders: orders.filter((o) => o < patterns.length),
    restart,
    linear: !!(flags & 1),
    speed,
    bpm,
    patterns,
    instruments,
  };
}

/** Sample data: deltas, 8 or 16 bits (or ModPlug's 4-bit ADPCM), as floats. */
function decodeSample(
  bytes: Uint8Array,
  at: number,
  n: number,
  is16: boolean,
  adpcm: boolean,
): Float32Array {
  const avail = Math.max(0, Math.min(n, bytes.length - at));
  if (adpcm) {
    // a 16-byte table of deltas, then two 4-bit indexes per byte
    const table = new Int8Array(bytes.buffer, bytes.byteOffset + at, Math.min(16, avail));
    const out = new Float32Array(n);
    let old = 0;
    for (let i = 0; i < n; i++) {
      const b = bytes[at + 16 + (i >> 1)] ?? 0;
      old = ((old + (table[i & 1 ? b >> 4 : b & 15] ?? 0)) << 24) >> 24;
      out[i] = old / 128;
    }
    return out;
  }
  if (is16) {
    const frames = avail >> 1;
    const out = new Float32Array(frames);
    let old = 0;
    for (let i = 0; i < frames; i++) {
      const d = ((bytes[at + 2 * i] | (bytes[at + 2 * i + 1] << 8)) << 16) >> 16;
      old = ((old + d) << 16) >> 16;
      out[i] = old / 32768;
    }
    return out;
  }
  const out = new Float32Array(avail);
  let old = 0;
  for (let i = 0; i < avail; i++) {
    old = ((old + bytes[at + i]) << 24) >> 24;
    out[i] = old / 128;
  }
  return out;
}
