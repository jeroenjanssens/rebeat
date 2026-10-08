/** Opening panels for things (a sample in the editor, a track in the piano roll). */
import { sampleName } from "../library/library";
import { openPanel } from "./layouts";
import { useStore } from "../state/store";
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

/** The guide, optionally at a section ("mixing", "pad-view"…); opens to the right. */
export function openGuide(anchor?: string) {
  const api = dock.api;
  if (!api) return;
  const params = { anchor, nonce: Date.now() };
  const existing = api.getPanel("guide");
  if (existing) {
    existing.api.updateParameters(params);
    return existing.api.setActive();
  }
  api.addPanel({
    id: "guide",
    component: "guide",
    title: "Guide",
    params,
    minimumWidth: 360,
    initialWidth: Math.min(640, Math.round(api.width * 0.4)),
    position: { direction: "right" },
  });
}

/** The synth editor for a track (selecting it). */
export function openSynthEditor(trackId: string) {
  useStore.getState().setUi({ selectedTrackId: trackId });
  const api = dock.api;
  if (!api) return;
  if (api.getPanel("synth-editor")) return focusPanel("synth-editor");
  // next to the sample editor and piano roll, below the drum machine
  const anchor = api.getPanel("piano-roll") ?? api.getPanel("mixer");
  openPanel(
    api,
    "synth-editor",
    anchor ? { referencePanel: anchor.id, direction: "within" } : { direction: "below" },
  );
}
