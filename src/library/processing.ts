/**
 * Non-destructive sample settings (D19: stored on the library sample, so every track that uses it
 * hears them) and rendering them into the buffer the engine plays.
 */

export type FadeCurve = "linear" | "exp" | "log" | "scurve";

export interface SampleSettings {
  /** Seconds in the original audio. */
  trimStart: number;
  trimEnd: number | null;
  fadeIn: number;
  fadeOut: number;
  fadeInCurve: FadeCurve;
  fadeOutCurve: FadeCurve;
  gainDb: number;
  normalize: boolean;
  reverse: boolean;
  dcRemove: boolean;
  /** Pitch in semitones and cents; `keepLength` uses time-stretching instead of resampling. */
  tuneSemis: number;
  tuneCents: number;
  keepLength: boolean;
  /** Time-stretch factor (2 = twice as long), pitch unchanged. */
  stretch: number;
  /** Amplitude envelope in seconds; sustain is a level (0..1). */
  ahdsr: { a: number; h: number; d: number; s: number; r: number } | null;
  /** Freely drawn volume envelope: points in seconds (of the trimmed sound) and gain (0..2). */
  volumeEnvelope: { time: number; volume: number }[] | null;
  /** Loop points (seconds in the trimmed sound) with a crossfade for seamless sustain. */
  loop: { start: number; end: number; crossfade: number } | null;
}

export const DEFAULT_SETTINGS: SampleSettings = {
  trimStart: 0,
  trimEnd: null,
  fadeIn: 0,
  fadeOut: 0,
  fadeInCurve: "linear",
  fadeOutCurve: "linear",
  gainDb: 0,
  normalize: false,
  reverse: false,
  dcRemove: false,
  tuneSemis: 0,
  tuneCents: 0,
  keepLength: false,
  stretch: 1,
  ahdsr: null,
  volumeEnvelope: null,
  loop: null,
};

export function withDefaults(s: Partial<SampleSettings> | undefined): SampleSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export function isDefault(s: SampleSettings) {
  return JSON.stringify(withDefaults(s)) === JSON.stringify(DEFAULT_SETTINGS);
}

/** Fade shape: 0..1 → gain 0..1. */
export function curve(x: number, c: FadeCurve) {
  const t = Math.min(1, Math.max(0, x));
  if (c === "exp") return t * t;
  if (c === "log") return Math.sqrt(t);
  if (c === "scurve") return 0.5 - 0.5 * Math.cos(Math.PI * t);
  return t;
}

/** Find the nearest zero crossing (for clean trim points). */
export function nearestZeroCrossing(data: Float32Array, index: number, radius = 2000): number {
  for (let d = 0; d < radius; d++) {
    for (const i of [index - d, index + d]) {
      if (i <= 0 || i >= data.length) continue;
      if ((data[i - 1] <= 0 && data[i] > 0) || (data[i - 1] >= 0 && data[i] < 0)) return i;
    }
  }
  return index;
}

function resample(ch: Float32Array, rate: number): Float32Array {
  const n = Math.max(1, Math.floor(ch.length / rate));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * rate;
    const i0 = Math.floor(x);
    const f = x - i0;
    out[i] = (ch[i0] ?? 0) * (1 - f) + (ch[i0 + 1] ?? 0) * f;
  }
  return out;
}

/** Everything except pitch/time changes: synchronous and pure (unit-tested). */
export function applySimple(
  input: Float32Array[],
  sampleRate: number,
  s: SampleSettings,
): Float32Array[] {
  const len = input[0]?.length ?? 0;
  const a = Math.max(0, Math.min(len, Math.round(s.trimStart * sampleRate)));
  const b =
    s.trimEnd === null ? len : Math.max(a + 1, Math.min(len, Math.round(s.trimEnd * sampleRate)));
  const out = input.map((c) => c.slice(a, b));
  const n = out[0]?.length ?? 0;
  if (s.dcRemove)
    for (const c of out) {
      let mean = 0;
      for (const v of c) mean += v;
      mean /= c.length || 1;
      for (let i = 0; i < c.length; i++) c[i] -= mean;
    }
  if (s.reverse) for (const c of out) c.reverse();
  return finish(out, n, sampleRate, s);
}

function finish(
  out: Float32Array[],
  n: number,
  sampleRate: number,
  s: SampleSettings,
): Float32Array[] {
  let gain = Math.pow(10, s.gainDb / 20);
  if (s.normalize) {
    let peak = 0;
    for (const c of out) for (const v of c) peak = Math.max(peak, Math.abs(v));
    if (peak > 0) gain *= 0.98 / peak;
  }
  const fi = Math.round(s.fadeIn * sampleRate);
  const fo = Math.round(s.fadeOut * sampleRate);
  const env = s.ahdsr;
  const vol = s.volumeEnvelope?.length
    ? [...s.volumeEnvelope].sort((x, y) => x.time - y.time)
    : null;
  for (const c of out)
    for (let i = 0; i < n; i++) {
      let g = gain;
      if (i < fi) g *= curve(i / fi, s.fadeInCurve);
      if (i >= n - fo) g *= curve((n - 1 - i) / fo, s.fadeOutCurve);
      const t = i / sampleRate;
      if (env) g *= ahdsrAt(t, n / sampleRate, env);
      if (vol) g *= envelopeAt(vol, t);
      c[i] *= g;
    }
  if (s.loop && s.loop.crossfade > 0) crossfadeLoop(out, sampleRate, s.loop);
  return out;
}

export function ahdsrAt(t: number, total: number, e: NonNullable<SampleSettings["ahdsr"]>): number {
  const relStart = Math.max(0, total - e.r);
  if (t >= relStart) {
    const atRel: number = ahdsrAt(relStart - 1e-9, Infinity, e);
    return atRel * (e.r > 0 ? Math.max(0, 1 - (t - relStart) / e.r) : 0);
  }
  if (t < e.a) return e.a > 0 ? t / e.a : 1;
  if (t < e.a + e.h) return 1;
  if (t < e.a + e.h + e.d) return 1 - (1 - e.s) * ((t - e.a - e.h) / Math.max(1e-9, e.d));
  return e.s;
}

export function envelopeAt(points: { time: number; volume: number }[], t: number) {
  if (t <= points[0].time) return points[0].volume;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    if (t <= q.time)
      return p.volume + ((q.volume - p.volume) * (t - p.time)) / Math.max(1e-9, q.time - p.time);
  }
  return points[points.length - 1].volume;
}

/** Blend the audio before the loop start into the loop end, so the loop joins without a click. */
function crossfadeLoop(out: Float32Array[], sr: number, loop: NonNullable<SampleSettings["loop"]>) {
  const s = Math.round(loop.start * sr);
  const e = Math.round(loop.end * sr);
  const xf = Math.min(Math.round(loop.crossfade * sr), s, e - s);
  if (xf <= 0) return;
  for (const c of out)
    for (let i = 0; i < xf; i++) {
      const k = i / xf;
      c[e - xf + i] = c[e - xf + i] * (1 - k) + c[s - xf + i] * k;
    }
}

/** Time-stretch and/or pitch-shift offline with Signalsmith Stretch. */
export async function stretchOffline(
  input: Float32Array[],
  sampleRate: number,
  rate: number,
  semitones: number,
): Promise<Float32Array[]> {
  const outLen = Math.max(1, Math.round(input[0].length / rate));
  const ctx = new OfflineAudioContext(
    input.length,
    outLen + Math.round(sampleRate * 0.1),
    sampleRate,
  );
  const { default: SignalsmithStretch } = await import("signalsmith-stretch");
  const node = await SignalsmithStretch(ctx, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [input.length],
  });
  await node.addBuffers(input);
  node.schedule({ output: 0, active: true, input: 0, rate, semitones });
  node.connect(ctx.destination);
  const rendered = await ctx.startRendering();
  return Array.from({ length: input.length }, (_, c) =>
    rendered.getChannelData(c).slice(0, outLen),
  );
}

/** The buffer the engine plays for a sample with these settings. */
export async function renderSettings(
  buffer: AudioBuffer,
  settings: Partial<SampleSettings>,
): Promise<AudioBuffer> {
  const s = withDefaults(settings);
  const sr = buffer.sampleRate;
  const src = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const tuned = s.tuneSemis + s.tuneCents / 100;
  const len = src[0].length;
  const a = Math.round(s.trimStart * sr);
  const b = s.trimEnd === null ? len : Math.round(s.trimEnd * sr);
  let chans: Float32Array[] = src.map((c) =>
    c.slice(Math.max(0, a), Math.max(a + 1, Math.min(len, b))),
  );
  if (s.dcRemove || s.reverse)
    chans = applySimple(chans, sr, {
      ...DEFAULT_SETTINGS,
      dcRemove: s.dcRemove,
      reverse: s.reverse,
      trimStart: 0,
      trimEnd: null,
    });
  if (tuned !== 0 && !s.keepLength) chans = chans.map((c) => resample(c, Math.pow(2, tuned / 12)));
  if (s.stretch !== 1 || (tuned !== 0 && s.keepLength)) {
    try {
      chans = await stretchOffline(chans, sr, 1 / s.stretch, s.keepLength ? tuned : 0);
    } catch (e) {
      console.warn("Time-stretch unavailable; using the unstretched sound", e);
    }
  }
  chans = finish(chans, chans[0].length, sr, s);
  const out = new AudioBuffer({
    length: Math.max(1, chans[0].length),
    numberOfChannels: chans.length,
    sampleRate: sr,
  });
  chans.forEach((c, i) => out.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return out;
}
