import { useEffect, useRef } from "react";
import { onFrame } from "../render/raf";
import { token } from "../render/theme";
import { useCanvas } from "../render/useCanvas";

interface Props {
  /** Current level(s), 0..1; two values draw a stereo meter. */
  read: (now: number) => number | [number, number];
  width?: number;
  height?: number;
  title?: string;
}

/** Horizontal level meter with peak hold, driven by the shared frame loop. */
export function LevelMeter({ read, width = 72, height = 10, title }: Props) {
  const state = useRef({ levels: [0, 0], peaks: [0, 0], peakAt: [0, 0], idle: false });
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number) => {
    const s = state.current;
    ctx.clearRect(0, 0, w, h);
    const rows = 2;
    const rh = (h - 1) / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * (rh + 1);
      ctx.fillStyle = token("pad-bg");
      ctx.fillRect(0, y, w, rh);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#22c55e");
      grad.addColorStop(0.72, "#eab308");
      grad.addColorStop(1, "#ef4444");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, s.levels[r] * w, rh);
      if (s.peaks[r] > 0.01 && now - s.peakAt[r] < 1500) {
        ctx.fillStyle = token("text");
        ctx.fillRect(Math.min(w - 1.5, s.peaks[r] * w), y, 1.5, rh);
      }
    }
  };

  const { ref, size } = useCanvas(
    (ctx, { width: w, height: h }) => draw(ctx, w, h, performance.now()),
    [],
  );

  useEffect(
    () =>
      onFrame((now) => {
        const s = state.current;
        const v = readRef.current(now);
        const [l, r] = Array.isArray(v) ? v : [v, v];
        [l, r].forEach((x, i) => {
          s.levels[i] = Math.max(x, s.levels[i] * 0.85);
          if (x >= s.peaks[i] || now - s.peakAt[i] > 1500) {
            s.peaks[i] = x;
            s.peakAt[i] = now;
          }
        });
        const idle = s.levels[0] < 0.002 && s.levels[1] < 0.002 && s.peaks[0] < 0.01;
        if (idle && s.idle) return;
        s.idle = idle;
        const ctx = ref.current?.getContext("2d");
        const { width: w, height: h, dpr } = size.current;
        if (!ctx || !w) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(ctx, w, h, now);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <canvas ref={ref} title={title} className="block rounded-sm" style={{ width, height }} />;
}
