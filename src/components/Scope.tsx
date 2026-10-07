import { useEffect, useRef } from "react";
import * as engine from "../mock/engine";
import { onFrame } from "../render/raf";
import { alpha, token } from "../render/theme";
import { useCanvas } from "../render/useCanvas";

interface Props {
  trackId: string;
  color: string;
  meter?: boolean;
  className?: string;
}

const THRESHOLD = 0.012;

/**
 * Per-track oscilloscope + level meter. Draws only while the track makes sound;
 * otherwise it shows a dim, still line and costs nothing.
 */
export function Scope({ trackId, color, meter = true, className = "" }: Props) {
  const state = useRef({ level: 0, peak: 0, peakAt: 0, active: true, phase: 0 });

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
    if (s.level < THRESHOLD) {
      ctx.strokeStyle = token("scope-idle");
      ctx.beginPath();
      ctx.moveTo(3, mid);
      ctx.lineTo(sw - 3, mid);
      ctx.stroke();
    } else {
      ctx.strokeStyle = color;
      ctx.shadowColor = alpha(color, 0.8);
      ctx.shadowBlur = 4;
      ctx.beginPath();
      const n = Math.max(24, Math.floor(sw / 1.5));
      for (let i = 0; i <= n; i++) {
        const x = i / n;
        const y = mid - engine.waveform(trackId, x, s.phase) * s.level * (h / 2 - 2);
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
    [color],
  );

  useEffect(
    () =>
      onFrame((now, dt) => {
        const s = state.current;
        const level = engine.level(trackId, now);
        const peakVisible = s.peak > THRESHOLD && now - s.peakAt < 1300;
        s.level = level;
        if (level >= s.peak || now - s.peakAt > 1200) {
          s.peak = level;
          s.peakAt = now;
        }
        const active = level >= THRESHOLD || peakVisible;
        if (!active && !s.active) return; // idle: nothing to draw
        s.active = active;
        s.phase += dt * 0.0006;
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        const { width, height, dpr } = size.current;
        if (!ctx || !width) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(ctx, width, height, now);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackId, color],
  );

  return <canvas ref={ref} className={`block h-full w-full ${className}`} />;
}
