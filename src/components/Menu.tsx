import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePortalTarget } from "./portal";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { create } from "zustand";

export interface MenuItem {
  label?: string;
  onSelect?: () => void;
  disabled?: boolean;
  checked?: boolean;
  shortcut?: string;
  separator?: boolean;
  /** Custom content instead of a clickable row. */
  render?: (close: () => void) => ReactNode;
}

interface MenuState {
  open: { x: number; y: number; items: MenuItem[]; minWidth?: number } | null;
  show: (x: number, y: number, items: MenuItem[], minWidth?: number) => void;
  close: () => void;
}

export const useMenu = create<MenuState>()((set) => ({
  open: null,
  show: (x, y, items, minWidth) => set({ open: { x, y, items, minWidth } }),
  close: () => set({ open: null }),
}));

/** Open a context menu at the pointer. */
export function contextMenu(
  e: { clientX: number; clientY: number; preventDefault: () => void },
  items: MenuItem[],
) {
  e.preventDefault();
  useMenu.getState().show(e.clientX, e.clientY, items);
}

/** Open a dropdown below an element. */
export function dropdown(el: HTMLElement, items: MenuItem[]) {
  const r = el.getBoundingClientRect();
  useMenu.getState().show(r.left, r.bottom + 4, items, r.width);
}

export function MenuHost() {
  const { open, close } = useMenu();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const target = usePortalTarget();

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(open.x, window.innerWidth - r.width - 4)),
      y: Math.max(4, open.y + r.height > window.innerHeight - 4 ? open.y - r.height : open.y),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [open, close]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      className="menu"
      style={{ left: pos.x, top: pos.y, minWidth: Math.max(180, open.minWidth ?? 0) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {open.items.map((item, i) => {
        if (item.separator) return <div key={i} className="menu-sep" />;
        if (item.render) return <div key={i}>{item.render(close)}</div>;
        return (
          <button
            key={i}
            className="menu-item"
            disabled={item.disabled}
            onClick={() => {
              close();
              item.onSelect?.();
            }}
          >
            <span className="w-3.5 shrink-0">{item.checked && <Check size={13} />}</span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && <span className="num text-[10px] text-faint">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    target,
  );
}
