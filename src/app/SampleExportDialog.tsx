import { useState } from "react";
import { Dialog } from "../components/Dialog";
import { FormatPicker } from "../components/FormatPicker";
import { toast } from "../components/Toast";
import { getBuffer } from "../engine/samples";
import { DEFAULT_FORMAT, encodeAudio, fileName, type AudioFormat } from "../library/encode";
import { isBuiltIn, loadSample, sampleName, useLibrary } from "../library/library";
import { audioBufferChannels } from "../library/wav";
import { platform } from "../platform";
import { db } from "../storage/db";
import { useShell } from "./shell";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "sample";
const EXT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/aiff": "aiff",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
};

/** Download a sample as WAV, MP3 or OGG, as heard (with its editor settings) or the stored file. */
export function SampleExportDialog() {
  const id = useShell((s) => s.sampleExport);
  const set = useShell((s) => s.set);
  const record = useLibrary((s) => s.samples.find((x) => x.id === id));
  const [format, setFormat] = useState<AudioFormat>(DEFAULT_FORMAT);
  const [source, setSource] = useState<"heard" | "original">("heard");
  const [busy, setBusy] = useState(false);
  const builtIn = !!id && isBuiltIn(id);
  const original = source === "original" && !builtIn;
  const name = safe(sampleName(id ?? "").replace(/\.[a-z0-9]{2,4}$/i, ""));

  const run = async () => {
    if (!id) return;
    setBusy(true);
    try {
      if (original) {
        const blob = (await db.blobs.get(id))?.blob;
        if (!blob) throw new Error("the stored file is missing");
        await platform.files.save(`${name}.${EXT[blob.type] ?? "wav"}`, blob);
      } else {
        const buf = getBuffer(id) ?? (await loadSample(id));
        if (!buf) throw new Error("the sample couldn't be loaded");
        await platform.files.save(
          fileName(name, format),
          await encodeAudio(audioBufferChannels(buf), buf.sampleRate, format),
        );
      }
      toast(`Exported ${name}`);
      set({ sampleExport: null });
    } catch (e) {
      toast(`Export failed: ${e instanceof Error ? e.message : e}`, "error");
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => !o && set({ sampleExport: null })}
      title={`Export ${sampleName(id ?? "")}`}
      width={460}
    >
      <div className="flex flex-col gap-3 p-4 text-[12px]" data-testid="sample-export">
        {!builtIn && (
          <div className="flex items-center gap-2">
            <span className="label w-16">Audio</span>
            <div className="segmented" data-hint="app.sampleexport.source">
              <button data-active={source === "heard"} onClick={() => setSource("heard")}>
                As heard
              </button>
              <button data-active={source === "original"} onClick={() => setSource("original")}>
                Original file
              </button>
            </div>
          </div>
        )}
        {original ? (
          <p className="text-dim">
            The file as it's stored
            {record ? ` (${record.mime.replace("audio/", "").toUpperCase()})` : ""}, without the
            sample editor's settings.
          </p>
        ) : (
          <div className="flex items-start gap-2">
            <span className="label mt-1.5 w-16">Format</span>
            <FormatPicker value={format} onChange={setFormat} />
          </div>
        )}
        <div className="flex justify-end border-t border-line pt-3">
          <button
            className="hw-btn"
            disabled={busy}
            onClick={run}
            data-testid="sample-export-run"
            data-hint="app.sampleexport.run"
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
