/**
 * Encoding audio for export (D77): WAV here, MP3 and OGG Vorbis through wasm-media-encoders,
 * which (with its WebAssembly) only loads the first time someone exports to those formats.
 */
import { encodeWav } from "./wav";

export type AudioFormat =
  | { kind: "wav"; bits: 16 | 24 | 32 }
  | { kind: "mp3"; bitrate: 128 | 192 | 320 }
  | { kind: "ogg"; quality: 3 | 6 | 9 };

export const DEFAULT_FORMAT: AudioFormat = { kind: "wav", bits: 24 };

export const FORMAT_INFO = {
  wav: { ext: "wav", mime: "audio/wav", label: "WAV" },
  mp3: { ext: "mp3", mime: "audio/mpeg", label: "MP3" },
  ogg: { ext: "ogg", mime: "audio/ogg", label: "OGG" },
} as const;

/** The sample rates MP3 supports; others are resampled to 44.1 kHz by the encoder. */
const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

/** Samples per encode call: keeps memory flat for long renders. */
const CHUNK = 1152 * 64;

export async function encodeAudio(
  channels: Float32Array[],
  sampleRate: number,
  format: AudioFormat,
): Promise<Blob> {
  const type = FORMAT_INFO[format.kind].mime;
  if (format.kind === "wav")
    return new Blob([encodeWav(channels, sampleRate, format.bits)], { type });
  const { createEncoder } = await import("wasm-media-encoders");
  // more than two channels: the first two (mono stays mono)
  const chans = channels.slice(0, 2);
  const parts: Uint8Array[] = [];
  const run = (encoder: {
    encode(s: readonly Float32Array[]): Uint8Array;
    finalize(): Uint8Array;
  }) => {
    const n = chans[0]?.length ?? 0;
    // the encoder reuses its output buffer: copy each result
    for (let i = 0; i < n; i += CHUNK)
      parts.push(encoder.encode(chans.map((c) => c.subarray(i, i + CHUNK))).slice());
    parts.push(encoder.finalize().slice());
  };
  const base = { channels: chans.length as 1 | 2, sampleRate };
  if (format.kind === "mp3") {
    const wasm = (await import("wasm-media-encoders/wasm/mp3?url")).default;
    const encoder = await createEncoder("audio/mpeg", wasm);
    encoder.configure({
      ...base,
      bitrate: format.bitrate,
      ...(MP3_RATES.includes(sampleRate) ? {} : { outputSampleRate: 44100 }),
    });
    run(encoder);
  } else {
    const wasm = (await import("wasm-media-encoders/wasm/ogg?url")).default;
    const encoder = await createEncoder("audio/ogg", wasm);
    encoder.configure({ ...base, vbrQuality: format.quality });
    run(encoder);
  }
  return new Blob(parts as Uint8Array<ArrayBuffer>[], { type });
}

/** "name.mp3" */
export const fileName = (name: string, format: AudioFormat) =>
  `${name}.${FORMAT_INFO[format.kind].ext}`;
