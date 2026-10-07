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
