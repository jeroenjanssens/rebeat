/**
 * Opening a library sound in its editor (double-click, or the right-click menu): samples in the
 * sample editor, synths in the synth editor, other instruments in the Inspector.
 */
import { openSampleEditor, focusPanel } from "../../app/openers";
import { dock } from "../../app/shell";
import { startLibraryEdit } from "../../library/libraryEdit";
import { toast } from "../../components/Toast";
import { getBuffer } from "../../engine/samples";
import type { CatalogInstrument } from "../../library/instruments";
import { isBuiltIn, saveVersion } from "../../library/library";
import type { Track } from "../../model/types";
import { useStore } from "../../state/store";

/** Which editor an instrument opens in. */
export function editorOf(c: CatalogInstrument): "synth" | "sample" | "inspector" {
  if (c.source.source === "synth") return "synth";
  if (c.source.source === "sample" && c.source.sampleId) return "sample";
  return "inspector";
}

export const editorLabel = (c: CatalogInstrument) =>
  ({
    synth: "Open in synth editor",
    sample: "Open in sample editor",
    inspector: "Open in Inspector",
  })[editorOf(c)];

/** Whether a track plays this library instrument (as it is in the library, or edited from it). */
function plays(t: Track, c: CatalogInstrument) {
  const i = t.sound;
  if (t.mode === "clip" || !i) return false;
  if (c.id.startsWith("user:")) return i.from === c.id;
  return !i.from && i.source === c.source.source && i.preset === c.source.preset;
}

/**
 * Open an instrument in its editor, without adding a track (D91): a synth in the synth editor
 * as the library sound itself; a sampler's sample in the sample editor. Sampled instruments have
 * no editor of their own: their SOUND knobs are in the Inspector of a track that plays them.
 */
export function openInstrument(c: CatalogInstrument) {
  const kind = editorOf(c);
  if (kind === "sample") return openSampleEditor(c.source.sampleId!);
  if (kind === "synth") return openLibrarySynth(c);
  const s = useStore.getState();
  const selected = s.project.tracks.find((t) => t.id === s.selectedTrackId);
  const track =
    (selected && plays(selected, c) ? selected : undefined) ??
    s.project.tracks.find((t) => plays(t, c));
  if (!track)
    return toast(
      `${c.name} has no editor of its own: drag it onto a track, then shape it with the SOUND knobs in the Inspector`,
    );
  s.setUi({ selectedTrackId: track.id });
  focusPanel("inspector");
}

/** A library synth in a synth editor tab of its own. */
function openLibrarySynth(c: CatalogInstrument) {
  const api = dock.api;
  if (!api) return;
  const key = startLibraryEdit(c);
  const id = `synth-editor:lib:${key}`;
  const existing = api.getPanel(id);
  if (existing) return existing.api.setActive();
  const anchor =
    api.panels.find((p) => p.id.startsWith("synth-editor")) ??
    api.getPanel("piano-roll") ??
    api.getPanel("mixer");
  api.addPanel({
    id,
    component: "synth-editor",
    title: `${c.name} · synth`,
    params: { library: key },
    minimumHeight: 200,
    position: anchor
      ? { referencePanel: anchor.id, direction: "within" as const }
      : { direction: "below" as const },
  });
}

/**
 * Open a sample in the sample editor. Built-in sounds can't change, so they're copied into your
 * library first (the same copy each time: copies of identical audio are one sample).
 */
export async function openSample(id: string, name: string) {
  if (!isBuiltIn(id)) return openSampleEditor(id);
  const buf = getBuffer(id);
  if (!buf) return;
  const channels = Array.from({ length: buf.numberOfChannels }, (_, ch) => buf.getChannelData(ch));
  const copy = await saveVersion(channels, buf.sampleRate, name);
  if (!copy) return;
  toast(`“${name}” is built in: editing a copy in your library`);
  openSampleEditor(copy);
}
