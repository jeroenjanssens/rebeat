/**
 * Make a wavetable from a sample or a WAV file (D246): cut it into single cycles of its pitch,
 * into even slices, or read it as the wavetable it already is; choose the part it's cut from and
 * how many frames; see the frames as you go; save it to Your tables.
 */
import { useMemo, useState } from "react";
import { create } from "zustand";
import { Dialog } from "../components/Dialog";
import { toast } from "../components/Toast";
import { TablePicture } from "../panels/synth-editor/wavetable";
import { FRAME, clmFrameSize, cutTable, mipTable, type CutMode } from "../model/wavetables";
import { detectPitchHz } from "../library/pitch";
import { decodeWav } from "../library/wav";
import { saveWavetable } from "../library/wavetables";
import { noteName } from "../model/notes";

interface Request {
  audio: Float32Array;
  sampleRate: number;
  name: string;
  /** A wavetable file's frame size (from its clm chunk), if it said. */
  frameSize?: number;
  onSaved?: (id: string, name: string) => void;
}

export const useWavetableDialog = create<{ req: Request | null }>(() => ({ req: null }));

const mono = (b: AudioBuffer) => {
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const ch = b.getChannelData(c);
    for (let i = 0; i < b.length; i++) out[i] += ch[i] / b.numberOfChannels;
  }
  return out;
};

/** Open the dialog for a library sample. */
export async function wavetableFromSample(
  sampleId: string,
  name: string,
  onSaved?: Request["onSaved"],
) {
  const { loadSample } = await import("../library/library");
  const buf = await loadSample(sampleId);
  if (!buf) return toast("Couldn't read that sample", "error");
  useWavetableDialog.setState({
    req: { audio: mono(buf), sampleRate: buf.sampleRate, name, onSaved },
  });
}

/** Open the dialog for a file: a WAV as it is (no resampling), anything else decoded. */
export async function wavetableFromFile(file: File, onSaved?: Request["onSaved"]) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.replace(/\.[^.]+$/, "");
  const wav = decodeWav(bytes);
  if (wav) {
    const frameSize = clmFrameSize(bytes) ?? undefined;
    return useWavetableDialog.setState({
      req: { audio: wav.data, sampleRate: wav.sampleRate, name, frameSize, onSaved },
    });
  }
  try {
    const { audioContext } = await import("../engine/context");
    const buf = await audioContext().decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);
    useWavetableDialog.setState({
      req: { audio: mono(buf), sampleRate: buf.sampleRate, name, onSaved },
    });
  } catch {
    toast(`Couldn't read ${file.name}`, "error");
  }
}

const COUNTS = [8, 16, 32, 64, 128, 256];

export function WavetableDialog() {
  const req = useWavetableDialog((s) => s.req);
  return (
    <Dialog
      open={!!req}
      onOpenChange={(o) => !o && useWavetableDialog.setState({ req: null })}
      title="Make a wavetable"
      width={520}
    >
      {req && <Maker key={req.name + req.audio.length} req={req} />}
    </Dialog>
  );
}

function Maker({ req }: { req: Request }) {
  const { audio, sampleRate } = req;
  // a file that already is a wavetable reads as one
  const isTable = !!req.frameSize || (audio.length % FRAME === 0 && audio.length >= FRAME * 2);
  const hz = useMemo(
    () => detectPitchHz(audio, sampleRate, { minHz: 30, maxHz: 2000 }),
    [audio, sampleRate],
  );
  const [mode, setMode] = useState<CutMode>(isTable ? "file" : hz ? "cycles" : "slices");
  const [count, setCount] = useState(64);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(1);
  const [smooth, setSmooth] = useState(true);
  const [name, setName] = useState(req.name);
  const [position, setPosition] = useState(0);
  const [saving, setSaving] = useState(false);
  const frames = useMemo(
    () =>
      cutTable(audio, {
        mode,
        start: start * audio.length,
        end: end * audio.length,
        count,
        period: hz ? sampleRate / hz : undefined,
        frameSize: req.frameSize ?? FRAME,
        smooth,
      }),
    [audio, mode, start, end, count, hz, sampleRate, smooth, req.frameSize],
  );
  // the frames as a table to look at
  const preview = useMemo(() => mipTable("preview", frames), [frames]);
  const save = async () => {
    setSaving(true);
    try {
      const id = await saveWavetable(name.trim() || req.name, frames);
      toast(`Saved “${name}” to Your tables`);
      req.onSaved?.(id, name);
      useWavetableDialog.setState({ req: null });
    } finally {
      setSaving(false);
    }
  };
  const seg = <T extends string>(
    value: T,
    options: [T, string, boolean?][],
    pick: (v: T) => void,
    hint: string,
  ) => (
    <div className="segmented" data-hint={hint}>
      {options.map(([v, label, disabled]) => (
        <button key={v} data-active={value === v} disabled={disabled} onClick={() => pick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 p-4 text-[12px]" data-testid="wavetable-dialog">
      <div className="flex flex-wrap items-center gap-2">
        {seg(
          mode,
          [
            ["cycles", "Cycles", !hz],
            ["slices", "Even slices"],
            ["file", "Whole file", !isTable],
          ],
          setMode,
          "wt.make.mode",
        )}
        <span className="text-faint">
          {mode === "cycles" && hz
            ? `single cycles of ${noteName(Math.round(69 + 12 * Math.log2(hz / 440)))} (${Math.round(hz)} Hz)`
            : mode === "file"
              ? `${Math.floor(audio.length / (req.frameSize ?? FRAME))} frames of ${req.frameSize ?? FRAME}`
              : hz
                ? ""
                : "no clear pitch: slices"}
        </span>
      </div>
      {mode !== "file" && (
        <div
          className="grid grid-cols-[70px_1fr_40px] items-center gap-x-2 gap-y-1"
          data-hint="wt.make.region"
        >
          <span className="text-dim">From</span>
          <input
            type="range"
            min={0}
            max={0.99}
            step={0.005}
            value={start}
            onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.01))}
            aria-label="From"
          />
          <span className="num text-right">{Math.round(start * 100)}%</span>
          <span className="text-dim">To</span>
          <input
            type="range"
            min={0.01}
            max={1}
            step={0.005}
            value={end}
            onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.01))}
            aria-label="To"
          />
          <span className="num text-right">{Math.round(end * 100)}%</span>
        </div>
      )}
      {mode !== "file" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-dim">Frames</span>
          <select
            className="input !h-6"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            data-hint="wt.make.count"
            aria-label="Frames"
          >
            {COUNTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            className="tool-btn !h-6 border border-line !text-[10.5px]"
            data-active={smooth}
            aria-pressed={smooth}
            onClick={() => setSmooth(!smooth)}
            data-hint="wt.make.smooth"
          >
            Smooth edges
          </button>
          <span className="text-faint">{frames.length} frames</span>
        </div>
      )}
      {frames.length > 0 && (
        <TablePicture
          table={preview}
          tableId="preview"
          name={name}
          position={position}
          color="var(--accent)"
          onChange={setPosition}
          onReset={() => setPosition(0)}
        />
      )}
      <div className="flex items-center gap-2">
        <input
          className="input !h-7 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
          data-testid="wavetable-name"
        />
        <button
          className="hw-btn !min-h-[28px]"
          disabled={saving || !frames.length}
          onClick={() => void save()}
          data-testid="wavetable-save"
        >
          Save to Your tables
        </button>
      </div>
    </div>
  );
}
