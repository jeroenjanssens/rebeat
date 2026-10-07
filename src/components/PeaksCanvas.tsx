import { token } from "../render/theme";
import { useCanvas } from "../render/useCanvas";

/** A small waveform from precomputed peaks (0..1). */
export function PeaksCanvas({
  peaks,
  color,
  className = "",
  progress,
}: {
  peaks: ArrayLike<number>;
  color?: string;
  className?: string;
  progress?: number;
}) {
  const { ref } = useCanvas(
    (ctx, { width: w, height: h }) => {
      ctx.clearRect(0, 0, w, h);
      const c = color ?? token("accent");
      const n = peaks.length;
      if (!n) return;
      const mid = h / 2;
      const bar = Math.max(1, w / n);
      for (let i = 0; i < n; i++) {
        const x = (i / n) * w;
        const a = Math.max(0.5, peaks[i] * (mid - 1));
        ctx.globalAlpha = progress !== undefined && i / n < progress ? 1 : 0.75;
        ctx.fillStyle = c;
        ctx.fillRect(x, mid - a, Math.max(1, bar - 0.6), a * 2);
      }
      ctx.globalAlpha = 1;
    },
    [peaks, color, progress],
  );
  return <canvas ref={ref} className={`block ${className}`} />;
}
