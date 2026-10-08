/**
 * The synth editor's pictures (§0.6e F): envelopes you can drag (times, sustain and curves) and
 * LFO shapes. They draw what the engine plays (envCurve is shared with engine/synth/core.ts).
 */
import { useRef } from "react";
import { envCurve, noteLengthQuarters, type Env, type Lfo } from "../../model/synth";

export const W = 230;
export const H = 56;
const TOP = 4;
const BOTTOM = H - 4;
const span = BOTTOM - TOP;

type Point = "a" | "d" | "r" | "ac" | "dc";

/**
 * An envelope's shape with draggable points: attack, decay/sustain and release, plus the curves
 * (drag the dot in the middle of the attack or the decay up or down). Hold is drawn, not dragged.
 */
export function EnvelopeView({
  env,
  color,
  onChange,
  hint,
}: {
  env: Env;
  color: string;
  onChange: (e: Partial<Env>, key: string) => void;
  hint: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ point: Point; key: string; y: number; c: number } | null>(null);
  // times on a log scale (up to 10 s), so short and long envelopes both show
  const seg = W / 3.6;
  const L = Math.log(1 + 10 / 0.005);
  const tx = (t: number) => (Math.log(1 + Math.min(t, 10) / 0.005) / L) * seg;
  const fromX = (x: number) => Math.max(0.001, 0.005 * (Math.exp((Math.max(0, x) / seg) * L) - 1));
  const y = (v: number) => BOTTOM - v * span;
  const a = tx(env.attack);
  const h = a + tx(env.hold);
  const d = h + tx(env.decay);
  const s = env.sustain;
  const hold = d + seg * 0.5;
  const r = hold + tx(env.release);

  // the shape, sampled along each segment
  const pts: string[] = [];
  const along = (x0: number, x1: number, v: (t: number) => number) => {
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(`${x0 + (x1 - x0) * t},${y(v(t))}`);
    }
  };
  along(0, a, (t) => envCurve(t, env.attackCurve));
  if (env.hold > 0) along(a, h, () => 1);
  along(h, d, (t) => 1 + (s - 1) * envCurve(t, -env.curve));
  along(d, hold, () => s);
  along(hold, r, (t) => s * (1 - envCurve(t, -env.curve)));
  const attackMid = { x: a / 2, y: y(envCurve(0.5, env.attackCurve)) };
  const decayMid = { x: (h + d) / 2, y: y(1 + (s - 1) * envCurve(0.5, -env.curve)) };

  const move = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const py = ((e.clientY - box.top) / box.height) * H;
    const next: Partial<Env> = {};
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    // curves: down = slower, up = faster
    const bend = clamp(g.c + ((py - g.y) / span) * 2, -1, 1);
    if (g.point === "a") next.attack = Math.min(10, fromX(px));
    if (g.point === "d") {
      next.decay = Math.min(10, fromX(px - h));
      next.sustain = clamp((BOTTOM - py) / span, 0, 1);
    }
    if (g.point === "r") next.release = Math.min(15, fromX(px - hold));
    if (g.point === "ac") next.attackCurve = bend;
    if (g.point === "dc") next.curve = -bend;
    onChange(next, g.key);
  };
  const handle = (point: Point, x: number, cy: number, small = false) => (
    <circle
      cx={x}
      cy={cy}
      r={small ? 3 : 4}
      fill={small ? "var(--surface, #222)" : color}
      stroke={color}
      strokeWidth={small ? 1.5 : 0}
      className={small ? "cursor-ns-resize" : "cursor-grab"}
      data-point={point}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const box = ref.current!.getBoundingClientRect();
        drag.current = {
          point,
          key: `env-${point}-${performance.now()}`,
          y: ((e.clientY - box.top) / box.height) * H,
          c: point === "ac" ? env.attackCurve : -env.curve,
        };
      }}
      onDoubleClick={() =>
        point === "ac"
          ? onChange({ attackCurve: 0 }, `env-${point}-reset`)
          : point === "dc"
            ? onChange({ curve: 0.5 }, `env-${point}-reset`)
            : undefined
      }
    />
  );
  return (
    <svg
      ref={ref}
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="touch-none rounded bg-display"
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      data-hint={hint}
      data-testid="envelope-view"
    >
      <polyline
        points={`${pts.join(" ")} ${r},${BOTTOM} 0,${BOTTOM}`}
        fill={`color-mix(in oklab, ${color} 18%, transparent)`}
        stroke="none"
      />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
      {env.loop && (
        <path
          d={`M ${d} ${y(s) - 6} Q ${d / 2} ${TOP - 6} 2 ${TOP + 4}`}
          fill="none"
          stroke={color}
          strokeDasharray="2 2"
          opacity={0.6}
        />
      )}
      {handle("ac", attackMid.x, attackMid.y, true)}
      {handle("dc", decayMid.x, decayMid.y, true)}
      {handle("a", a, y(1))}
      {handle("d", d, y(s))}
      {handle("r", r, BOTTOM)}
    </svg>
  );
}

/** -1..1 for a phase (cycles); the random shapes follow a fixed made-up sequence. */
function lfoAt(shape: Lfo["shape"], t: number): number {
  const p = t - Math.floor(t);
  const cycle = Math.floor(t);
  const frac = (x: number) => x - Math.floor(x);
  const r = (n: number) => frac(Math.sin(n * 12.9898 + 4.1414) * 43758.5453) * 2 - 1;
  switch (shape) {
    case "sine":
      return Math.sin(2 * Math.PI * p);
    case "triangle":
      return 1 - 4 * Math.abs(p - 0.5);
    case "rampUp":
      return 2 * p - 1;
    case "rampDown":
      return 1 - 2 * p;
    case "square":
      return p < 0.5 ? 1 : -1;
    case "sh":
      return r(cycle);
    case "smooth":
      return r(cycle - 1) + (r(cycle) - r(cycle - 1)) * (0.5 - 0.5 * Math.cos(Math.PI * p));
  }
}

/**
 * An LFO's movement over about two seconds (or two cycles, when slower): its shape, where it
 * starts (phase), how it fades in (delay), and whether it swings both ways or only up.
 */
export function LfoView({ lfo, color, bpm }: { lfo: Lfo; color: string; bpm: number }) {
  const hz = lfo.sync ? bpm / 60 / noteLengthQuarters(lfo.sync) : lfo.rate;
  // show 2 seconds, but at least 1 and at most 8 cycles
  const cycles = Math.min(8, Math.max(1, hz * 2));
  const seconds = cycles / hz;
  const n = 240;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const fade = lfo.delay > 0 ? Math.min(1, (t * seconds) / lfo.delay) : 1;
    let v = lfoAt(lfo.shape, lfo.phase + t * cycles) * fade;
    if (lfo.unipolar) v = (v * 0.5 + 0.5) * fade;
    const mid = lfo.unipolar ? BOTTOM : H / 2;
    const amp = lfo.unipolar ? span : span / 2;
    return `${t * W},${mid - v * amp}`;
  });
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="rounded bg-display"
      data-hint="synth.lfo.view"
      data-testid="lfo-view"
    >
      <line
        x1={0}
        x2={W}
        y1={lfo.unipolar ? BOTTOM : H / 2}
        y2={lfo.unipolar ? BOTTOM : H / 2}
        stroke="rgba(255,255,255,0.1)"
      />
      {lfo.delay > 0 && (
        <line
          x1={Math.min(W, (lfo.delay / seconds) * W)}
          x2={Math.min(W, (lfo.delay / seconds) * W)}
          y1={TOP}
          y2={BOTTOM}
          stroke="rgba(255,255,255,0.15)"
          strokeDasharray="2 2"
        />
      )}
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
      <text x={W - 4} y={H - 5} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.4)">
        {seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(1)} s`}
      </text>
    </svg>
  );
}
