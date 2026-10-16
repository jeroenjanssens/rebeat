import { Suspense, useEffect, useRef } from "react";
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
import { installHints } from "./hintLayer";
import { applyPreset, openPanel, restoreLayout, saveLayout } from "./layouts";
import { PanelFrame, togglePanelFullscreen } from "./PanelFrame";
import { PANELS, panelDef } from "./panels";
import { dock, useShell } from "./shell";
import { focusKeysEditor, forgetKeysEditor } from "../state/keys";
import { toast } from "../components/Toast";

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
        <Suspense fallback={<div className="p-4 text-[12px] text-faint">Loading…</div>}>
          <def.component params={props.params ?? {}} />
        </Suspense>
      </PanelFrame>
    ),
  ]),
);

/** A panel's tab: its icon (D101), its title, and close. Editor tabs share their panel's icon. */
function Tab(props: IDockviewPanelHeaderProps) {
  const Icon = panelDef(props.api.component)?.icon;
  return (
    <div className="flex h-full items-center">
      {Icon && (
        <span className="pl-2.5 pr-1.5 text-dim" data-testid="tab-icon">
          <Icon size={12} />
        </span>
      )}
      <DockviewDefaultTab
        {...props}
        onDoubleClick={() => toggleMaximize()}
        title="Double-click to maximize"
      />
    </div>
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
          data-hint="app.panel.popout"
        >
          <ExternalLink size={12} />
        </button>
      )}
      <button
        className="tool-btn !h-6 !min-w-6 !p-0"
        title="Panel full screen (Ctrl/Cmd+Shift+Enter)"
        onClick={() => activePanel && togglePanelFullscreen(activePanel.id)}
        data-hint="app.panel.fullscreen"
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
          data-hint="app.panel.maximize"
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
    if (!restoreLayout(api)) {
      applyPreset(api, "compose");
    } else {
      // saved layouts keep the titles they had: a renamed panel (Controller → Keys) takes its new one
      for (const p of api.panels) {
        const def = panelDef(p.id);
        if (def && p.title !== def.title) p.api.setTitle(def.title);
      }
      // Offer to add the new Keys panel (the Keys panel then) to a saved layout that doesn't have it yet.
      const TOAST_KEY = "rebeat.controller-panel-offered";
      const hasController = api.panels.some((p) => p.id === "controller");
      const hasPerform = api.panels.some((p) => p.id === "performance");
      if (!hasController && hasPerform && !localStorage.getItem(TOAST_KEY)) {
        localStorage.setItem(TOAST_KEY, "1");
        setTimeout(() => {
          toast("New: Keys panel added. Open it via Panels → Keys.");
          openPanel(api, "controller", { referencePanel: "performance", direction: "below" });
        }, 1000);
      }
    }
    const active = api.activePanel?.id;
    if (active?.startsWith("synth-editor")) focusKeysEditor(active);
    let timer = 0;
    const subs = [
      // the keys can follow the synth editor you're in (D132)
      // (the editor in focus: the synth editor panel activated last, while it's open)
      api.onDidActivePanelChange(({ panel }) => {
        if (panel?.id.startsWith("synth-editor")) focusKeysEditor(panel.id);
      }),
      api.onDidRemovePanel((panel) => forgetKeysEditor(panel.id)),
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
        const offHints = installHints(win);
        win.addEventListener("pagehide", () => {
          mo.disconnect();
          off();
          offHints();
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
      popoutUrl={`${import.meta.env.BASE_URL}popout.html`}
    />
  );
}
