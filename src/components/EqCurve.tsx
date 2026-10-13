/**
 * The Parametric EQ's curve (D216): the six bands' response added up in dB, from the same knob
 * values the engine uses (the RBJ biquad formulas Web Audio's filters follow).
 */
import { EFFECT_PARAMS, FX_UNIT, toUnit } from "../model/params";

const FS = 48000;
const W = 300;
const H = 64;
const RANGE = 18;

type Coeffs = [number, number, number, number, number, number];

function biquad(type: string, f0: number, q: number, gainDb: number): Coeffs {
  const w0 = (2 * Math.PI * Math.min(f0, FS / 2 - 1)) / FS;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  switch (type) {
    case "lowpass":
    case "highpass": {
      // Web Audio's Q for these is a resonance in dB
      const alpha = sin / (2 * Math.pow(10, q / 20));
      const s = type === "lowpass" ? 1 - cos : 1 + cos;
      const b1 = type === "lowpass" ? s : -s;
      return [s / 2, b1, s / 2, 1 + alpha, -2 * cos, 1 - alpha];
    }
    case "peaking": {
      const alpha = sin / (2 * q);
      return [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
    }
    default: {
      // shelves with a slope of 1, as Web Audio's
      const alpha = (sin / 2) * Math.SQRT2;
      const k = 2 * Math.sqrt(A) * alpha;
      if (type === "lowshelf")
        return [
          A * (A + 1 - (A - 1) * cos + k),
          2 * A * (A - 1 - (A + 1) * cos),
          A * (A + 1 - (A - 1) * cos - k),
          A + 1 + (A - 1) * cos + k,
          -2 * (A - 1 + (A + 1) * cos),
          A + 1 + (A - 1) * cos - k,
        ];
      return [
        A * (A + 1 + (A - 1) * cos + k),
        -2 * A * (A - 1 + (A + 1) * cos),
        A * (A + 1 + (A - 1) * cos - k),
        A + 1 - (A - 1) * cos + k,
        2 * (A - 1 - (A + 1) * cos),
        A + 1 - (A - 1) * cos - k,
      ];
    }
  }
}

function magnitudeDb([b0, b1, b2, a0, a1, a2]: Coeffs, f: number): number {
  const w = (2 * Math.PI * f) / FS;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** The curve's level at `f` Hz, in dB. */
export function eqResponse(params: Record<string, number>, f: number): number {
  return eqBands(params).reduce((s, b) => s + magnitudeDb(b, f), 0);
}

function eqBands(params: Record<string, number>): Coeffs[] {
  const v = (id: string) =>
    params[id] ?? EFFECT_PARAMS["Parametric EQ"].find((d) => d.id === id)!.default;
  const db = toUnit.db(-15, 15);
  const bands: Coeffs[] = [
    biquad("highpass", FX_UNIT.lowCut(v("lowCut")) ?? 1, Math.SQRT1_2, 0),
    biquad("lowshelf", toUnit.hz(v("lowFreq")), 1, db(v("lowGain"))),
    biquad("peaking", toUnit.hz(v("p1Freq")), FX_UNIT.eqQ(v("p1Q")), db(v("p1Gain"))),
    biquad("peaking", toUnit.hz(v("p2Freq")), FX_UNIT.eqQ(v("p2Q")), db(v("p2Gain"))),
    biquad("highshelf", toUnit.hz(v("highFreq")), 1, db(v("highGain"))),
    biquad("lowpass", FX_UNIT.highCut(v("highCut")) ?? FS / 2, Math.SQRT1_2, 0),
  ];
  return bands;
}

export function EqCurve({ params, color }: { params: Record<string, number>; color?: string }) {
  const bands = eqBands(params);
  const points: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const f = 20 * Math.pow(1000, i / 120);
    const total = bands.reduce((s, b) => s + magnitudeDb(b, f), 0);
    const y = H / 2 - (Math.max(-RANGE, Math.min(RANGE, total)) / RANGE) * (H / 2 - 2);
    points.push(`${((i / 120) * W).toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-1.5 mt-1.5 block h-16 w-[calc(100%-12px)] rounded bg-display"
      preserveAspectRatio="none"
      data-testid="eq-curve"
      data-hint="fx.Parametric EQ"
    >
      {[100, 1000, 10000].map((f) => {
        const x = (Math.log(f / 20) / Math.log(1000)) * W;
        return <line key={f} x1={x} x2={x} y1={0} y2={H} stroke="var(--border)" />;
      })}
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--border-strong)" />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color ?? "var(--accent)"}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
