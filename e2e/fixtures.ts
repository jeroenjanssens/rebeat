import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A mono 16-bit WAV file. */
export function wav(samples: Float32Array, sampleRate = 44100): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2),
  );
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** A click loop: `beats` beats at `bpm`. */
export function clickLoop(bpm: number, beats: number, sampleRate = 44100) {
  const beat = 60 / bpm;
  const out = new Float32Array(Math.round(beats * beat * sampleRate));
  for (let b = 0; b < beats; b++) {
    const start = Math.round(b * beat * sampleRate);
    for (let i = 0; i < 1500 && start + i < out.length; i++)
      out[start + i] = (b % 4 === 0 ? 0.9 : 0.5) * Math.exp(-i / 200) * Math.sin(i * 0.25);
  }
  return out;
}

export function oneShot(freq = 60, seconds = 0.4, sampleRate = 44100) {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++)
    out[i] = Math.exp(-i / (sampleRate * 0.08)) * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

/** Write fixture files into a temp folder; returns their paths. */
export function fixtureFiles(files: Record<string, Buffer>): string[] {
  const dir = join(tmpdir(), `rebeat-e2e-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return Object.entries(files).map(([name, data]) => {
    const p = join(dir, name);
    writeFileSync(p, data);
    return p;
  });
}

/** A minimal SoundFont 2 file: one sine sample, one instrument and one preset with that name. */
export function soundfont(name = "Test Sine", rate = 22050): Buffer {
  const str = (s: string, n: number) => {
    const b = Buffer.alloc(n);
    b.write(s.slice(0, n - 1), "latin1");
    return b;
  };
  const u16 = (v: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v);
    return b;
  };
  const u32 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v);
    return b;
  };
  const chunk = (id: string, data: Buffer) => {
    const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
    return Buffer.concat([Buffer.from(id, "latin1"), u32(data.length), data, pad]);
  };
  const list = (type: string, ...chunks: Buffer[]) =>
    chunk("LIST", Buffer.concat([Buffer.from(type, "latin1"), ...chunks]));

  // a second of a 440 Hz sine, then the 46 zero samples SoundFont wants after each sample
  const n = rate;
  const pcm = Buffer.alloc((n + 46) * 2);
  for (let i = 0; i < n; i++)
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 20000), i * 2);

  const info = list(
    "INFO",
    chunk("ifil", Buffer.concat([u16(2), u16(1)])),
    chunk("isng", str("EMU8000", 8)),
    chunk("INAM", str("Test", 6)),
  );
  const sdta = list("sdta", chunk("smpl", pcm));
  const gen = (oper: number, amount: number) => Buffer.concat([u16(oper), u16(amount)]);
  const preset = (n: string, bag: number) =>
    Buffer.concat([str(n, 20), u16(0), u16(0), u16(bag), u32(0), u32(0), u32(0)]);
  const inst = (n: string, bag: number) => Buffer.concat([str(n, 20), u16(bag)]);
  const shdr = (n: string, start: number, end: number, type: number) =>
    Buffer.concat([
      str(n, 20),
      u32(start),
      u32(end),
      u32(end ? start + 8 : 0),
      u32(Math.max(0, end - 8)),
      u32(rate),
      Buffer.from([69, 0]),
      u16(0),
      u16(type),
    ]);
  const pdta = list(
    "pdta",
    chunk("phdr", Buffer.concat([preset(name, 0), preset("EOP", 1)])),
    chunk("pbag", Buffer.concat([u16(0), u16(0), u16(1), u16(0)])),
    chunk("pmod", Buffer.alloc(10)),
    chunk("pgen", Buffer.concat([gen(41, 0), gen(0, 0)])),
    chunk("inst", Buffer.concat([inst(name, 0), inst("EOI", 1)])),
    chunk("ibag", Buffer.concat([u16(0), u16(0), u16(1), u16(0)])),
    chunk("imod", Buffer.alloc(10)),
    chunk("igen", Buffer.concat([gen(53, 0), gen(0, 0)])),
    chunk("shdr", Buffer.concat([shdr("Sine", 0, n, 1), shdr("EOS", 0, 0, 0)])),
  );
  const body = Buffer.concat([Buffer.from("sfbk", "latin1"), info, sdta, pdta]);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), u32(body.length), body]);
}
