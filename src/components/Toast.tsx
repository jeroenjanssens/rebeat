import { create } from "zustand";
import { usePortalTarget } from "./portal";
import { createPortal } from "react-dom";

interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

const useToasts = create<{ list: Toast[] }>()(() => ({ list: [] }));
let next = 1;

/** Show a short message at the bottom of the window. */
export function toast(text: string, kind: Toast["kind"] = "info", ms = 2600) {
  const id = next++;
  useToasts.setState((s) => ({ list: [...s.list.slice(-3), { id, text, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), ms);
}

export function ToastHost() {
  const list = useToasts((s) => s.list);
  const target = usePortalTarget();
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          className="rounded-lg border px-3.5 py-2 text-[12px] shadow-2xl"
          style={{
            background: "var(--raised)",
            borderColor: t.kind === "error" ? "#ef4444" : "var(--border-strong)",
            color: t.kind === "error" ? "#fca5a5" : "var(--text)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>,
    target,
  );
}
