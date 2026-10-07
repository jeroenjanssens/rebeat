import { useEffect, useRef } from "react";
import { onFrame } from "../render/raf";
import { token } from "../render/theme";
import { useCanvas } from "../render/useCanvas";

/** Vertical level meter (one or two channels) with peak hold, on the shared frame loop. */
export function VMeter({
  read,
  width = 8,
  height = 140,
}: {
  read: () => number | [number, number];
  width?: number;
  height?: number;
}) {
  const st = useRef({ lv: [0, 0], pk: [0, 0], at: [0, 0], idle: false });
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number) => {
    const s = st.current;
    ctx.clearRect(0, 0, w, h);
    const cw = (w - 1) / 2;
    for (let c = 0; c < 2; c++) {
      const x = c * (cw + 1);
      ctx.fillStyle = token("pad-bg");
      ctx.fillRect(x, 0, cw, h);
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, "#22c55e");
      g.addColorStop(0.72, "#eab308");
      g.addColorStop(1, "#ef4444");
      ctx.fillStyle = g;
      const lh = s.lv[c] * h;
      ctx.fillRect(x, h - lh, cw, lh);
      if (s.pk[c] > 0.01 && now - s.at[c] < 1500) {
        ctx.fillStyle = s.pk[c] >= 0.99 ? "#ef4444" : token("text");
        ctx.fillRect(x, h - s.pk[c] * h, cw, 1.5);
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
        const s = st.current;
        const r = readRef.current();
        const [l, rr] = Array.isArray(r) ? r : [r, r];
        [l, rr].forEach((x, i) => {
          s.lv[i] = Math.max(x, s.lv[i] * 0.88);
          if (x >= s.pk[i] || now - s.at[i] > 1500) {
            s.pk[i] = x;
            s.at[i] = now;
          }
        });
        const idle = s.lv[0] < 0.002 && s.lv[1] < 0.002 && s.pk[0] < 0.01 && s.pk[1] < 0.01;
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
  return <canvas ref={ref} style={{ width, height }} className="block" />;
}
