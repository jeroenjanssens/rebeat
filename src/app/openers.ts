/** Opening panels for things (a sample in the editor, a track in the piano roll). */
import { sampleName } from "../library/library";
import { openPanel } from "./layouts";
import { dock } from "./shell";

/** One sample editor tab per sample, reused when it's already open (D31). */
export function openSampleEditor(sampleId: string) {
  const api = dock.api;
  if (!api) return;
  const id = `sample-editor:${sampleId}`;
  const existing = api.getPanel(id);
  if (existing) return existing.api.setActive();
  const anchor =
    api.getPanel("sample-editor") ?? api.panels.find((p) => p.id.startsWith("sample-editor:"));
  api.addPanel({
    id,
    component: "sample-editor",
    title: sampleName(sampleId),
    params: { sampleId },
    minimumHeight: 160,
    ...(anchor
      ? { position: { referencePanel: anchor.id, direction: "within" as const } }
      : { position: { direction: "below" as const } }),
  });
}

export function focusPanel(component: string) {
  if (dock.api) openPanel(dock.api, component);
}
