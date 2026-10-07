import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Dialog } from "../components/Dialog";
import { useSettings } from "../state/settings";
import { eventShortcut, formatKeys, keysFor, useCommands, type Command } from "./commands";
import { useShell } from "./shell";

/** Cheat sheet of all shortcuts; click a shortcut to rebind it. */
export function ShortcutsDialog() {
  const open = useShell((s) => s.shortcutsOpen);
  const set = useShell((s) => s.set);
  const commands = useCommands();
  const overrides = useSettings((s) => s.shortcuts);
  const [filter, setFilter] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const categories = [...new Set(commands.map((c) => c.category))];

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const sc = e.key === "Escape" ? null : eventShortcut(e);
      if (sc) {
        const shortcuts = { ...useSettings.getState().shortcuts };
        // a shortcut belongs to one command: unbind it elsewhere
        for (const c of commands)
          if (c.id !== recording && keysFor(c, shortcuts).includes(sc))
            shortcuts[c.id] = keysFor(c, shortcuts)
              .filter((k) => k !== sc)
              .join(" | ");
        shortcuts[recording] = sc;
        useSettings.getState().set({ shortcuts });
      }
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, commands]);

  const match = (c: Command) =>
    !filter || `${c.category} ${c.title}`.toLowerCase().includes(filter.toLowerCase());

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => set({ shortcutsOpen: o })}
      title="Keyboard shortcuts"
      width={720}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <input
          className="input flex-1"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-hint="app.shortcuts.filter"
        />
        <button
          className="tool-btn border border-line"
          onClick={() => useSettings.getState().set({ shortcuts: {} })}
          disabled={Object.keys(overrides).length === 0}
          data-hint="app.shortcuts.reset"
        >
          <RotateCcw size={12} /> Reset all
        </button>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 md:grid-cols-2">
        {categories.map((cat) => {
          const list = commands.filter((c) => c.category === cat && match(c));
          if (!list.length) return null;
          return (
            <div key={cat}>
              <div className="label mb-1.5">{cat}</div>
              {list.map((c) => {
                const keys = keysFor(c, overrides);
                return (
                  <div key={c.id} className="flex h-7 items-center gap-2 text-[12px]">
                    <span className="flex-1 truncate text-dim">{c.title}</span>
                    <button
                      className="flex items-center gap-1 rounded px-1 hover:bg-surface"
                      title="Click, then press the new shortcut (Esc = cancel)"
                      onClick={() => setRecording(c.id)}
                      data-hint="app.shortcuts.rebind"
                    >
                      {recording === c.id ? (
                        <span className="kbd !text-accent">Press keys…</span>
                      ) : keys.length ? (
                        keys.map((k) => <kbd key={k}>{formatKeys(k)}</kbd>)
                      ) : (
                        <span className="text-[10px] text-faint">—</span>
                      )}
                    </button>
                    {overrides[c.id] !== undefined && (
                      <button
                        className="tool-btn !h-5 !min-w-5 !p-0"
                        title="Reset to default"
                        onClick={() => {
                          const { [c.id]: _, ...rest } = useSettings.getState().shortcuts;
                          useSettings.getState().set({ shortcuts: rest });
                        }}
                        data-hint="app.shortcuts.resetone"
                      >
                        <RotateCcw size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
