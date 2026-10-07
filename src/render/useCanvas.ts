import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { onThemeChange } from "./theme";

export interface CanvasSize {
  width: number; // CSS pixels
  height: number;
  dpr: number;
}

/**
 * A canvas that follows its container size (ResizeObserver) and stays sharp on high-DPI screens.
 * `draw` runs on resize, on theme change, and whenever `deps` change; call the returned
 * `redraw` from animation loops.
 */
export function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, size: CanvasSize) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<CanvasSize>({ width: 0, height: 0, dpr: 1 });
  const drawRef = useRef(draw);
  useLayoutEffect(() => {
    drawRef.current = draw;
  });

  const redraw = useCallback(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || sizeRef.current.width === 0) return;
    const { dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRef.current(ctx, sizeRef.current);
  }, []);

  useEffect(() => {
    const canvas = ref.current!;
    let raf = 0;
    // resize on the next frame: changing the canvas inside the observer can cause RO loop errors
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dpr = window.devicePixelRatio || 1;
        sizeRef.current = { width, height, dpr };
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        redraw();
      });
    });
    ro.observe(canvas);
    const off = onThemeChange(redraw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      off();
    };
  }, [redraw]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(redraw, deps);

  return { ref, redraw, size: sizeRef };
}
