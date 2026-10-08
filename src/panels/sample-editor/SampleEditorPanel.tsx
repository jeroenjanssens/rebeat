import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Play, Redo2, Repeat, Square, Undo2 } from "lucide-react";
import { useShell } from "../../app/shell";
import { openSampleEditor } from "../../app/openers";
import { DragValue } from "../../components/DragValue";
import { EffectEditor } from "../../components/EffectEditor";
import { toast } from "../../components/Toast";
import { audioContext } from "../../engine/context";
import { audioNow } from "../../engine/engine";
import { toAudioBuffer } from "../../engine/recorder";
import { detectBpm, detectKey, detectOnsets, loudness, toMono } from "../../library/analysis";
import {
  copyRange,
  cropRange,
  cutRange,
  gridMarkers,
  pasteAt,
  silenceRange,
  sliceSteps,
  slicesFromMarkers,
  stripSilence,
  type Channels,
} from "../../library/editorOps";
import { stft } from "../../library/fft";
import {
  applySettings,
  replaceAudio,
  saveVersion,
  updateSample,
  useLibrary,
} from "../../library/library";
import { renderSettings, stretchOffline, type FadeCurve } from "../../library/processing";
import { renderWithEffects } from "../../library/renderFx";
import { makeEffect } from "../../model/effects";
import { pitchClassName } from "../../model/notes";
import { EFFECT_TYPES } from "../../model/params";
import { slotPattern } from "../../model/project";
import { STEP_SIZE_QUARTERS, type Effect, type StepLane } from "../../model/types";
import type { PanelProps } from "../../app/panels";
import { token } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import { useSettings } from "../../state/settings";
import { useStore } from "../../state/store";
import { addSampleTracks } from "../../state/trackActions";
import { useEditor, type Editor } from "./useEditor";
import { Waveform } from "./Waveform";

type Tab = "edit" | "envelope" | "tune" | "loop" | "slice" | "fx" | "analyze";
const TABS: { id: Tab; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "envelope", label: "Envelope" },
  { id: "tune", label: "Tune" },
  { id: "loop", label: "Loop" },
  { id: "slice", label: "Slice" },
  { id: "fx", label: "FX" },
  { id: "analyze", label: "Analyze" },
];

/** One clipboard for all editor tabs. */
let clipboard: Channels | null = null;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[11.5px]">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Check({
  label,
  value,
  onChange,
  title,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  hint?: string;
}) {
  return (
    <button
      className="tool-btn border border-line !text-[10.5px]"
      data-active={value}
      onClick={() => onChange(!value)}
      title={title}
      data-hint={hint}
    >
      {label}
    </button>
  );
}

const CURVES: FadeCurve[] = ["linear", "exp", "log", "scurve"];

export function SampleEditorPanel({ params }: PanelProps) {
  const sampleId = params.sampleId as string | undefined;
  if (!sampleId)
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-faint">
        Double-click a sample in the library to edit it here (one tab per sample).
      </div>
    );
  return <SampleEditor key={sampleId} sampleId={sampleId} />;
}

function SampleEditor({ sampleId }: { sampleId: string }) {
  const editor = useEditor(sampleId);
  const [tab, setTab] = useState<Tab>("edit");
  const [snap, setSnap] = useState(true);
  const [view, setView] = useState<"wave" | "spectrum">("wave");
  const [loopPlay, setLoopPlay] = useState(false);
  const [busy, setBusy] = useState("");
  const tracks = useStore((s) => s.project.tracks);
  const usage = useMemo(
    () =>
      tracks.filter(
        (t) =>
          t.sampleId === sampleId ||
          t.instrument?.sampleId === sampleId ||
          t.layers?.some((l) => l.sampleId === sampleId),
      ),
    [tracks, sampleId],
  );

  const sel = editor.selection;
  const { sampleRate: sr, source, settings } = editor;

  // ---------- playback ----------
  const player = useRef<{
    src: AudioBufferSourceNode;
    start: number;
    from: number;
    rate: number;
    length: number;
    loop: boolean;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const stop = useCallback(() => {
    try {
      player.current?.src.stop();
    } catch {
      // not playing
    }
    player.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);

  const playBuffer = (buf: AudioBuffer, from: number, rate: number) => {
    stop();
    const ctx = audioContext();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loopPlay;
    const g = ctx.createGain();
    g.gain.value = useSettings.getState().previewVolume;
    src.connect(g).connect(ctx.destination);
    src.start();
    src.onended = () => player.current?.src === src && stop();
    player.current = { src, start: audioNow(), from, rate, length: buf.duration, loop: loopPlay };
    setPlaying(true);
  };

  const play = async () => {
    if (playing) return stop();
    if (sel && sel.end - sel.start > 0.005) {
      // the selection plays as it is, without the settings
      playBuffer(toAudioBuffer(copyRange(source, sr, sel.start, sel.end), sr), sel.start, 1);
      return;
    }
    const processed = await renderSettings(toAudioBuffer(source, sr), settings);
    const tune = settings.keepLength
      ? 1
      : Math.pow(2, (settings.tuneSemis + settings.tuneCents / 100) / 12);
    playBuffer(processed, settings.trimStart, tune / settings.stretch);
  };

  const playhead = useCallback(() => {
    const p = player.current;
    if (!p) return null;
    let t = audioNow() - p.start;
    if (p.loop) t %= p.length;
    else if (t > p.length) return null;
    return p.from + t * p.rate;
  }, []);

  // keyboard: space plays, Cmd+Z/Shift+Cmd+Z undo here, Cmd+X/C/V on the selection
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, select")) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const run = (fn: () => void) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    if (e.code === "Space") run(play);
    else if (mod && k === "z") run(e.shiftKey ? editor.redo : editor.undo);
    else if (mod && k === "c" && sel)
      run(() => (clipboard = copyRange(source, sr, sel.start, sel.end)));
    else if (mod && k === "x" && sel) run(() => cut());
    else if (mod && k === "v" && clipboard) run(() => paste());
    else if ((e.key === "Delete" || e.key === "Backspace") && sel) run(() => cut());
    else if (e.key === "Escape") run(() => editor.setSelection(null));
  };

  const cut = () => {
    if (!sel) return;
    clipboard = copyRange(source, sr, sel.start, sel.end);
    editor.replaceSource(cutRange(source, sr, sel.start, sel.end), { trimStart: 0, trimEnd: null });
    editor.setSelection(null);
  };
  const paste = () => {
    if (!clipboard) return;
    const at = sel?.start ?? playhead() ?? 0;
    editor.replaceSource(pasteAt(source, sr, at, clipboard), { trimStart: 0, trimEnd: null });
  };

  // ---------- saving ----------
  const apply = async () => {
    setBusy("Applying…");
    try {
      // in place: audio edits replace the sample's audio, settings are stored on it
      if (editor.sourceDirty) await replaceAudio(sampleId, source, sr, settings);
      else await applySettings(sampleId, settings);
      editor.markSaved();
      toast(
        usage.length ? `Applied to ${usage.length} track${usage.length > 1 ? "s" : ""}` : "Applied",
      );
    } finally {
      setBusy("");
    }
  };

  const saveAsNew = async () => {
    setBusy("Saving…");
    try {
      const processed = await renderSettings(toAudioBuffer(source, sr), settings);
      const chans = Array.from({ length: processed.numberOfChannels }, (_, c) =>
        processed.getChannelData(c),
      );
      const id = await saveVersion(chans, sr, `${editor.name} edit`, sampleId);
      if (id) {
        toast("Saved as a new sample");
        openSampleEditor(id);
      }
    } finally {
      setBusy("");
    }
  };

  if (!editor.ready) return <div className="p-4 text-[12px] text-faint">Loading…</div>;

  return (
    <div
      className="flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="sample-editor"
    >
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
        <span className="label max-w-[180px] truncate !text-ink" title={editor.name}>
          {editor.name}
        </span>
        <span className="text-[10.5px] text-faint">
          {editor.duration.toFixed(2)} s ·{" "}
          {usage.length
            ? `Used by ${usage.length} track${usage.length > 1 ? "s" : ""}`
            : "Not used in this project"}
        </span>
        <span className="flex-1" />
        <button
          className="tool-btn"
          onClick={play}
          title={sel ? "Play the selection (Space)" : "Play with the settings (Space)"}
          data-testid="editor-play"
          data-hint="editor.play"
        >
          {playing ? (
            <Square size={12} fill="currentColor" />
          ) : (
            <Play size={12} fill="currentColor" />
          )}
        </button>
        <button
          className="tool-btn"
          data-active={loopPlay}
          onClick={() => setLoopPlay(!loopPlay)}
          title="Loop playback"
          data-hint="editor.loop"
        >
          <Repeat size={13} />
        </button>
        <div className="segmented" data-hint="editor.view">
          <button data-active={view === "wave"} onClick={() => setView("wave")}>
            Wave
          </button>
          <button data-active={view === "spectrum"} onClick={() => setView("spectrum")}>
            Spectrogram
          </button>
        </div>
        <button
          className="tool-btn"
          disabled={!editor.canUndo}
          onClick={editor.undo}
          title="Undo (in this editor)"
          data-hint="editor.undo"
        >
          <Undo2 size={13} />
        </button>
        <button
          className="tool-btn"
          disabled={!editor.canRedo}
          onClick={editor.redo}
          title="Redo"
          data-hint="editor.redo"
        >
          <Redo2 size={13} />
        </button>
        <button
          className="tool-btn"
          onClick={() => useShell.getState().set({ sampleExport: sampleId })}
          title={
            editor.dirty
              ? "Export as WAV, MP3 or OGG (Apply first to include your changes)"
              : "Export as WAV, MP3 or OGG"
          }
          data-hint="editor.export"
          data-testid="editor-export"
        >
          <Download size={13} />
        </button>
        <button
          className="tool-btn border border-line"
          onClick={saveAsNew}
          disabled={!!busy}
          title="Render everything into a new library sample"
          data-hint="editor.saveAsNew"
        >
          Save as new
        </button>
        <button
          className="hw-btn !min-h-[26px]"
          data-lit={editor.dirty}
          disabled={!editor.dirty || !!busy}
          onClick={apply}
          title={
            usage.length > 1
              ? `Changes the sound on all ${usage.length} tracks that use this sample`
              : "Store the changes on this sample"
          }
          data-testid="editor-apply"
          data-hint="editor.apply"
        >
          {busy || (usage.length > 1 ? `Apply to ${usage.length} tracks` : "Apply")}
        </button>
      </div>

      <div className="relative min-h-[90px] flex-1 border-b border-line bg-display">
        {view === "wave" ? (
          <Waveform editor={editor} snap={snap} playhead={playhead} onSeek={() => {}} />
        ) : (
          <Spectrogram source={source} sampleRate={sr} />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="tool-btn !h-6 !text-[10.5px]"
            data-active={tab === t.id}
            data-hint={`editor.tab.${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="flex-1" />
        <span className="num text-[10px] text-faint">
          {sel
            ? `Selection ${sel.start.toFixed(3)}–${sel.end.toFixed(3)} s`
            : "Drag on the waveform to select"}
        </span>
      </div>

      <div className="scroll-thin max-h-[42%] shrink-0 overflow-auto px-3 py-2">
        {tab === "edit" && (
          <EditTab editor={editor} snap={snap} setSnap={setSnap} cut={cut} paste={paste} />
        )}
        {tab === "envelope" && <EnvelopeTab editor={editor} />}
        {tab === "tune" && <TuneTab editor={editor} setBusy={setBusy} />}
        {tab === "loop" && <LoopTab editor={editor} />}
        {tab === "slice" && <SliceTab editor={editor} sampleId={sampleId} setBusy={setBusy} />}
        {tab === "fx" && <FxTab editor={editor} setBusy={setBusy} />}
        {tab === "analyze" && <AnalyzeTab editor={editor} sampleId={sampleId} />}
      </div>
    </div>
  );
}

// ---------- tabs ----------

function EditTab({
  editor,
  snap,
  setSnap,
  cut,
  paste,
}: {
  editor: Editor;
  snap: boolean;
  setSnap: (v: boolean) => void;
  cut: () => void;
  paste: () => void;
}) {
  const { settings: s, update, selection: sel, source, sampleRate: sr } = editor;
  const curveSelect = (value: FadeCurve, onChange: (c: FadeCurve) => void) => (
    <select
      className="input !h-6 !text-[11px]"
      value={value}
      onChange={(e) => onChange(e.target.value as FadeCurve)}
    >
      {CURVES.map((c) => (
        <option key={c} value={c}>
          {c === "scurve" ? "S-curve" : c}
        </option>
      ))}
    </select>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Check
          label="Snap to zero"
          value={snap}
          onChange={setSnap}
          title="Trim points snap to zero crossings"
          hint="editor.snap"
        />
        <span data-hint="editor.fadeIn">
          <DragValue
            label="Fade in"
            value={Math.round(s.fadeIn * 1000)}
            min={0}
            max={5000}
            step={1}
            defaultValue={0}
            format={(v) => `${v} ms`}
            title=""
            onChange={(v) => update({ fadeIn: v / 1000 }, "fadeIn")}
          />
        </span>
        <span data-hint="editor.fadeCurve">
          {curveSelect(s.fadeInCurve, (fadeInCurve) => update({ fadeInCurve }))}
        </span>
        <span data-hint="editor.fadeOut">
          <DragValue
            label="Fade out"
            value={Math.round(s.fadeOut * 1000)}
            min={0}
            max={5000}
            step={1}
            defaultValue={0}
            format={(v) => `${v} ms`}
            title=""
            onChange={(v) => update({ fadeOut: v / 1000 }, "fadeOut")}
          />
        </span>
        <span data-hint="editor.fadeCurve">
          {curveSelect(s.fadeOutCurve, (fadeOutCurve) => update({ fadeOutCurve }))}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-hint="editor.gain">
          <DragValue
            label="Gain"
            value={Math.round(s.gainDb * 10) / 10}
            min={-24}
            max={24}
            step={0.1}
            defaultValue={0}
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
            title=""
            onChange={(v) => update({ gainDb: v }, "gain")}
          />
        </span>
        <Check
          label="Normalize"
          value={s.normalize}
          onChange={(normalize) => update({ normalize })}
          hint="editor.normalize"
        />
        <Check
          label="Reverse"
          value={s.reverse}
          onChange={(reverse) => update({ reverse })}
          hint="editor.reverse"
        />
        <Check
          label="Remove DC"
          value={s.dcRemove}
          onChange={(dcRemove) => update({ dcRemove })}
          hint="editor.dcRemove"
        />
        <button
          className="tool-btn border border-line !text-[10.5px]"
          onClick={() => update({ trimStart: 0, trimEnd: null })}
          data-hint="editor.resetTrim"
        >
          Reset trim
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          onClick={() => editor.replaceSource(stripSilence(source, sr))}
          title="Remove silent gaps (makes new audio)"
          data-hint="editor.stripSilence"
        >
          Strip silence
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">Selection</span>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!sel}
          onClick={cut}
          data-hint="editor.cut"
        >
          Cut
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!sel}
          onClick={() => sel && (clipboard = copyRange(source, sr, sel.start, sel.end))}
          data-hint="editor.copy"
        >
          Copy
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!clipboard}
          onClick={paste}
          data-hint="editor.paste"
        >
          Paste
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!sel}
          onClick={() => sel && editor.replaceSource(silenceRange(source, sr, sel.start, sel.end))}
          data-hint="editor.silence"
        >
          Silence
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!sel}
          data-hint="editor.crop"
          onClick={() => {
            if (!sel) return;
            editor.replaceSource(cropRange(source, sr, sel.start, sel.end), {
              trimStart: 0,
              trimEnd: null,
            });
            editor.setSelection(null);
          }}
        >
          Crop
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!sel}
          onClick={() => sel && update({ trimStart: sel.start, trimEnd: sel.end })}
          data-hint="editor.trimToSel"
        >
          Trim to selection
        </button>
      </div>
    </div>
  );
}

function EnvelopeTab({ editor }: { editor: Editor }) {
  const { settings: s, update } = editor;
  const env = s.ahdsr;
  const len = (s.trimEnd ?? editor.duration) - s.trimStart;
  const knobHints: Record<string, string> = {
    a: "editor.env.attack",
    h: "editor.env.hold",
    d: "editor.env.decay",
    r: "editor.env.release",
  };
  const knob = (k: "a" | "h" | "d" | "r", label: string) =>
    env && (
      <span data-hint={knobHints[k]}>
        <DragValue
          label={label}
          value={Math.round(env[k] * 1000)}
          min={0}
          max={Math.round(len * 1000)}
          step={1}
          defaultValue={0}
          format={(v) => `${v} ms`}
          title=""
          onChange={(v) => update({ ahdsr: { ...env, [k]: v / 1000 } }, `env-${k}`)}
        />
      </span>
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Check
          label="AHDSR envelope"
          value={!!env}
          hint="editor.ahdsr"
          onChange={(on) =>
            update({
              ahdsr: on ? { a: 0.005, h: 0.05, d: 0.2, s: 0.6, r: Math.min(0.3, len / 3) } : null,
            })
          }
        />
        {knob("a", "Attack")}
        {knob("h", "Hold")}
        {knob("d", "Decay")}
        {env && (
          <span data-hint="editor.env.sustain">
            <DragValue
              label="Sustain"
              value={Math.round(env.s * 100)}
              min={0}
              max={100}
              defaultValue={60}
              format={(v) => `${v}%`}
              title=""
              onChange={(v) => update({ ahdsr: { ...env, s: v / 100 } }, "env-s")}
            />
          </span>
        )}
        {knob("r", "Release")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Check
          label="Volume envelope"
          value={!!s.volumeEnvelope}
          hint="editor.volumeEnv"
          onChange={(on) =>
            update({
              volumeEnvelope: on
                ? [
                    { time: 0, volume: 1 },
                    { time: len / 2, volume: 1 },
                    { time: len, volume: 1 },
                  ]
                : null,
            })
          }
          title="Draw a volume curve on the waveform: drag the points, double-click to add"
        />
        <span className="text-[10.5px] text-faint">
          Drag the points on the waveform; double-click to add one.
        </span>
      </div>
    </div>
  );
}

function TuneTab({ editor, setBusy }: { editor: Editor; setBusy: (s: string) => void }) {
  const { settings: s, update } = editor;
  const bpm = useStore((st) => st.project.bpm);
  const rec = useLibrary((st) => st.samples.find((x) => x.name === editor.name));
  const [target, setTarget] = useState(bpm);
  const len = (s.trimEnd ?? editor.duration) - s.trimStart;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span data-hint="editor.semitones">
          <DragValue
            label="Semitones"
            value={s.tuneSemis}
            min={-24}
            max={24}
            defaultValue={0}
            format={(v) => `${v > 0 ? "+" : ""}${v}`}
            title=""
            onChange={(v) => update({ tuneSemis: v }, "semis")}
          />
        </span>
        <span data-hint="editor.cents">
          <DragValue
            label="Cents"
            value={s.tuneCents}
            min={-100}
            max={100}
            defaultValue={0}
            format={(v) => `${v > 0 ? "+" : ""}${v}`}
            title=""
            onChange={(v) => update({ tuneCents: v }, "cents")}
          />
        </span>
        <Check
          label="Keep length"
          value={s.keepLength}
          onChange={(keepLength) => update({ keepLength })}
          title="Pitch shift with time-stretching instead of resampling"
          hint="editor.keepLength"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-hint="editor.stretch">
          <DragValue
            label="Stretch"
            value={Math.round(s.stretch * 100)}
            min={25}
            max={400}
            defaultValue={100}
            format={(v) => `${v}%`}
            title=""
            onChange={(v) => update({ stretch: v / 100 }, "stretch")}
          />
        </span>
        <span className="text-[11px] text-dim">→ {(len * s.stretch).toFixed(2)} s</span>
        <Field label="To BPM">
          <input
            type="number"
            className="input !h-6 w-16"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value) || bpm)}
            data-hint="editor.stretchBpm.target"
          />
        </Field>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!rec?.bpm}
          title={rec?.bpm ? `From ${rec.bpm} BPM` : "The sample has no detected tempo"}
          onClick={() => rec?.bpm && update({ stretch: rec.bpm / target })}
          data-hint="editor.stretchToBpm"
        >
          Stretch to BPM
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          onClick={async () => {
            setBusy("Stretching…");
            try {
              const out = await stretchOffline(
                editor.source,
                editor.sampleRate,
                1 / s.stretch,
                s.keepLength ? s.tuneSemis + s.tuneCents / 100 : 0,
              );
              editor.replaceSource(out, {
                stretch: 1,
                ...(s.keepLength ? { tuneSemis: 0, tuneCents: 0 } : {}),
                trimStart: 0,
                trimEnd: null,
              });
            } finally {
              setBusy("");
            }
          }}
          title="Render the stretch into the audio"
          data-hint="editor.renderStretch"
        >
          Render
        </button>
      </div>
    </div>
  );
}

function LoopTab({ editor }: { editor: Editor }) {
  const { settings: s, update, selection: sel } = editor;
  const len = (s.trimEnd ?? editor.duration) - s.trimStart;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Check
        label="Loop points"
        value={!!s.loop}
        hint="editor.loop.points"
        onChange={(on) =>
          update({ loop: on ? { start: len * 0.25, end: len * 0.9, crossfade: 0.02 } : null })
        }
      />
      {s.loop && (
        <>
          <span className="num text-[11px] text-dim">
            {s.loop.start.toFixed(3)}–{s.loop.end.toFixed(3)} s
          </span>
          <span data-hint="editor.loop.crossfade">
            <DragValue
              label="Crossfade"
              value={Math.round(s.loop.crossfade * 1000)}
              min={0}
              max={500}
              defaultValue={20}
              format={(v) => `${v} ms`}
              title=""
              onChange={(v) => update({ loop: { ...s.loop!, crossfade: v / 1000 } }, "xf")}
            />
          </span>
          <button
            className="tool-btn border border-line !text-[10.5px]"
            disabled={!sel}
            data-hint="editor.loop.fromSel"
            onClick={() =>
              sel &&
              update({
                loop: {
                  start: sel.start - s.trimStart,
                  end: sel.end - s.trimStart,
                  crossfade: s.loop!.crossfade,
                },
              })
            }
          >
            Loop the selection
          </button>
        </>
      )}
      <span className="text-[10.5px] text-faint">
        For sustained sounds: drag the purple region on the waveform.
      </span>
    </div>
  );
}

function SliceTab({
  editor,
  sampleId,
  setBusy,
}: {
  editor: Editor;
  sampleId: string;
  setBusy: (s: string) => void;
}) {
  const { settings: s, source, sampleRate: sr, markers, setMarkers } = editor;
  const [sensitivity, setSensitivity] = useState(50);
  const [grid, setGrid] = useState(8);
  const from = s.trimStart;
  const to = s.trimEnd ?? editor.duration;

  const toTracks = async () => {
    const slices = slicesFromMarkers(markers, from, to);
    if (slices.length < 2) return toast("Add slice markers first", "error");
    setBusy("Slicing…");
    try {
      const ids: string[] = [];
      for (const [i, [a, b]] of slices.entries()) {
        const id = await saveVersion(
          copyRange(source, sr, a, b),
          sr,
          `${editor.name} slice ${i + 1}`,
          sampleId,
        );
        if (id) ids.push(id);
      }
      const created = addSampleTracks(ids);
      // a pattern that plays the original rhythm on the page being edited
      const st = useStore.getState();
      const pattern = slotPattern(st.project, st.editSlotId);
      const stepSec = (60 / st.project.bpm) * STEP_SIZE_QUARTERS[pattern.stepSize];
      const steps = sliceSteps(slices, stepSec);
      const needed = Math.min(128, Math.ceil((Math.max(...steps) + 1) / 16) * 16);
      st.commit((p) => {
        const pat = slotPattern(p, st.editSlotId);
        if (pat.stepCount < needed) pat.stepCount = needed;
        created.forEach((trackId, i) => {
          const lane = pat.lanes[trackId] as StepLane;
          if (lane?.kind === "steps" && steps[i] < 128) lane.steps[steps[i]].on = true;
        });
      });
      toast(`${ids.length} slices → ${ids.length} tracks`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span data-hint="editor.slice.sensitivity">
          <DragValue
            label="Sensitivity"
            value={sensitivity}
            min={0}
            max={100}
            defaultValue={50}
            format={(v) => `${v}%`}
            title=""
            onChange={setSensitivity}
          />
        </span>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          data-hint="editor.slice.transients"
          onClick={() => {
            const mono = toMono(toAudioBuffer(copyRange(source, sr, from, to), sr));
            setMarkers(
              detectOnsets(mono, sensitivity / 100)
                .map((t) => t + from)
                .filter((t) => t > from + 0.01),
            );
          }}
        >
          By transients
        </button>
        <span data-hint="editor.slice.grid">
          <DragValue
            label="Grid"
            value={grid}
            min={2}
            max={64}
            defaultValue={8}
            format={(v) => `${v}`}
            title=""
            onChange={setGrid}
          />
        </span>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          data-hint="editor.slice.equalGrid"
          onClick={() => setMarkers(gridMarkers(from, to, grid))}
        >
          Equal grid
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!editor.selection}
          data-hint="editor.slice.addMarker"
          onClick={() =>
            editor.selection &&
            setMarkers([...markers, editor.selection.start].sort((a, b) => a - b))
          }
          title="Add a marker at the start of the selection"
        >
          Add marker
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!markers.length}
          data-hint="editor.slice.clear"
          onClick={() => setMarkers([])}
        >
          Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-dim">
          {markers.length ? `${markers.length + 1} slices` : "No markers"}
        </span>
        <button
          className="hw-btn !min-h-[26px]"
          disabled={!markers.length}
          onClick={toTracks}
          data-testid="slices-to-tracks"
          data-hint="editor.slice.toTracks"
        >
          Slices to new drum tracks
        </button>
      </div>
    </div>
  );
}

function FxTab({ editor, setBusy }: { editor: Editor; setBusy: (s: string) => void }) {
  const [effects, setEffects] = useState<Effect[]>([]);
  const bpm = useStore((s) => s.project.bpm);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input !h-6 !text-[11px]"
          value=""
          data-hint="editor.fx.add"
          onChange={(e) => e.target.value && setEffects([...effects, makeEffect(e.target.value)])}
        >
          <option value="">+ Add effect</option>
          {EFFECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          className="hw-btn !min-h-[26px]"
          disabled={!effects.length}
          data-hint="editor.fx.render"
          onClick={async () => {
            setBusy("Rendering…");
            try {
              const out = await renderWithEffects(editor.source, editor.sampleRate, effects, bpm);
              editor.replaceSource(out, { trimStart: 0, trimEnd: null });
              setEffects([]);
              toast("Effects rendered into the audio");
            } finally {
              setBusy("");
            }
          }}
        >
          Render into the sample
        </button>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          disabled={!effects.length}
          data-hint="editor.fx.preview"
          onClick={async () => {
            const out = await renderWithEffects(editor.source, editor.sampleRate, effects, bpm);
            const ctx = audioContext();
            const src = ctx.createBufferSource();
            src.buffer = toAudioBuffer(out, editor.sampleRate);
            src.connect(ctx.destination);
            src.start();
          }}
          title="Hear the result before rendering (compare with ▶)"
        >
          Preview
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1.5">
        {effects.map((fx, i) => (
          <EffectEditor
            key={fx.id}
            effect={fx}
            index={i}
            count={effects.length}
            onLocalChange={(next) => setEffects(effects.map((e, j) => (j === i ? next : e)))}
            onLocalRemove={() => setEffects(effects.filter((_, j) => j !== i))}
          />
        ))}
      </div>
    </div>
  );
}

function AnalyzeTab({ editor, sampleId }: { editor: Editor; sampleId: string }) {
  const [result, setResult] = useState<{
    bpm?: number;
    key?: string;
    peak: number;
    rms: number;
    lufs: number;
  } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const buf = toAudioBuffer(editor.source, editor.sampleRate);
      const mono = toMono(buf);
      const k = detectKey(mono);
      const l = loudness(editor.source, editor.sampleRate);
      setResult({
        bpm: detectBpm(mono),
        key: k ? `${pitchClassName(k.root, true)} ${k.scale}` : undefined,
        peak: l.peakDb,
        rms: l.rmsDb,
        lufs: l.lufs,
      });
    }, 30);
    return () => clearTimeout(t);
  }, [editor.source, editor.sampleRate]);
  const f = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "−∞");
  if (!result) return <div className="text-[11.5px] text-faint">Analyzing…</div>;
  return (
    <div className="num flex flex-wrap items-center gap-4 text-[11.5px]">
      <span>Tempo: {result.bpm ? `${result.bpm} BPM` : "—"}</span>
      <span>Key: {result.key ?? "—"}</span>
      <span>Peak: {f(result.peak)} dBFS</span>
      <span>RMS: {f(result.rms)} dBFS</span>
      <span>Loudness: {f(result.lufs)} LUFS</span>
      {result.bpm && (
        <button
          className="tool-btn border border-line !text-[10.5px]"
          onClick={() => updateSample(sampleId, { bpm: result.bpm })}
          data-hint="editor.analyze.storeTempo"
        >
          Store tempo
        </button>
      )}
    </div>
  );
}

function Spectrogram({ source, sampleRate }: { source: Channels; sampleRate: number }) {
  const frames = useMemo(() => {
    const size = 1024;
    const hop = Math.max(256, Math.floor(source[0].length / 1500));
    return stft(source[0], size, hop);
  }, [source]);
  const { ref } = useCanvas(
    (ctx, { width: w, height: h }) => {
      ctx.fillStyle = token("scope-bg");
      ctx.fillRect(0, 0, w, h);
      if (!frames.length) return;
      const bins = frames[0].length;
      const img = ctx.createImageData(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
      for (let x = 0; x < img.width; x++) {
        const fr = frames[Math.floor((x / img.width) * frames.length)];
        for (let y = 0; y < img.height; y++) {
          // log frequency axis from 30 Hz
          const f = 30 * Math.pow(sampleRate / 2 / 30, 1 - y / img.height);
          const k = Math.min(bins - 1, Math.round((f / (sampleRate / 2)) * bins));
          const db = 20 * Math.log10(fr[k] + 1e-6);
          const v = Math.max(0, Math.min(1, (db + 40) / 60));
          const o = (y * img.width + x) * 4;
          img.data[o] = 255 * Math.min(1, v * 1.6);
          img.data[o + 1] = 255 * Math.max(0, v * 1.3 - 0.35);
          img.data[o + 2] = 255 * (0.25 + 0.5 * (1 - Math.abs(v - 0.35) * 2.5));
          img.data[o + 3] = 255;
        }
      }
      // putImageData ignores the transform: draw at device pixels
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const tmp = new OffscreenCanvas(img.width, img.height);
      tmp.getContext("2d")!.putImageData(img, 0, 0);
      ctx.drawImage(tmp, 0, 0, ctx.canvas.width, ctx.canvas.height);
    },
    [frames],
  );
  return <canvas ref={ref} className="block h-full w-full" />;
}
