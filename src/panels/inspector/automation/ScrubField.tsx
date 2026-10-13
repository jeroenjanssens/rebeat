/**
 * A value in the point table (D201): drag (sideways or up and down) or scroll to change it,
 * click to type it, double-click to reset it. Shift is finer.
 */
import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  axis: "x" | "y";
  /** A drag from where it started: pixels moved (right or up is positive), and Shift. */
  onDrag: (px: number, fine: boolean, key: string) => void;
  /** One notch of the wheel: +1 or −1. */
  onWheel: (dir: 1 | -1, fine: boolean) => void;
  /** Typed text, after Enter or leaving the field; false when it couldn't be read. */
  onType: (text: string) => boolean;
  onReset?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  testId?: string;
  hint?: string;
}

let drags = 0;

export function ScrubField(p: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.text);
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const clickTimer = useRef(0);
  const wheelRef = useRef(p.onWheel);
  useEffect(() => {
    wheelRef.current = p.onWheel;
  });

  // the wheel needs a non-passive listener to keep the list from scrolling
  useEffect(() => {
    const el = ref.current;
    if (!el || editing) return;
    const wheel = (e: WheelEvent) => {
      if (p.disabled) return;
      e.preventDefault();
      wheelRef.current(e.deltaY < 0 || e.deltaX > 0 ? 1 : -1, e.shiftKey);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [editing, p.disabled]);

  if (editing)
    return (
      <input
        autoFocus
        className={`num h-[22px] w-full min-w-0 rounded border bg-surface px-1 text-[11px] text-ink outline-none ${bad ? "border-red-500" : "border-[var(--select)]"} ${p.className ?? ""}`}
        value={draft}
        data-testid={p.testId ? `${p.testId}-input` : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter") {
            if (p.onType(draft)) setEditing(false);
            else setBad(true);
          }
        }}
        onBlur={() => {
          if (draft !== p.text) p.onType(draft);
          setEditing(false);
        }}
      />
    );

  return (
    <span
      ref={ref}
      className={`num flex h-[22px] min-w-0 items-center truncate rounded px-1 text-[11px] ${
        p.disabled ? "text-faint" : "text-ink hover:bg-raised"
      } ${p.axis === "x" ? "cursor-ew-resize" : "cursor-ns-resize"} touch-none ${p.className ?? ""}`}
      title={p.title}
      data-testid={p.testId}
      data-hint={p.hint}
      onPointerDown={(e) => {
        if (p.disabled || e.button !== 0) return;
        e.stopPropagation();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const x0 = e.clientX;
        const y0 = e.clientY;
        const key = `scrub-${++drags}`;
        let moved = false;
        const move = (ev: PointerEvent) => {
          const px = p.axis === "x" ? ev.clientX - x0 : y0 - ev.clientY;
          if (!moved && Math.abs(px) < 3) return;
          moved = true;
          p.onDrag(px, ev.shiftKey, key);
        };
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          if (moved) return;
          // a click types; two click reset (when there's something to reset to)
          if (!p.onReset) return startEditing();
          if (clickTimer.current) {
            clearTimeout(clickTimer.current);
            clickTimer.current = 0;
            p.onReset();
            return;
          }
          clickTimer.current = window.setTimeout(() => {
            clickTimer.current = 0;
            startEditing();
          }, 220);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
    >
      {p.text}
    </span>
  );

  function startEditing() {
    setDraft(p.text);
    setBad(false);
    setEditing(true);
  }
}
