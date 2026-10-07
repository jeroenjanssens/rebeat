/** Layout presets and per-user layout persistence. */
import type { AddPanelOptions, DockviewApi, SerializedDockview } from "dockview-react";
import { platform } from "../platform";
import { panelDef } from "./panels";

export type LayoutPreset = "compose" | "perform" | "edit";

export const LAYOUT_PRESETS: { id: LayoutPreset; label: string }[] = [
  { id: "compose", label: "Compose" },
  { id: "perform", label: "Perform" },
  { id: "edit", label: "Edit" },
];

const KEY = "rebeat.layout";

type Position = AddPanelOptions["position"];

/** Add a single-instance panel (or focus it when it's already open). */
export function openPanel(api: DockviewApi, component: string, position?: Position) {
  const existing = api.getPanel(component);
  if (existing) {
    existing.api.setActive();
    return existing;
  }
  const def = panelDef(component);
  return api.addPanel({
    id: component,
    component,
    title: def?.title ?? component,
    minimumWidth: def?.minWidth,
    minimumHeight: def?.minHeight,
    ...(position ? { position } : {}),
  } as AddPanelOptions);
}

export function applyPreset(api: DockviewApi, preset: LayoutPreset) {
  api.clear();
  const width = api.width || window.innerWidth;
  const height = api.height || window.innerHeight;
  if (preset === "compose") {
    openPanel(api, "drum-machine");
    openPanel(api, "library", { referencePanel: "drum-machine", direction: "left" });
    openPanel(api, "inspector", { referencePanel: "drum-machine", direction: "right" });
    openPanel(api, "mixer", { referencePanel: "drum-machine", direction: "below" });
    openPanel(api, "sample-editor", { referencePanel: "mixer", direction: "within" });
    openPanel(api, "piano-roll", { referencePanel: "mixer", direction: "within" });
    api.getPanel("library")?.api.setSize({ width: Math.round(width * 0.17) });
    api.getPanel("inspector")?.api.setSize({ width: Math.round(width * 0.19) });
    api.getPanel("mixer")?.api.setSize({ height: Math.round(height * 0.26) });
    api.getPanel("mixer")?.api.setActive();
  } else if (preset === "perform") {
    openPanel(api, "drum-machine");
    openPanel(api, "performance", { referencePanel: "drum-machine", direction: "right" });
    openPanel(api, "master-scope", { referencePanel: "performance", direction: "below" });
    api.getPanel("performance")?.api.setSize({ width: Math.round(width * 0.36) });
    api.getPanel("master-scope")?.api.setSize({ height: Math.round(height * 0.3) });
  } else {
    openPanel(api, "sample-editor");
    openPanel(api, "library", { referencePanel: "sample-editor", direction: "left" });
    openPanel(api, "inspector", { referencePanel: "sample-editor", direction: "right" });
    openPanel(api, "drum-machine", { referencePanel: "sample-editor", direction: "below" });
    api.getPanel("library")?.api.setSize({ width: Math.round(width * 0.2) });
    api.getPanel("inspector")?.api.setSize({ width: Math.round(width * 0.2) });
    api.getPanel("drum-machine")?.api.setSize({ height: Math.round(height * 0.45) });
  }
  api.getPanel("drum-machine")?.api.setActive();
}

export function saveLayout(api: DockviewApi) {
  platform.kv.set(KEY, JSON.stringify(api.toJSON()));
}

export function restoreLayout(api: DockviewApi): boolean {
  const raw = platform.kv.get(KEY);
  if (!raw) return false;
  try {
    api.fromJSON(JSON.parse(raw) as SerializedDockview);
    return api.panels.length > 0;
  } catch {
    return false;
  }
}
