/**
 * Wavetables (D242, D243): tables of single-cycle frames, 2048 samples each, up to 256 frames.
 * The factory tables are generated here from spectra and shapes (small to ship, deterministic,
 * no licences); your own come from samples (cutTable). Every table is band-limited into mip
 * levels before it plays: one per octave, each keeping only the harmonics that fit below Nyquist
 * (mipTable). Pure: tests, the library and the editor's pictures use it.
 */
import { fft } from "../library/fft";

export const FRAME = 2048;
export const MAX_FRAMES = 256;
/** Mip levels: level k keeps harmonics up to 1024 >> k (level 10: the fundamental alone). */
export const LEVELS = 11;

/** Samples per frame at level k: four per period of its top harmonic, 64 at least. */
export const levelSize = (k: number) => Math.min(FRAME, Math.max(64, 4 * (1024 >> k)));
/** The highest harmonic kept at level k. */
export const levelTop = (k: number) => Math.min(1023, 1024 >> k);

/** A table ready to play: every frame at every level, each level's frames one after another. */
export interface MippedTable {
  id: string;
  frames: number;
  sizes: number[];
  levels: Float32Array[];
}

export interface FactoryTable {
  id: string;
  name: string;
  group: string;
  /** What it sounds like, for the menu's hints. */
  note: string;
  make: () => Float32Array[];
}

// ---------- making frames ----------

/** A frame from harmonic amplitudes (and phases, radians; default 0: sines). */
export function fromSpectrum(amp: (h: number) => number, phase?: (h: number) => number) {
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  for (let h = 1; h < FRAME / 2; h++) {
    const a = amp(h);
    if (!a) continue;
    const ph = phase?.(h) ?? 0;
    // X_h = (N/2)·a·(−i)·e^{iφ} gives a·sin(2πht + φ); the mirror bin is its conjugate
    const xr = (FRAME / 2) * a * Math.sin(ph);
    const xi = -(FRAME / 2) * a * Math.cos(ph);
    re[h] = xr;
    im[h] = xi;
    re[FRAME - h] = xr;
    im[FRAME - h] = -xi;
  }
  return inverse(re, im);
}

/** The inverse FFT of a full spectrum (real output), in place of its arrays. */
function inverse(re: Float32Array, im: Float32Array): Float32Array {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = re[i] / n;
  return out;
}

/** A frame from a function of the phase (0..1). */
export const fromShape = (f: (t: number) => number) =>
  Float32Array.from({ length: FRAME }, (_, i) => f(i / FRAME));

const frames = (n: number, make: (x: number, i: number) => Float32Array) =>
  Array.from({ length: n }, (_, i) => make(n > 1 ? i / (n - 1) : 0, i));

/** A seeded random 0..1 (the factory tables come out the same every time). */
function lcg(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const saw = (h: number) => 1 / h;
const odd = (h: number) => (h % 2 ? 1 / h : 0);
const tri = (h: number) => (h % 2 ? ((h % 4 === 1 ? 1 : -1) * 1) / (h * h) : 0);
const bell = (x: number, c: number, w: number) => Math.exp(-((x - c) ** 2) / (2 * w * w));

/** Vowel formants (Hz, F1–F3, with levels), sung on A2 (110 Hz). */
const VOWELS: [number, number, number][][] = [
  [
    [800, 1, 0.08],
    [1150, 0.5, 0.1],
    [2900, 0.25, 0.12],
  ], // A
  [
    [400, 1, 0.08],
    [2000, 0.5, 0.1],
    [2550, 0.3, 0.12],
  ], // E
  [
    [280, 1, 0.08],
    [2250, 0.4, 0.1],
    [2900, 0.3, 0.12],
  ], // I
  [
    [450, 1, 0.08],
    [800, 0.6, 0.1],
    [2830, 0.15, 0.12],
  ], // O
  [
    [325, 1, 0.08],
    [700, 0.4, 0.1],
    [2530, 0.1, 0.12],
  ], // U
];

/** A sung vowel's harmonics: the formants (log-frequency bells) over a falling slope. */
function vowelAmp(fs: [number, number, number][], slope: number) {
  return (h: number) => {
    const f = 110 * h;
    if (f > 6000) return 0;
    let a = 0;
    for (const [c, level, w] of fs) a += level * bell(Math.log2(f), Math.log2(c), w * 4);
    return (a + 0.02) * Math.pow(h, -slope);
  };
}

/** Two vowels' formants, part of the way from one to the other. */
const between = (a: [number, number, number][], b: [number, number, number][], t: number) =>
  a.map(([c, l, w], i): [number, number, number] => [
    c * Math.pow(b[i][0] / c, t),
    l + (b[i][1] - l) * t,
    w + (b[i][2] - w) * t,
  ]);

/** Organ drawbars (16′ 5⅓′ 8′ 4′ 2⅔′ 2′ 1⅗′ 1⅓′ 1′) as harmonics of the 16′. */
const DRAWBAR_HARMONICS = [1, 3, 2, 4, 6, 8, 10, 12, 16];
const REGISTRATIONS = [
  "008000000",
  "888000000",
  "868000000",
  "888800000",
  "880000008",
  "808808008",
  "888888888",
  "688600000",
];

/** The partials of a rectangular plate with sides 1 : r, as harmonic numbers of the lowest. */
function plateHarmonics(r: number, n: number) {
  const out: number[] = [];
  for (let a = 1; a <= 8; a++) for (let b = 1; b <= 8; b++) out.push(a * a + (b * b) / (r * r));
  out.sort((x, y) => x - y);
  const base = out[0];
  return [...new Set(out.slice(0, n).map((f) => Math.round((f / base) * 4)))];
}

/** The factory tables, by group (ids are stable: patches store them). */
export const FACTORY_TABLES: FactoryTable[] = [
  {
    id: "factory:basic",
    name: "Basic shapes",
    group: "Basic",
    note: "Sine, triangle, saw and square, like the analog oscillator",
    make: () => [
      fromSpectrum((h) => (h === 1 ? 1 : 0)),
      fromSpectrum(tri),
      fromSpectrum(saw),
      fromSpectrum(odd),
    ],
  },
  {
    id: "factory:pwm",
    name: "PWM",
    group: "Basic",
    note: "A pulse narrowing from a square to a thin 5%",
    // a pulse's harmonics: sin(πhw)/h, as cosines
    make: () =>
      frames(32, (x) => {
        const w = 0.5 - x * 0.45;
        return fromSpectrum(
          (h) => (2 / (Math.PI * h)) * Math.sin(Math.PI * h * w),
          () => Math.PI / 2,
        );
      }),
  },
  {
    id: "factory:harmonics",
    name: "Harmonics",
    group: "Basic",
    note: "Adds partials one by one, from a sine to a full saw",
    make: () =>
      frames(64, (x) => {
        const count = 1 + x * 63;
        return fromSpectrum((h) => (h <= count ? 1 : h < count + 1 ? count + 1 - h : 0) / h);
      }),
  },
  {
    id: "factory:odd-even",
    name: "Odd to even",
    group: "Spectral",
    note: "From odd harmonics (hollow, square-like) to even ones (an octave up, nasal)",
    make: () =>
      frames(64, (x) =>
        fromSpectrum((h) => (h === 1 ? 1 : (h % 2 ? 1 - x : x) / Math.pow(h, 0.9))),
      ),
  },
  {
    id: "factory:tilt",
    name: "Bright to dark",
    group: "Spectral",
    note: "A saw's spectrum tilting from bright to a soft, flute-like tone",
    make: () => frames(64, (x) => fromSpectrum((h) => Math.pow(h, -(0.4 + x * 2.2)))),
  },
  {
    id: "factory:formant",
    name: "Formant sweep",
    group: "Spectral",
    note: "A resonant peak sweeping up through a saw: a talking, wah-like sound",
    make: () =>
      frames(64, (x) => {
        const c = Math.log2(2 * Math.pow(40, x));
        return fromSpectrum((h) => (0.1 + 2 * bell(Math.log2(h), c, 0.35)) / h);
      }),
  },
  {
    id: "factory:comb",
    name: "Comb sweep",
    group: "Spectral",
    note: "Notches moving through a saw, like a flanger frozen in place",
    make: () =>
      frames(64, (x) => {
        const d = 0.02 + x * 0.3;
        return fromSpectrum((h) => (0.5 + 0.5 * Math.cos(2 * Math.PI * h * d)) / h);
      }),
  },
  {
    id: "factory:vowels",
    name: "Vowels",
    group: "Vocal",
    note: "A, E, I, O, U sung, one into the next",
    make: () =>
      frames(64, (x) => {
        const at = x * (VOWELS.length - 1);
        const i = Math.min(VOWELS.length - 2, Math.floor(at));
        return fromSpectrum(vowelAmp(between(VOWELS[i], VOWELS[i + 1], at - i), 0.6));
      }),
  },
  {
    id: "factory:choir",
    name: "Choir",
    group: "Vocal",
    note: "From a closed “oo” to an open “ah”, soft and breathy",
    make: () => {
      const rand = lcg(7);
      const jitter = Array.from({ length: 1024 }, () => 0.7 + rand() * 0.6);
      return frames(32, (x) =>
        fromSpectrum((h) => vowelAmp(between(VOWELS[4], VOWELS[0], x), 1.1)(h) * jitter[h]),
      );
    },
  },
  {
    id: "factory:sync",
    name: "Sync sweep",
    group: "Analog",
    note: "A hard-synced saw, its pitch rising inside the cycle: the tearing sync lead",
    make: () => frames(64, (x) => fromShape((t) => 2 * ((t * (1 + x * 7)) % 1) - 1)),
  },
  {
    id: "factory:filtered-saw",
    name: "Filtered saw",
    group: "Analog",
    note: "A saw through a resonant low-pass opening up",
    make: () =>
      frames(64, (x) => {
        const cut = 2 * Math.pow(150, x);
        return fromSpectrum((h) => {
          const r = h / cut;
          // a 24 dB/octave low-pass with a resonant bump at the cutoff
          return (1 / h) * (1 / Math.sqrt(1 + r ** 8)) * (1 + 2.5 * bell(Math.log2(r), 0, 0.15));
        });
      }),
  },
  {
    id: "factory:fm",
    name: "FM sweep",
    group: "Digital",
    note: "Two-operator FM (ratio 2), the index rising: from a sine to a metallic growl",
    make: () =>
      frames(64, (x) =>
        fromShape((t) => Math.sin(2 * Math.PI * t + x * 6 * Math.sin(4 * Math.PI * t))),
      ),
  },
  {
    id: "factory:bitcrush",
    name: "Bitcrush",
    group: "Digital",
    note: "A saw with fewer and fewer steps and levels: lo-fi, video-game edges",
    make: () =>
      frames(32, (x) => {
        const steps = Math.round(Math.pow(2, 8 - x * 6));
        const bits = Math.pow(2, Math.max(1, 6 - x * 5));
        return fromShape((t) => {
          const held = Math.floor(t * steps) / steps;
          return Math.round((2 * held - 1) * bits) / bits;
        });
      }),
  },
  {
    id: "factory:organ",
    name: "Organ",
    group: "Digital",
    note: "Eight drawbar registrations, from a flute stop to full organ",
    make: () =>
      REGISTRATIONS.map((r) =>
        fromSpectrum((h) => {
          const i = DRAWBAR_HARMONICS.indexOf(h);
          return i < 0 ? 0 : Number(r[i]) / 8;
        }),
      ),
  },
  {
    id: "factory:metal",
    name: "Glass & metal",
    group: "Texture",
    note: "Inharmonic-sounding clusters, from glass to a plate, for bells and metallic leads",
    make: () =>
      frames(32, (x) => {
        const hs = plateHarmonics(1 + x * 0.8, 10);
        return fromSpectrum((h) => {
          const i = hs.indexOf(h);
          return i < 0 ? 0 : Math.pow(0.75, i);
        });
      }),
  },
  {
    id: "factory:grit",
    name: "Grit",
    group: "Texture",
    note: "Noise frozen into cycles, from a dull rumble to a bright buzz",
    make: () => {
      const rand = lcg(11);
      const phases = Array.from({ length: 1024 }, () => rand() * 2 * Math.PI);
      const amps = Array.from({ length: 1024 }, () => 0.3 + rand());
      return frames(32, (x) => {
        const top = 4 * Math.pow(128, x);
        return fromSpectrum(
          (h) => (h < top ? amps[h] / Math.sqrt(h) : 0),
          (h) => phases[h],
        );
      });
    },
  },
];

const FACTORY_BY_ID = new Map(FACTORY_TABLES.map((t) => [t.id, t]));
export const factoryTable = (id: string) => FACTORY_BY_ID.get(id);

/** Your tables' names (the library fills this in, D246). */
const userNames = new Map<string, string>();
export const setTableName = (id: string, name: string) => void userNames.set(id, name);

/** A table's name, for menus and lanes. */
export function tableName(id: string): string {
  return factoryTable(id)?.name ?? userNames.get(id) ?? "Missing table";
}

// ---------- band-limiting ----------

/**
 * A table's mip levels (D243): an FFT per frame, then for each level an inverse FFT with the
 * harmonics above its top cut. DC is removed and the whole table normalized to a peak of 1.
 */
export function mipTable(id: string, input: Float32Array[]): MippedTable {
  const n = Math.max(1, Math.min(MAX_FRAMES, input.length));
  const sizes = Array.from({ length: LEVELS }, (_, k) => levelSize(k));
  const levels = sizes.map((s) => new Float32Array(n * s));
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  for (let f = 0; f < n; f++) {
    const src = input[f] ?? input[0];
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME; i++) re[i] = src[i] ?? 0;
    fft(re, im);
    for (let k = 0; k < LEVELS; k++) {
      const size = sizes[k];
      const top = Math.min(levelTop(k), size / 2 - 1);
      const r = new Float32Array(size);
      const m = new Float32Array(size);
      const scale = size / FRAME;
      for (let h = 1; h <= top; h++) {
        r[h] = re[h] * scale;
        m[h] = im[h] * scale;
        r[size - h] = re[h] * scale;
        m[size - h] = -im[h] * scale;
      }
      levels[k].set(inverse(r, m), f * size);
    }
  }
  // one gain for the whole table, from level 0 (the others are never louder)
  let peak = 0;
  for (const x of levels[0]) peak = Math.max(peak, Math.abs(x));
  if (peak > 0) for (const l of levels) for (let i = 0; i < l.length; i++) l[i] /= peak;
  return { id, frames: n, sizes, levels };
}

/** One frame of a level, for pictures. */
export function frameOf(t: MippedTable, frame: number, level = 0): Float32Array {
  const s = t.sizes[level];
  const f = Math.min(t.frames - 1, Math.max(0, Math.round(frame)));
  return t.levels[level].subarray(f * s, (f + 1) * s);
}

// ---------- your tables, from samples (D246) ----------

export type CutMode = "cycles" | "slices" | "file";

/** Resample `src[from..to)` to one frame of FRAME samples (linear). */
function resampleFrame(src: Float32Array, from: number, to: number): Float32Array {
  const out = new Float32Array(FRAME);
  const len = to - from;
  for (let i = 0; i < FRAME; i++) {
    const x = from + (i / FRAME) * len;
    const a = Math.floor(x);
    const t = x - a;
    out[i] = (src[a] ?? 0) * (1 - t) + (src[a + 1] ?? src[a] ?? 0) * t;
  }
  return out;
}

/** Fade a frame's ends (a few percent) so its wrap doesn't click. */
function smoothEdges(f: Float32Array) {
  const n = Math.round(FRAME * 0.03);
  for (let i = 0; i < n; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
    f[i] *= g;
    f[FRAME - 1 - i] *= g;
  }
  return f;
}

/** The first rising zero crossing at or after `i`. */
function zeroUp(x: Float32Array, i: number, limit: number) {
  for (let j = Math.max(1, Math.floor(i)); j < Math.min(limit, x.length); j++)
    if (x[j - 1] <= 0 && x[j] > 0) return j;
  return Math.floor(i);
}

/**
 * Cut audio into frames (D246):
 * - cycles: single cycles of its pitch (`period` in samples, from pitch detection), at zero
 *   crossings, spread over the region, each resampled to 2048
 * - slices: `count` frames spread evenly, each 2048 samples as they are
 * - file: the audio already is a wavetable (`frameSize` samples per frame, one after another)
 */
export function cutTable(
  audio: Float32Array,
  opts: {
    mode: CutMode;
    start?: number;
    end?: number;
    count?: number;
    period?: number;
    frameSize?: number;
    smooth?: boolean;
  },
): Float32Array[] {
  const start = Math.max(0, Math.floor(opts.start ?? 0));
  const end = Math.min(audio.length, Math.floor(opts.end ?? audio.length));
  const out: Float32Array[] = [];
  if (opts.mode === "file") {
    const size = opts.frameSize ?? FRAME;
    for (let at = 0; at + size <= audio.length && out.length < MAX_FRAMES; at += size)
      out.push(size === FRAME ? audio.slice(at, at + size) : resampleFrame(audio, at, at + size));
    return out.length ? out : [resampleFrame(audio, 0, audio.length)];
  }
  const count = Math.max(1, Math.min(MAX_FRAMES, opts.count ?? 64));
  const span = Math.max(1, end - start);
  if (opts.mode === "slices") {
    for (let i = 0; i < count; i++) {
      const at = start + Math.floor((i / count) * Math.max(0, span - FRAME));
      const f = new Float32Array(FRAME);
      f.set(audio.subarray(at, Math.min(audio.length, at + FRAME)));
      out.push(opts.smooth === false ? f : smoothEdges(f));
    }
    return out;
  }
  const period = Math.max(8, opts.period ?? FRAME);
  const cycles = Math.max(1, Math.floor((span - period) / period));
  const n = Math.min(count, cycles);
  for (let i = 0; i < n; i++) {
    const want = start + Math.floor((i / Math.max(1, n)) * Math.max(0, span - 2 * period));
    const a = zeroUp(audio, want, want + period);
    const f = resampleFrame(audio, a, a + period);
    out.push(opts.smooth ? smoothEdges(f) : f);
  }
  return out;
}

/** A WAV file's frame size from its `clm ` chunk (Serum's "<!>2048 …"), if it has one. */
export function clmFrameSize(bytes: Uint8Array): number | null {
  for (let i = 12; i + 8 < bytes.length && i < 4096;) {
    const id = String.fromCharCode(...bytes.subarray(i, i + 4));
    const size = bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24);
    if (id === "clm ") {
      const text = String.fromCharCode(...bytes.subarray(i + 8, i + 8 + Math.min(size, 32)));
      const m = /<!>(\d+)/.exec(text);
      return m ? Number(m[1]) : null;
    }
    if (id === "data") return null;
    i += 8 + size + (size % 2);
  }
  return null;
}
