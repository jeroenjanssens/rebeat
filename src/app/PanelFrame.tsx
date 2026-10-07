import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { platform } from "../platform";
import { FloatingTransport } from "./FloatingTransport";
import { useShell } from "./shell";

const frames = new Map<string, HTMLElement>();
const PanelIdContext = createContext<string>("");

export const usePanelId = () => useContext(PanelIdContext);

/**
 * Wraps every panel's content: a container-query root and the element that goes full screen
 * in "panel full screen" (with a floating transport inside, so it stays usable).
 */
export function PanelFrame({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const isFullscreen = useShell((s) => s.fullscreen === id);

  useEffect(() => {
    frames.set(id, ref.current!);
    return () => {
      frames.delete(id);
    };
  }, [id]);

  return (
    <PanelIdContext.Provider value={id}>
      <div
        ref={ref}
        data-panel={id}
        className="panel-frame @container relative h-full w-full overflow-hidden bg-panel"
      >
        {children}
        {isFullscreen && <FloatingTransport />}
      </div>
    </PanelIdContext.Provider>
  );
}

export async function togglePanelFullscreen(id: string) {
  const el = frames.get(id);
  if (!el) return;
  if (platform.fullscreen.element() === el) await platform.fullscreen.exit();
  else await platform.fullscreen.enter(el);
}

/** Keep `shell.fullscreen` in sync with the browser (Esc leaves full screen). */
export function trackFullscreen() {
  return platform.fullscreen.onChange(() => {
    const el = platform.fullscreen.element();
    let id: string | null = null;
    if (el === document.documentElement) id = "app";
    else for (const [k, v] of frames) if (v === el) id = k;
    useShell.getState().set({ fullscreen: id });
  });
}
