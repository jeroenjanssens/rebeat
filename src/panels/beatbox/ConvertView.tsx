import { useEffect, useMemo, useState } from "react";
import { Play, Sparkles, Square, Wand2 } from "lucide-react";
import { DragValue } from "../../components/DragValue";
import { toast } from "../../components/Toast";
import { focusPanel } from "../../app/openers";
import { getBuffer } from "../../engine/samples";
import { loadSample, sampleName } from "../../library/library";
import { SAMPLE_MIME } from "../../state/trackActions";
import { createTracks, type ClassSound } from "../../state/beatboxActions";
import { useStore } from "../../state/store";
import type { StepSize } from "../../model/types";
import { BEATBOX_CLASSES, CLASS_INFO, type BeatboxClass } from "../../library/beatbox/classes";
import type { PrototypeSums } from "../../library/beatbox/calibrate";
import {
  convert,
  DEFAULT_CONVERT,
  detectGrid,
  stepsPerBar,
  type ConvertSettings,
  type TakeHit,
} from "../../library/beatbox/convert";
import type { BeatboxHit, BeatboxRecording } from "../../library/beatbox/dataset";
import { audioOf, finalLabel, hitPeakDb, useBeatbox } from "../../library/beatbox/store";
import { startPreview, stopPreview } from "../../library/beatbox/preview";
import { STEP_SIZE_QUARTERS } from "../../model/types";
import { setPlayhead, type Grid } from "./HitWaveform";

const STEP_SIZES: StepSize[] = ["1/8", "1/16", "1/16T", "1/32"];

interface Props {
  rec: BeatboxRecording;
  hits: BeatboxHit[];
  calibration: PrototypeSums | null;
  onGrid: (g: Grid | undefined) => void;
  onFlagged: (f: Set<string> | undefined) => void;
}

function initial(rec: BeatboxRecording, hits: BeatboxHit[], bpm: number): ConvertSettings {
  const grid =
    rec.bpm !== undefined && rec.barStart !== undefined
      ? { bpm: rec.bpm, firstBeat: rec.barStart }
      : detectGrid(
          hits.map((h) => h.start),
          undefined,
        );
  return { ...DEFAULT_CONVERT, ...grid, bpm: grid.bpm || bpm };
}

/** Converting a take into step tracks (D113–D115): the grid, timing, velocity, repetitions,
 * what each class plays, a preview, and Create tracks. */
export function ConvertView({ rec, hits, calibration, onGrid, onFlagged }: Props) {
  const projectBpm = useStore((s) => s.project.bpm);
  const timeSignature = useStore((s) => s.project.timeSignature);
  const saved = useBeatbox((s) => s.convert[rec.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fallback = useMemo(() => initial(rec, hits, projectBpm), [rec.id]);
  const settings = saved ?? fallback;
  const predictions = useBeatbox((s) => s.predictions);
  const audioVersion = useBeatbox((s) => s.audioVersion);
  const set = (patch: Partial<ConvertSettings>) =>
    useBeatbox.getState().set({
      convert: { ...useBeatbox.getState().convert, [rec.id]: { ...settings, ...patch } },
    });
  const [sounds, setSounds] = useState<Partial<Record<BeatboxClass, ClassSound | "kit">>>({});
  const [preview, setPreview] = useState<"off" | "original" | "result" | "both">("off");
  const [busy, setBusy] = useState(false);

  const takeHits: TakeHit[] = useMemo(
    () =>
      hits.flatMap((h) => {
        const label = finalLabel(h, calibration);
        return label ? [{ id: h.id, start: h.start, label, peakDb: hitPeakDb(h) }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hits, calibration, predictions, audioVersion],
  );
  const result = useMemo(
    () => convert(takeHits, settings, timeSignature[0], timeSignature[1]),
    [takeHits, settings, timeSignature],
  );

  const stepDur = (60 / settings.bpm) * STEP_SIZE_QUARTERS[settings.stepSize];
  const perBar = stepsPerBar(settings.stepSize, timeSignature[0], timeSignature[1]);
  useEffect(() => {
    onGrid({
      bpm: settings.bpm,
      firstBeat: settings.firstBeat,
      step: stepDur,
      stepsPerBar: perBar,
    });
    onFlagged(new Set(result.flagged));
  }, [settings.bpm, settings.firstBeat, stepDur, perBar, result, onGrid, onFlagged]);
  useEffect(
    () => () => {
      stopPreview();
      onGrid(undefined);
      onFlagged(undefined);
    },
    [onGrid, onFlagged],
  );

  const classes = BEATBOX_CLASSES.filter((c) => takeHits.some((h) => h.label === c));

  /** Your most typical hit of a class in this take (D115): the one nearest the middle of the
   * class's hits in the model's embedding, else the one of median loudness. */
  const typical = (c: BeatboxClass) => {
    const mine = takeHits.filter((h) => h.label === c);
    if (!mine.length) return undefined;
    const embs = mine.map((h) => predictions[h.id]?.embedding);
    if (embs.every(Boolean)) {
      const centre = new Float32Array(embs[0]!.length);
      for (const e of embs) for (let i = 0; i < centre.length; i++) centre[i] += e![i];
      const dot = (e: Float32Array) => e.reduce((a, v, i) => a + v * centre[i], 0);
      let best = 0;
      for (let i = 1; i < mine.length; i++) if (dot(embs[i]!) > dot(embs[best]!)) best = i;
      return mine[best];
    }
    const levels = mine.map((h) => h.peakDb).sort((a, b) => a - b);
    const median = levels[Math.floor(levels.length / 2)];
    return [...mine].sort((a, b) => Math.abs(a.peakDb - median) - Math.abs(b.peakDb - median))[0];
  };
  const soundOf = (c: BeatboxClass): ClassSound | null => {
    const s = sounds[c];
    if (s === "kit")
      return CLASS_INFO[c].kit ? { kind: "sample", sampleId: CLASS_INFO[c].kit! } : null;
    if (s) return s;
    const t = typical(c);
    return t ? { kind: "own", hitId: t.id } : null;
  };

  const buffers = () => {
    const a = audioOf(rec.id);
    const out: Partial<Record<BeatboxClass, AudioBuffer>> = {};
    for (const c of classes) {
      const s = soundOf(c);
      if (!s) continue;
      if (s.kind === "sample") {
        const b = getBuffer(s.sampleId);
        if (b) out[c] = b;
        else void loadSample(s.sampleId);
      } else if (a) {
        const h = hits.find((x) => x.id === s.hitId);
        if (!h) continue;
        const sr = a.buffer.sampleRate;
        const from = Math.max(0, Math.round((h.start - 0.003) * sr));
        const to = Math.min(a.buffer.length, Math.round(h.end * sr));
        const b = new AudioBuffer({
          length: Math.max(1, to - from),
          numberOfChannels: a.buffer.numberOfChannels,
          sampleRate: sr,
        });
        for (let ch = 0; ch < b.numberOfChannels; ch++)
          b.copyToChannel(a.buffer.getChannelData(ch).slice(from, to), ch);
        out[c] = b;
      }
    }
    return out;
  };

  /** (Re)start the preview's audio. */
  const start = (mode: typeof preview) => {
    stopPreview();
    setPlayhead(null);
    if (mode === "off") return;
    const a = audioOf(rec.id);
    const { when, period } = startPreview({
      result,
      buffers: buffers(),
      bpm: settings.bpm,
      stepSize: settings.stepSize,
      original:
        mode !== "result" && a ? { buffer: a.buffer, firstBeat: settings.firstBeat } : undefined,
      playResult: mode !== "original",
    });
    if (mode !== "result")
      setPlayhead({ when, offset: settings.firstBeat, duration: period, loop: true });
  };
  const play = (mode: typeof preview) => {
    setPreview(mode);
    start(mode);
  };
  // a running preview follows the settings
  useEffect(() => {
    if (preview !== "off") start(preview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, sounds]);

  const create = async () => {
    setBusy(true);
    play("off");
    try {
      const chosen: Partial<Record<BeatboxClass, ClassSound>> = {};
      for (const c of classes) {
        const s = soundOf(c);
        if (s) chosen[c] = s;
      }
      const ids = await createTracks(rec, result, chosen, settings.stepSize, hits);
      toast(`Added ${ids.length} step track${ids.length === 1 ? "" : "s"}`);
      focusPanel("drum-machine");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-2 text-[11px]" data-testid="beatbox-convert">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5" data-hint="beatbox.convert.tempo">
          <span className="label">Tempo</span>
          <DragValue
            value={settings.bpm}
            min={60}
            max={200}
            step={0.5}
            format={(v) => `${v.toFixed(1)} BPM`}
            defaultValue={fallback.bpm}
            onChange={(bpm) => set({ bpm })}
          />
          <span className="label ml-1">First beat</span>
          <DragValue
            value={settings.firstBeat}
            min={0}
            max={Math.max(0.01, rec.duration)}
            step={0.005}
            format={(v) => `${v.toFixed(3)} s`}
            defaultValue={fallback.firstBeat}
            onChange={(firstBeat) => set({ firstBeat })}
          />
          <button
            className="tool-btn"
            title="Find the tempo and first beat from the hits"
            data-testid="beatbox-detect-grid"
            onClick={() => set(detectGrid(hits.map((h) => h.start)))}
          >
            <Wand2 size={12} /> Detect
          </button>
          {rec.bpm && settings.bpm !== rec.bpm && (
            <button
              className="tool-btn"
              onClick={() => set({ bpm: rec.bpm!, firstBeat: rec.barStart ?? 0 })}
            >
              As recorded
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5" data-hint="beatbox.convert.step">
          <span className="label">Steps</span>
          <select
            className="input !h-6 !text-[11px]"
            value={settings.stepSize}
            onChange={(e) => set({ stepSize: e.target.value as StepSize })}
          >
            {STEP_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5" data-hint="beatbox.convert.timing">
          <span className="label">Timing</span>
          <div className="segmented">
            <button
              data-active={settings.timing === "snap"}
              onClick={() => set({ timing: "snap" })}
            >
              Snap
            </button>
            <button
              data-active={settings.timing === "feel"}
              data-testid="beatbox-timing-feel"
              onClick={() => set({ timing: "feel" })}
            >
              Keep feel
            </button>
          </div>
          {settings.timing === "feel" && (
            <DragValue
              value={settings.strength}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              defaultValue={1}
              onChange={(strength) => set({ strength })}
              label="Strength"
            />
          )}
        </div>
        <div className="flex items-center gap-1.5" data-hint="beatbox.convert.velocity">
          <span className="label">Velocity</span>
          <div className="segmented">
            <button
              data-active={settings.velocity === "detected"}
              onClick={() => set({ velocity: "detected" })}
            >
              Detected
            </button>
            <button
              data-active={settings.velocity === "constant"}
              data-testid="beatbox-velocity-constant"
              onClick={() => set({ velocity: "constant" })}
            >
              Constant
            </button>
          </div>
          {settings.velocity === "detected" ? (
            <>
              <DragValue
                value={settings.velMin}
                min={0}
                max={settings.velMax}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}`}
                defaultValue={DEFAULT_CONVERT.velMin}
                onChange={(velMin) => set({ velMin })}
                label="Min"
              />
              <DragValue
                value={settings.velMax}
                min={settings.velMin}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}`}
                defaultValue={DEFAULT_CONVERT.velMax}
                onChange={(velMax) => set({ velMax })}
                label="Max"
              />
            </>
          ) : (
            <DragValue
              value={settings.constant}
              min={0.05}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}`}
              defaultValue={DEFAULT_CONVERT.constant}
              onChange={(constant) => set({ constant })}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5" data-hint="beatbox.convert.quiet">
          <span className="label">Drop hits quieter than</span>
          <DragValue
            value={settings.quietDb}
            min={6}
            max={60}
            step={1}
            format={(v) => `−${v} dB`}
            defaultValue={DEFAULT_CONVERT.quietDb}
            onChange={(quietDb) => set({ quietDb })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5" data-hint="beatbox.convert.repeats">
          <span className="label">Repetitions</span>
          <div className="segmented">
            <button
              data-active={settings.repeats === "fold"}
              onClick={() => set({ repeats: "fold" })}
            >
              Fold into one pattern
            </button>
            <button
              data-active={settings.repeats === "all"}
              data-testid="beatbox-repeats-all"
              onClick={() => set({ repeats: "all" })}
            >
              Keep every bar
            </button>
          </div>
        </div>
        <label className="flex items-center gap-1.5" data-hint="beatbox.convert.bars">
          <span className="label">Pattern</span>
          <select
            className="input !h-6 !text-[11px]"
            value={String(settings.bars)}
            onChange={(e) =>
              set({
                bars:
                  e.target.value === "auto" ? "auto" : (Number(e.target.value) as 1 | 2 | 4 | 8),
              })
            }
          >
            <option value="auto">
              Auto ({result.bars} bar{result.bars === 1 ? "" : "s"})
            </option>
            {[1, 2, 4, 8].map((b) => (
              <option key={b} value={b}>
                {b} bar{b === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <span className="text-dim" data-testid="beatbox-convert-summary">
          {settings.repeats === "fold"
            ? `${result.repeats}× played, folded into ${result.length} steps`
            : `${result.pages.length} page${result.pages.length === 1 ? "" : "s"} of ${result.length} steps`}
          {result.flagged.length
            ? ` · ${result.flagged.length} hits disagree with the other repetitions (!)`
            : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded border border-line" data-hint="beatbox.convert.grid">
        <table className="text-[10px]">
          <tbody>
            {classes.map((c) => {
              const s = sounds[c];
              const lanes = result.pages.map((p) => p[c]);
              return (
                <tr key={c} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-panel px-2 py-1">
                    <label
                      className="flex items-center gap-1.5"
                      data-hint="beatbox.convert.include"
                    >
                      <input
                        type="checkbox"
                        checked={settings.include[c]}
                        onChange={(e) =>
                          set({ include: { ...settings.include, [c]: e.target.checked } })
                        }
                      />
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: CLASS_INFO[c].color }}
                      />
                      <span className="w-20 truncate text-ink">{CLASS_INFO[c].name}</span>
                    </label>
                  </td>
                  <td
                    className="bg-panel px-1"
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes(SAMPLE_MIME)) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData(SAMPLE_MIME);
                      if (!id) return;
                      e.preventDefault();
                      void loadSample(id);
                      setSounds({ ...sounds, [c]: { kind: "sample", sampleId: id } });
                    }}
                    data-hint="beatbox.convert.sound"
                  >
                    <select
                      className="input !h-6 w-32 !text-[10px]"
                      value={
                        !s ? "own" : s === "kit" ? "kit" : s.kind === "sample" ? "sample" : "own"
                      }
                      data-testid={`beatbox-sound-${c}`}
                      onChange={(e) =>
                        setSounds({
                          ...sounds,
                          [c]: e.target.value === "kit" ? "kit" : undefined,
                        })
                      }
                    >
                      <option value="own">Your hit</option>
                      {CLASS_INFO[c].kit && (
                        <option value="kit">Kit: {sampleName(CLASS_INFO[c].kit)}</option>
                      )}
                      {s && s !== "kit" && s.kind === "sample" && (
                        <option value="sample">{sampleName(s.sampleId)}</option>
                      )}
                    </select>
                  </td>
                  {settings.include[c] &&
                    lanes.map((lane, p) => (
                      <td key={p} className="px-1 py-1">
                        <div className="flex gap-px">
                          {Array.from({ length: result.length }, (_, i) => {
                            const st = lane?.[i];
                            return (
                              <span
                                key={i}
                                className="h-3.5 w-2.5 rounded-[2px]"
                                style={{
                                  marginLeft:
                                    i && i % perBar === 0 ? 4 : i % 4 === 0 && i ? 1.5 : 0,
                                  background: st
                                    ? CLASS_INFO[c].color
                                    : "color-mix(in oklab, var(--pad-bg) 80%, transparent)",
                                  opacity: st ? 0.35 + 0.65 * st.velocity : 1,
                                }}
                                title={
                                  st
                                    ? `Step ${i + 1}: velocity ${Math.round(st.velocity * 100)}${st.nudge ? `, nudge ${Math.round(st.nudge * 100)}%` : ""}`
                                    : `Step ${i + 1}`
                                }
                              />
                            );
                          })}
                        </div>
                      </td>
                    ))}
                </tr>
              );
            })}
            {!classes.length && (
              <tr>
                <td className="p-3 text-dim">
                  No hits with a class yet. Label some, or wait for the model's guesses.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Hear</span>
        <div className="segmented" data-hint="beatbox.convert.preview">
          {(["original", "result", "both"] as const).map((m) => (
            <button
              key={m}
              data-active={preview === m}
              data-testid={`beatbox-preview-${m}`}
              onClick={() => play(preview === m ? "off" : m)}
            >
              {preview === m ? (
                <Square size={10} className="mr-1 inline" />
              ) : (
                <Play size={10} className="mr-1 inline" />
              )}
              {m === "original" ? "Original" : m === "result" ? "Result" : "Both"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          className="hw-btn !min-h-[28px] !flex-row gap-1.5"
          disabled={busy || !classes.some((c) => settings.include[c])}
          onClick={() => void create()}
          data-hint="beatbox.convert.create"
          data-testid="beatbox-create"
        >
          <Sparkles size={12} /> Create tracks
        </button>
      </div>
    </div>
  );
}
