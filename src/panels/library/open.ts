/**
 * Opening a library sound in its editor (double-click, or the right-click menu): samples in the
 * sample editor, synths in the synth editor, other instruments in the Inspector.
 */
import { openSampleEditor, openSynthEditor, focusPanel } from "../../app/openers";
import { toast } from "../../components/Toast";
import { getBuffer } from "../../engine/samples";
import type { CatalogInstrument } from "../../library/instruments";
import { isBuiltIn, saveVersion } from "../../library/library";
import type { Track } from "../../model/types";
import { useStore } from "../../state/store";
import { addInstrumentTrack } from "../../state/trackActions";

/** Which editor an instrument opens in. */
export function editorOf(c: CatalogInstrument): "synth" | "sample" | "inspector" {
  if (c.source.source === "synth") return "synth";
  if (c.source.source === "sampler" && c.source.sampleId && !c.source.zones?.length)
    return "sample";
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
  const i = t.instrument;
  if (t.kind !== "instrument" || !i) return false;
  if (c.id.startsWith("user:")) return i.from === c.id;
  return !i.from && i.source === c.source.source && i.preset === c.source.preset;
}

/**
 * Open an instrument in its editor. Editors work on a track: the selected one if it plays this
 * instrument, else another that does, else a new track with it.
 */
export function openInstrument(c: CatalogInstrument) {
  if (editorOf(c) === "sample") return openSampleEditor(c.source.sampleId!);
  const s = useStore.getState();
  const selected = s.project.tracks.find((t) => t.id === s.selectedTrackId);
  const track =
    (selected && plays(selected, c) ? selected : undefined) ??
    s.project.tracks.find((t) => plays(t, c));
  const id = track?.id ?? addInstrumentTrack(c);
  s.setUi({ selectedTrackId: id });
  if (editorOf(c) === "synth") openSynthEditor(id);
  else focusPanel("inspector");
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
