/**
 * Writing `.xm` modules (D279): the tests make their modules with it (unpacked patterns, 8- or
 * 16-bit delta samples). It writes what `parse.ts` reads, as FT2 lays it out.
 */
import type { XmCell } from "./parse";

export interface XmSampleSpec {
  name?: string;
  data: Float32Array;
  loopStart?: number;
  loopLength?: number;
  loopType?: 0 | 1 | 2;
  volume?: number;
  finetune?: number;
  panning?: number;
  relativeNote?: number;
  bits?: 8 | 16;
}

export interface XmSpec {
  name?: string;
  channels: number;
  speed?: number;
  bpm?: number;
  orders: number[];
  restart?: number;
  /** Each pattern: rows × channels cells (missing cells are empty). */
  patterns: Partial<XmCell>[][][];
  instruments: { name?: string; keymap?: number[]; samples: XmSampleSpec[] }[];
}

export function writeXm(spec: XmSpec): ArrayBuffer {
  const out: number[] = [];
  const u8 = (n: number) => out.push(n & 0xff);
  const u16 = (n: number) => (u8(n), u8(n >> 8));
  const u32 = (n: number) => (u16(n), u16(n >>> 16));
  const str = (s: string, n: number) => {
    for (let i = 0; i < n; i++) u8(i < s.length ? s.charCodeAt(i) : 0);
  };
  str("Extended Module: ", 17);
  str(spec.name ?? "", 20);
  u8(0x1a);
  str("Rebeat test", 20);
  u16(0x0104);
  u32(276);
  u16(spec.orders.length);
  u16(spec.restart ?? 0);
  u16(spec.channels);
  u16(spec.patterns.length);
  u16(spec.instruments.length);
  u16(1);
  u16(spec.speed ?? 6);
  u16(spec.bpm ?? 125);
  for (let i = 0; i < 256; i++) u8(spec.orders[i] ?? 0);

  for (const rows of spec.patterns) {
    const data: number[] = [];
    for (const row of rows)
      for (let c = 0; c < spec.channels; c++) {
        const cell = row[c] ?? {};
        data.push(
          cell.note ?? 0,
          cell.instrument ?? 0,
          cell.volume ?? 0,
          cell.effect ?? 0,
          cell.param ?? 0,
        );
      }
    u32(9);
    u8(0);
    u16(rows.length);
    u16(data.length);
    for (const b of data) u8(b);
  }

  for (const inst of spec.instruments) {
    u32(243);
    str(inst.name ?? "", 22);
    u8(0);
    u16(inst.samples.length);
    u32(40);
    for (let i = 0; i < 96; i++) u8(inst.keymap?.[i] ?? 0);
    for (let i = 0; i < 96; i++) u8(0); // envelopes
    // points, sustain and loop points, envelope types, vibrato, fadeout, reserved: 18 bytes
    for (let i = 0; i < 18; i++) u8(0);
    const encoded = inst.samples.map((s) => encode(s));
    inst.samples.forEach((s, i) => {
      const unit = s.bits === 16 ? 2 : 1;
      u32(encoded[i].length);
      u32((s.loopStart ?? 0) * unit);
      u32((s.loopLength ?? 0) * unit);
      u8(s.volume ?? 64);
      u8(s.finetune ?? 0);
      u8((s.loopType ?? 0) | (s.bits === 16 ? 0x10 : 0));
      u8(s.panning ?? 128);
      u8(s.relativeNote ?? 0);
      u8(0);
      str(s.name ?? "", 22);
    });
    for (const e of encoded) for (const b of e) u8(b);
  }
  return new Uint8Array(out).buffer;
}

function encode(s: XmSampleSpec): number[] {
  const out: number[] = [];
  let old = 0;
  for (const x of s.data) {
    if (s.bits === 16) {
      const v = Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
      const d = (v - old) & 0xffff;
      out.push(d & 0xff, d >> 8);
      old = v;
    } else {
      const v = Math.max(-128, Math.min(127, Math.round(x * 127)));
      out.push((v - old) & 0xff);
      old = v;
    }
  }
  return out;
}
