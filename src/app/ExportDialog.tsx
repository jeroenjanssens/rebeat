import { useState } from "react";
import { zipSync } from "fflate";
import { Dialog } from "../components/Dialog";
import { toast } from "../components/Toast";
import { renderProject, timeline } from "../engine/render";
import { saveRecording } from "../library/library";
import { FormatPicker } from "../components/FormatPicker";
import {
  DEFAULT_FORMAT,
  FORMAT_INFO,
  encodeAudio,
  fileName,
  type AudioFormat,
} from "../library/encode";
import { audioBufferChannels } from "../library/wav";
import { exportMidi } from "../model/midiFile";
import { platform } from "../platform";
import { useStore } from "../state/store";
import { addSampleTracks } from "../state/trackActions";
import { useShell } from "./shell";

type Range = "song" | "page";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "export";

/** Export audio (mix or stems), MIDI, or resample into the library. */
export function ExportDialog() {
  const open = useShell((s) => s.exportOpen);
  const set = useShell((s) => s.set);
  const project = useStore((s) => s.project);
  const editSlotId = useStore((s) => s.editSlotId);
  const [range, setRange] = useState<Range>("song");
  const [format, setFormat] = useState<AudioFormat>(DEFAULT_FORMAT);
  const [stems, setStems] = useState(false);
  const [track, setTrack] = useState("");
  const [busy, setBusy] = useState("");
  const { duration } = timeline(project, { range, slotId: editSlotId });
  const name = safe(
    range === "song"
      ? project.name
      : `${project.name} - ${project.patterns[project.slots.find((s) => s.id === editSlotId)?.patternId ?? ""]?.name ?? "page"}`,
  );

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(`${label.replace("…", "")} failed: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy("");
    }
  };

  const exportAudio = () =>
    run("Rendering…", async () => {
      const opts = { range, slotId: editSlotId };
      if (!stems) {
        const buf = await renderProject(project, { ...opts, soloTrackId: track || undefined });
        setBusy("Encoding…");
        await platform.files.save(
          fileName(name, format),
          await encodeAudio(audioBufferChannels(buf), buf.sampleRate, format),
        );
        toast(`Exported ${fileName(name, format)}`);
        return;
      }
      const files: Record<string, Uint8Array> = {};
      const tracks = project.tracks.filter((t) => !t.mute);
      for (const [i, t] of tracks.entries()) {
        setBusy(`Rendering stems ${i + 1}/${tracks.length}…`);
        const buf = await renderProject(project, { ...opts, soloTrackId: t.id });
        const blob = await encodeAudio(audioBufferChannels(buf), buf.sampleRate, format);
        files[fileName(`${String(i + 1).padStart(2, "0")} ${safe(t.name)}`, format)] =
          new Uint8Array(await blob.arrayBuffer());
      }
      const zip = zipSync(
        Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: 0 }]])),
      );
      await platform.files.save(
        `${name} stems.zip`,
        new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
      );
      toast(`Exported ${tracks.length} stems`);
    });

  const exportMid = () =>
    run("Writing MIDI…", async () => {
      const bytes = exportMidi(project, range, editSlotId);
      await platform.files.save(
        `${name}.mid`,
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/midi" }),
      );
      toast(`Exported ${name}.mid`);
    });

  const resample = (asTrack: boolean) =>
    run("Resampling…", async () => {
      const buf = await renderProject(project, {
        range,
        slotId: editSlotId,
        soloTrackId: track || undefined,
        tail: 0,
      });
      const label = track
        ? project.tracks.find((t) => t.id === track)?.name
        : range === "song"
          ? project.name
          : "Page";
      const id = await saveRecording(
        audioBufferChannels(buf),
        buf.sampleRate,
        `${label} resampled`,
        project.bpm,
      );
      if (!id) return;
      if (asTrack) addSampleTracks([id]);
      toast(
        asTrack ? "Resampled into a new audio track" : "Resampled into the library (Recordings)",
      );
    });

  return (
    <Dialog open={open} onOpenChange={(o) => set({ exportOpen: o })} title="Export" width={520}>
      <div className="flex flex-col gap-3 p-4 text-[12px]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented" data-hint="app.export.range">
            <button data-active={range === "song"} onClick={() => setRange("song")}>
              Song
            </button>
            <button data-active={range === "page"} onClick={() => setRange("page")}>
              Current page
            </button>
          </div>
          <span className="num text-dim">{duration.toFixed(1)} s</span>
        </div>
        <label className="flex items-center gap-2">
          <span className="label w-16">Source</span>
          <select
            className="input flex-1"
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            disabled={stems}
            data-hint="app.export.source"
          >
            <option value="">Full mix (master)</option>
            {project.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                Track: {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label w-16">Format</span>
          <FormatPicker value={format} onChange={setFormat} />
          <label className="flex items-center gap-1.5 text-dim" data-hint="app.export.stems">
            <input type="checkbox" checked={stems} onChange={(e) => setStems(e.target.checked)} />{" "}
            Stems (one file per track)
          </label>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <button
            className="hw-btn"
            disabled={!!busy}
            onClick={exportAudio}
            data-testid="export-wav"
            data-hint="app.export.wav"
          >
            {stems ? "Export stems" : `Export ${FORMAT_INFO[format.kind].label}`}
          </button>
          <button
            className="hw-btn"
            disabled={!!busy}
            onClick={exportMid}
            data-testid="export-midi"
            data-hint="app.export.midi"
          >
            Export MIDI
          </button>
          <button
            className="tool-btn border border-line"
            disabled={!!busy}
            onClick={() => resample(false)}
            title="Render into a new library sample"
            data-hint="app.export.resamplelib"
          >
            Resample to library
          </button>
          <button
            className="tool-btn border border-line"
            disabled={!!busy}
            onClick={() => resample(true)}
            title="Render into a new audio track"
            data-hint="app.export.resampletrack"
          >
            Resample to track
          </button>
        </div>
        {busy && <div className="text-accent">{busy}</div>}
        <p className="text-[10.5px] leading-snug text-faint">
          Rendering runs offline, faster than real time. Sampled instruments that haven't been
          downloaded yet are downloaded first.
        </p>
      </div>
    </Dialog>
  );
}
