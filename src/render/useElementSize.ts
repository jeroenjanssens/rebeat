import { type RefObject, useState, useEffect } from "react";

/** Track an element's content-rect size via ResizeObserver, deferred a frame to avoid RO loop errors. */
export function useElementSize(ref: RefObject<Element | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(([e]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setSize({ width: e.contentRect.width, height: e.contentRect.height }),
      );
    });
    if (ref.current) ro.observe(ref.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref]);
  return size;
}
