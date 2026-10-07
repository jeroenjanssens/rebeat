import { useEffect, useRef } from "react";
import * as engine from "../engine/engine";
import { onFrame } from "../render/raf";
import { alpha, token } from "../render/theme";
import { useCanvas } from "../render/useCanvas";

interface Props {
  trackId: string;
  color: string;
  meter?: boolean;
  className?: string;
  mode?: "wave" | "spectrum";
}

const THRESHOLD = 0.012;

/** Index of a rising zero crossing in the first half, so the waveform stands still. */
export function triggerIndex(w: Float32Array, span: number): number {
  const limit = Math.max(1, w.length - span);
  for (let i = 1; i < limit; i++) if (w[i - 1] <= 0 && w[i] > 0) return i;
  return 0;
}

/**
 * Per-track oscilloscope + level meter. Draws only while the track makes sound;
 * otherwise it shows a dim, still line and costs nothing.
 */
export function Scope({ trackId, color, meter = true, className = "", mode = "wave" }: Props) {
  const state = useRef({ level: 0, peak: 0, peakAt: 0, active: true });

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number) => {
    const s = state.current;
    const meterW = meter ? 4 : 0;
    const sw = w - (meter ? meterW + 4 : 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = token("scope-bg");
    ctx.beginPath();
    ctx.roundRect(0, 0, sw, h, 3);
    ctx.fill();

    const mid = h / 2;
    ctx.lineWidth = 1.25;
    const wave = s.level >= THRESHOLD ? engine.waveform(trackId) : null;
    const spec = wave && mode === "spectrum" ? engine.spectrum(trackId) : null;
    if (spec) {
      // log-frequency bars from 30 Hz
      ctx.fillStyle = color;
      const bars = Math.max(16, Math.floor(sw / 4));
      for (let b = 0; b < bars; b++) {
        const f0 = 30 * Math.pow(20000 / 30, b / bars);
        const bin = Math.min(spec.length - 1, Math.round((f0 / 22050) * spec.length));
        const v = Math.max(0, (spec[bin] + 90) / 90);
        const bh = v * (h - 4);
        ctx.fillRect(3 + (b / bars) * (sw - 6), h - 2 - bh, Math.max(1, (sw - 6) / bars - 1), bh);
      }
    } else if (!wave) {
      ctx.strokeStyle = token("scope-idle");
      ctx.beginPath();
      ctx.moveTo(3, mid);
      ctx.lineTo(sw - 3, mid);
      ctx.stroke();
    } else {
      const span = Math.floor(wave.length / 2);
      const start = triggerIndex(wave, span);
      // scale quiet signals up a little so the shape stays readable
      const gain = Math.min(4, 0.9 / Math.max(0.05, s.peak));
      ctx.strokeStyle = color;
      ctx.shadowColor = alpha(color, 0.8);
      ctx.shadowBlur = 4;
      ctx.beginPath();
      const n = Math.max(24, Math.floor(sw / 1.5));
      for (let i = 0; i <= n; i++) {
        const x = i / n;
        const v = wave[start + Math.floor(x * (span - 1))] * gain;
        const y = mid - Math.max(-1, Math.min(1, v)) * (h / 2 - 2);
        if (i === 0) ctx.moveTo(3 + x * (sw - 6), y);
        else ctx.lineTo(3 + x * (sw - 6), y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    if (meter) {
      const mx = w - meterW;
      ctx.fillStyle = token("pad-bg");
      ctx.fillRect(mx, 0, meterW, h);
      const lh = s.level * h;
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, "#22c55e");
      grad.addColorStop(0.7, "#eab308");
      grad.addColorStop(1, "#ef4444");
      ctx.fillStyle = grad;
      ctx.fillRect(mx, h - lh, meterW, lh);
      if (s.peak > THRESHOLD && now - s.peakAt < 1200) {
        ctx.fillStyle = token("text");
        ctx.fillRect(mx, h - s.peak * h, meterW, 1.5);
      }
    }
  };

  const { ref, size } = useCanvas(
    (ctx, { width, height }) => draw(ctx, width, height, performance.now()),
    [color, mode],
  );

  useEffect(
    () =>
      onFrame((now) => {
        const s = state.current;
        const level = engine.level(trackId);
        const peakVisible = s.peak > THRESHOLD && now - s.peakAt < 1300;
        s.level = Math.max(level, s.level * 0.8);
        if (level >= s.peak || now - s.peakAt > 1200) {
          s.peak = level;
          s.peakAt = now;
        }
        const active = s.level >= THRESHOLD || peakVisible;
        if (!active && !s.active) return; // idle: nothing to draw
        s.active = active;
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        const { width, height, dpr } = size.current;
        if (!ctx || !width) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(ctx, width, height, now);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackId, color, mode],
  );

  // the canvas is out of the layout flow: its default size must never stretch the row it's in
  return (
    <div className={`relative h-full w-full ${className}`}>
      <canvas ref={ref} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
