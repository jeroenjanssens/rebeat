import { describe, expect, it } from "vitest";
import { blend, prototypes, softmax } from "./calibrate";
import { classFromName } from "./classes";
import {
  convert,
  detectGrid,
  DEFAULT_CONVERT,
  type ConvertSettings,
  type TakeHit,
} from "./convert";
import { fromCsv, parseCsv, toCsv } from "./dataset";
import { detectOnsets, hitEnd, hitWindow } from "./onsets";
import { MODEL_RATE, resample } from "./resample";

/** A noise burst with an exponential decay, like a mouth click. */
function burst(x: Float32Array, at: number, gain = 0.8, decay = 0.03, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const a = Math.round(at * MODEL_RATE);
  for (let i = 0; i < MODEL_RATE * 0.15 && a + i < x.length; i++)
    x[a + i] += gain * rnd() * Math.exp(-i / (decay * MODEL_RATE));
}

describe("onsets", () => {
  it("finds every burst within 10 ms, and nothing in silence", () => {
    const x = new Float32Array(MODEL_RATE * 3);
    const times = [0.1, 0.35, 0.6, 0.85, 1.1, 1.5, 1.75, 2.2, 2.45];
    times.forEach((t, i) => burst(x, t, i % 2 ? 0.3 : 0.9, 0.02, i + 1));
    const found = detectOnsets(x).map((o) => o.time);
    expect(found).toHaveLength(times.length);
    found.forEach((t, i) => expect(Math.abs(t - times[i])).toBeLessThan(0.01));
    expect(detectOnsets(new Float32Array(MODEL_RATE))).toEqual([]);
  });

  it("measures loudness and where a hit ends", () => {
    const x = new Float32Array(MODEL_RATE);
    burst(x, 0.2, 0.5, 0.01);
    const [o] = detectOnsets(x);
    expect(o.peakDb).toBeGreaterThan(-9);
    expect(o.peakDb).toBeLessThan(-5);
    const end = hitEnd(x, o.time);
    expect(end).toBeGreaterThan(0.22);
    expect(end).toBeLessThan(0.35);
    expect(hitEnd(x, o.time, 0.25)).toBeLessThanOrEqual(0.25);
  });

  it("cuts the model's window around an onset", () => {
    const x = Float32Array.from({ length: 8000 }, (_, i) => i);
    const w = hitWindow(x, 0.01);
    expect(w).toHaveLength(3200);
    expect(w[0]).toBe(0); // 20 ms before 10 ms: padded
    expect(w[320]).toBe(160);
  });
});

describe("resample", () => {
  it("keeps a sine's level and frequency, and removes what's above the new Nyquist", () => {
    const from = 48000;
    const sine = (f: number) =>
      Float32Array.from({ length: from }, (_, i) => Math.sin((2 * Math.PI * f * i) / from));
    const y = resample(sine(1000), from);
    expect(y.length).toBe(MODEL_RATE);
    let peak = 0;
    for (let i = 1000; i < y.length - 1000; i++) peak = Math.max(peak, Math.abs(y[i]));
    expect(peak).toBeGreaterThan(0.97);
    expect(peak).toBeLessThan(1.03);
    expect(Math.abs(y[4000] - Math.sin((2 * Math.PI * 1000 * 4000) / MODEL_RATE))).toBeLessThan(
      0.03,
    );
    const high = resample(sine(12000), from);
    let rest = 0;
    for (let i = 1000; i < high.length - 1000; i++) rest = Math.max(rest, Math.abs(high[i]));
    expect(rest).toBeLessThan(0.05);
  });
});

describe("calibration", () => {
  it("leaves the model alone without prototypes and leans on them as examples grow", () => {
    const logits = [2, 0, 0];
    expect(blend(logits, [1, 0], null)).toEqual(softmax(logits));
    const ex = (label: number, v: number[], n: number) =>
      Array.from({ length: n }, () => ({ embedding: v, label }));
    // the model says class 0; your examples of class 1 look exactly like this hit
    const few = prototypes([...ex(0, [0, 1], 1), ...ex(1, [1, 0], 1)], 3);
    const many = prototypes([...ex(0, [0, 1], 20), ...ex(1, [1, 0], 20)], 3);
    const p1 = blend(logits, [1, 0], few);
    const p2 = blend(logits, [1, 0], many);
    expect(p1[0]).toBeGreaterThan(p1[1]);
    expect(p2[1]).toBeGreaterThan(p2[0]);
    expect(p2.reduce((a, b) => a + b)).toBeCloseTo(1);
  });
});

describe("dataset format", () => {
  it("round-trips hits.csv, quotes and all", () => {
    const rows = [
      { file: "kick, take 1.wav", start: 0.1, end: 0.3, label: "kick" as const, voice: "Jeroen" },
      { file: 'say "hi".wav', start: 1.25, end: 1.5, label: undefined, voice: "Ann" },
    ];
    const back = fromCsv(toCsv(rows));
    expect(back).toEqual(rows);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reads classes from names", () => {
    expect(classFromName("kick2.wav")).toBe("kick");
    expect(classFromName("Open hat")).toBe("openhat");
    expect(classFromName("hh_c")).toBe("hihat");
    expect(classFromName("hihat1")).toBe("hihat");
    expect(classFromName("snap.wav")).toBe("clap");
    expect(classFromName("laser")).toBeUndefined();
  });
});

describe("converting a take", () => {
  const bpm = 120;
  const step = 60 / bpm / 4;
  const settings = (over: Partial<ConvertSettings> = {}): ConvertSettings => ({
    ...DEFAULT_CONVERT,
    bpm,
    firstBeat: 0.5,
    ...over,
  });
  // a one-bar beat: kick on 0 and 8, snare on 4 and 12, hats on every even step
  const bar = (b: number, jitter = 0, swap = false): TakeHit[] => {
    const at = (i: number) => 0.5 + (b * 16 + i) * step + jitter;
    const out: TakeHit[] = [];
    for (const i of [0, 8]) out.push({ id: `k${b}.${i}`, start: at(i), label: "kick", peakDb: -3 });
    for (const i of [4, 12])
      out.push({
        id: `s${b}.${i}`,
        start: at(i),
        label: swap && i === 12 ? "kick" : "snare",
        peakDb: -6,
      });
    for (let i = 0; i < 16; i += 2)
      out.push({ id: `h${b}.${i}`, start: at(i) + 0.003, label: "hihat", peakDb: -20 });
    return out;
  };

  it("snaps to the grid and folds four bars into one", () => {
    const hits = [0, 1, 2, 3].flatMap((b) => bar(b, b % 2 ? 0.012 : -0.008, b === 2));
    const r = convert(hits, settings());
    expect(r.bars).toBe(1);
    expect(r.repeats).toBe(4);
    const p = r.pages[0];
    const on = (c: keyof typeof p) => p[c]!.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    expect(on("kick")).toEqual([0, 8]);
    expect(on("snare")).toEqual([4, 12]);
    expect(on("hihat")).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(p.kick![0]!.nudge).toBe(0);
    // the kick that bar 3 played instead of a snare is flagged
    expect(r.flagged).toEqual(["s2.12"]);
    // detected velocity: kicks loudest, hats quiet
    expect(p.kick![0]!.velocity).toBeCloseTo(1);
    expect(p.hihat![2]!.velocity).toBeCloseTo(0.35);
  });

  it("keeps the feel as nudge, or every bar as pages, with constant velocity", () => {
    const hits = [0, 1].flatMap((b) => bar(b, 0.025));
    const feel = convert(hits, settings({ timing: "feel", strength: 1 }));
    expect(feel.pages[0].kick![0]!.nudge).toBeCloseTo(0.2, 1);
    const half = convert(hits, settings({ timing: "feel", strength: 0.5 }));
    expect(half.pages[0].kick![0]!.nudge).toBeCloseTo(0.1, 1);
    const all = convert(
      hits,
      settings({ repeats: "all", bars: 1, velocity: "constant", constant: 0.7 }),
    );
    expect(all.pages).toHaveLength(2);
    expect(all.pages[1].snare![4]!.velocity).toBe(0.7);
  });

  it("drops quiet hits and excluded classes, and finds the tempo of a free take", () => {
    const hits = bar(0).concat([{ id: "q", start: 0.5 + 3 * step, label: "kick", peakDb: -70 }]);
    const r = convert(hits, settings({ include: { ...DEFAULT_CONVERT.include, hihat: false } }));
    expect(r.dropped).toContain("q");
    expect(r.pages[0].hihat).toBeUndefined();
    const free = bar(0)
      .concat(bar(1))
      .map((h) => ({ ...h, start: h.start * (120 / 97) }));
    const g = detectGrid(free.map((h) => h.start).sort((a, b) => a - b));
    expect(g.bpm).toBeCloseTo(97, 0);
  });
});
