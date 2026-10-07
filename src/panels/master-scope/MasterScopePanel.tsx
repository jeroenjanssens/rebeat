import { useEffect, useRef, useState } from "react";
import { Snowflake } from "lucide-react";
import * as engine from "../../engine/engine";
import { onFrame } from "../../render/raf";
import { alpha, token } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";

type Mode = "overlay" | "mono" | "xy" | "spectrum";
const WINDOWS = [5, 10, 20, 50, 100, 180];

const MODES: { id: Mode; label: string }[] = [
  { id: "overlay", label: "L/R" },
  { id: "mono", label: "Mono" },
  { id: "xy", label: "X-Y" },
  { id: "spectrum", label: "Spectrum" },
];

function toHex(color: string) {
  return color.startsWith("#") ? color : "#7dd3fc";
}

/** One big oscilloscope of what you hear (after the master chain, without the metronome). */
export function MasterScopePanel() {
  const [mode, setMode] = useState<Mode>("overlay");
  const [windowMs, setWindowMs] = useState(20);
  const [frozen, setFrozen] = useState(false);
  const [trail, setTrail] = useState(0.4);
  const [brightness, setBrightness] = useState(1);
  const readout = useRef<HTMLSpanElement>(null);
  const opts = useRef({ mode, windowMs, frozen, trail, brightness });
  useEffect(() => {
    opts.current = { mode, windowMs, frozen, trail, brightness };
  });

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const o = opts.current;
    const data = engine.masterWaveform();
    const bg = token("scope-bg");
    // persistence: fade the previous frame instead of clearing it
    ctx.globalAlpha = 1 - o.trail;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = alpha(toHex(token("text-faint")), 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    if (o.mode === "xy") {
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
    }
    ctx.stroke();
    if (!data) return;
    const [l, r] = data;
    const cl = toHex(token("accent"));
    const cr = toHex(token("lit"));
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 6 * o.brightness;

    if (o.mode === "spectrum") {
      const a = engine.masterAnalysers();
      const bins = new Float32Array(a[0].frequencyBinCount);
      const nyquist = a[0].context.sampleRate / 2;
      [0, 1].forEach((c) => {
        a[c].getFloatFrequencyData(bins);
        ctx.strokeStyle = alpha(c ? cr : cl, Math.min(1, 0.8 * o.brightness));
        ctx.shadowColor = c ? cr : cl;
        ctx.beginPath();
        for (let x = 0; x < w; x += 2) {
          const f = 20 * Math.pow(nyquist / 20, x / w);
          const db = bins[Math.min(bins.length - 1, Math.round((f / nyquist) * bins.length))];
          const y = h - ((Math.max(-100, db) + 100) / 100) * h;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
      return;
    }

    const sr = engine.masterAnalysers()[0].context.sampleRate;
    const span = Math.min(l.length / 2, Math.round((o.windowMs / 1000) * sr));
    if (o.mode === "xy") {
      ctx.strokeStyle = alpha(cl, Math.min(1, 0.7 * o.brightness));
      ctx.shadowColor = cl;
      ctx.beginPath();
      const s = Math.min(w, h) / 2 - 4;
      for (let i = l.length - span; i < l.length; i++) {
        // mid/side orientation: mono is vertical, wide stereo spreads sideways
        const x = w / 2 + ((l[i] - r[i]) / Math.SQRT2) * s;
        const y = h / 2 - ((l[i] + r[i]) / Math.SQRT2) * s;
        if (i === l.length - span) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      return;
    }

    // trigger lock on a rising zero crossing, so periodic sounds stand still
    let start = l.length - span * 2;
    for (let i = start + 1; i < l.length - span; i++)
      if (l[i - 1] <= 0 && l[i] > 0) {
        start = i;
        break;
      }
    const trace = (get: (i: number) => number, color: string) => {
      ctx.strokeStyle = alpha(color, Math.min(1, 0.85 * o.brightness));
      ctx.shadowColor = color;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const i = start + Math.floor((x / w) * (span - 1));
        const y = h / 2 - get(i) * (h / 2 - 4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    if (o.mode === "mono") trace((i) => (l[i] + r[i]) / 2, cl);
    else {
      trace((i) => l[i], cl);
      trace((i) => r[i], cr);
    }
    ctx.shadowBlur = 0;
  };

  const { ref, size } = useCanvas((ctx, { width, height }) => draw(ctx, width, height), [mode]);

  useEffect(() => {
    let lastText = 0;
    let rmsAcc = 0;
    return onFrame((now) => {
      const o = opts.current;
      const data = engine.masterWaveform();
      if (data && readout.current) {
        // short-term loudness: RMS of the last ~190 ms, smoothed
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < data[0].length; i++) {
          const m = (data[0][i] + data[1][i]) / 2;
          sum += m * m;
          peak = Math.max(peak, Math.abs(data[0][i]), Math.abs(data[1][i]));
        }
        const rms = Math.sqrt(sum / data[0].length);
        rmsAcc = rmsAcc * 0.8 + rms * 0.2;
        if (now - lastText > 250) {
          lastText = now;
          const db = (v: number) => (v < 1e-5 ? "−∞" : (20 * Math.log10(v)).toFixed(1));
          readout.current.textContent = `RMS ${db(rmsAcc)} dB · Peak ${db(peak)} dB`;
        }
      }
      if (o.frozen) return;
      const ctx = ref.current?.getContext("2d");
      const { width, height, dpr } = size.current;
      if (!ctx || !width) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, width, height);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col" data-testid="master-scope">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-2 py-1.5">
        <div className="segmented" data-hint="scope.mode">
          {MODES.map((m) => (
            <button key={m.id} data-active={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {mode !== "spectrum" && (
          <select
            className="input !h-6 !text-[11px]"
            value={windowMs}
            onChange={(e) => setWindowMs(Number(e.target.value))}
            title="Time window"
            data-hint="scope.window"
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w} ms
              </option>
            ))}
          </select>
        )}
        <button
          className="tool-btn"
          data-active={frozen}
          onClick={() => setFrozen(!frozen)}
          title="Freeze"
          data-hint="scope.freeze"
        >
          <Snowflake size={13} />
        </button>
        <label className="flex items-center gap-1" title="Trail" data-hint="scope.trail">
          <span className="label">Trail</span>
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={trail}
            onChange={(e) => setTrail(Number(e.target.value))}
            className="w-14 accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center gap-1" title="Brightness" data-hint="scope.brightness">
          <span className="label">Glow</span>
          <input
            type="range"
            min={0.3}
            max={2}
            step={0.1}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="w-14 accent-[var(--accent)]"
          />
        </label>
        <span ref={readout} className="num ml-auto text-[10.5px] text-dim" data-testid="loudness" />
      </div>
      <div className="min-h-0 flex-1 p-1.5" data-hint="scope.display">
        <div className="relative h-full w-full">
          <canvas ref={ref} className="absolute inset-0 block h-full w-full rounded" />
        </div>
      </div>
    </div>
  );
}
