import { useEffect, useRef } from "react";
import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { Expand, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { installKeyboard } from "./commands";
import { applyPreset, restoreLayout, saveLayout } from "./layouts";
import { PanelFrame, togglePanelFullscreen } from "./PanelFrame";
import { PANELS } from "./panels";
import { dock, useShell } from "./shell";

const theme: DockviewTheme = {
  name: "rebeat",
  className: "dockview-theme-rebeat",
  gap: 4,
  dndOverlayMounting: "absolute",
  dndPanelOverlay: "group",
};

const components = Object.fromEntries(
  PANELS.map((def) => [
    def.id,
    (props: IDockviewPanelProps) => (
      <PanelFrame id={props.api.id}>
        <def.component params={props.params ?? {}} />
      </PanelFrame>
    ),
  ]),
);

function Tab(props: IDockviewPanelHeaderProps) {
  return (
    <DockviewDefaultTab
      {...props}
      onDoubleClick={() => toggleMaximize()}
      title="Double-click to maximize"
    />
  );
}

function HeaderActions({ group, activePanel, containerApi }: IDockviewHeaderActionsProps) {
  const maximized = useShell((s) => s.maximized);
  const isMax = maximized && containerApi.hasMaximizedGroup() && group.api.isMaximized();
  const inPopout = group.api.location.type === "popout";
  return (
    <div className="flex h-full items-center gap-0.5 pr-1">
      {!inPopout && (
        <button
          className="tool-btn !h-6 !min-w-6 !p-0"
          title="Pop out into a new window"
          onClick={() => activePanel && containerApi.addPopoutGroup(activePanel)}
        >
          <ExternalLink size={12} />
        </button>
      )}
      <button
        className="tool-btn !h-6 !min-w-6 !p-0"
        title="Panel full screen (Ctrl/Cmd+Shift+Enter)"
        onClick={() => activePanel && togglePanelFullscreen(activePanel.id)}
      >
        <Expand size={12} />
      </button>
      {!inPopout && (
        <button
          className="tool-btn !h-6 !min-w-6 !p-0"
          title={isMax ? "Restore (Ctrl/Cmd+Shift+M)" : "Maximize (Ctrl/Cmd+Shift+M)"}
          onClick={() => {
            if (isMax) containerApi.exitMaximizedGroup();
            else if (activePanel) containerApi.maximizeGroup(activePanel);
          }}
        >
          {isMax ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      )}
    </div>
  );
}

export function toggleMaximize() {
  const api = dock.api;
  if (!api) return;
  if (api.hasMaximizedGroup()) api.exitMaximizedGroup();
  else if (api.activePanel) api.maximizeGroup(api.activePanel);
}

export function Dock() {
  const cleanup = useRef<(() => void)[]>([]);

  useEffect(
    () => () => {
      cleanup.current.forEach((fn) => fn());
      dock.api = null;
    },
    [],
  );

  const onReady = ({ api }: DockviewReadyEvent) => {
    dock.api = api;
    if (!restoreLayout(api)) applyPreset(api, "compose");
    let timer = 0;
    const subs = [
      api.onDidLayoutChange(() => {
        clearTimeout(timer);
        timer = window.setTimeout(() => saveLayout(api), 400);
      }),
      api.onDidMaximizedGroupChange(() =>
        useShell.getState().set({ maximized: api.hasMaximizedGroup() }),
      ),
      // pop-out windows: same theme, same shortcuts
      api.onDidAddPopoutGroup(({ window: win }) => {
        const sync = () => {
          const src = document.documentElement;
          const dst = win.document.documentElement;
          dst.dataset.theme = src.dataset.theme;
          dst.style.cssText = src.style.cssText;
        };
        sync();
        const mo = new MutationObserver(sync);
        mo.observe(document.documentElement, { attributes: true });
        const off = installKeyboard(win);
        win.addEventListener("pagehide", () => {
          mo.disconnect();
          off();
        });
      }),
    ];
    cleanup.current.push(() => subs.forEach((s) => s.dispose()));
  };

  return (
    <DockviewReact
      className="h-full"
      theme={theme}
      components={components}
      defaultTabComponent={Tab}
      rightHeaderActionsComponent={HeaderActions}
      onReady={onReady}
      popoutUrl="/popout.html"
    />
  );
}
