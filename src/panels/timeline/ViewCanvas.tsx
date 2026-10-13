/**
 * A canvas that covers only the visible part of a timeline row: long songs at a high zoom would
 * need canvases wider than browsers allow. It sits at the scroll position and draws the content
 * from `left` to `left + width` (CSS pixels of the row).
 */
import { useLayoutEffect, useRef } from "react";
import { onThemeChange } from "../../render/theme";

export interface View {
  left: number;
  width: number;
}

export function ViewCanvas({
  view,
  height,
  draw,
  deps,
  className = "",
}: {
  view: View;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, left: number, width: number) => void;
  deps: unknown[];
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  const viewRef = useRef({ view, height });
  useLayoutEffect(() => {
    drawRef.current = draw;
    viewRef.current = { view, height };
  });
  // reads the latest view: the theme listener outlives renders
  const paint = () => {
    const { view, height } = viewRef.current;
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || view.width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(view.width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, height);
    ctx.translate(-view.left, 0);
    drawRef.current(ctx, view.left, view.width);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(paint, [view.left, view.width, height, ...deps]);

  useLayoutEffect(() => onThemeChange(paint), []);
  return (
    <canvas
      ref={ref}
      className={`pointer-events-none absolute top-0 ${className}`}
      style={{ left: view.left, width: view.width, height }}
    />
  );
}
