import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, ScanSearch, Square, Trash2 } from "lucide-react";
import { auditionBuffer, stopAudition } from "../../library/audition";
import { BEATBOX_CLASSES, CLASS_INFO, type BeatboxClass } from "../../library/beatbox/classes";
import type { PrototypeSums } from "../../library/beatbox/calibrate";
import type { BeatboxHit, BeatboxRecording } from "../../library/beatbox/dataset";
import {
  addHit,
  audioOf,
  hitsOf,
  isExample,
  labelHits,
  redetect,
  removeHits,
  updateHit,
  updateRecording,
  useBeatbox,
  type Guess,
} from "../../library/beatbox/store";
import { HitWaveform, setPlayhead, type Grid } from "./HitWaveform";
import { ConvertView } from "./ConvertView";
import { needsLook } from "./BeatboxPanel";

interface Props {
  rec: BeatboxRecording;
  guesses: Record<string, Guess | null>;
  calibration: PrototypeSums | null;
}

export function playHit(rec: BeatboxRecording, hit: BeatboxHit) {
  const a = audioOf(rec.id);
  if (!a) return;
  const offset = Math.max(0, hit.start - 0.003);
  const duration = Math.max(0.03, hit.end - offset);
  const when = auditionBuffer(a.buffer, { offset, duration });
  setPlayhead({ when, offset, duration, loop: false });
}

/** The selected recording: its hits on the waveform, labeling, and (for takes) converting. */
export function RecordingView({ rec, guesses, calibration }: Props) {
  const allHits = useBeatbox((s) => s.hits);
  const selected = useBeatbox((s) => s.selectedHitIds);
  useBeatbox((s) => s.audioVersion);
  const hits = useMemo(() => hitsOf(rec.id, allHits), [rec.id, allHits]);
  const audio = audioOf(rec.id);
  const [tab, setTab] = useState<"hits" | "convert">(rec.kind === "take" ? "convert" : "hits");
  const [sensitivity, setSensitivity] = useState(0.5);
  const [playingAll, setPlayingAll] = useState(false);
  const [grid, setGrid] = useState<Grid | undefined>();
  const [flagged, setFlagged] = useState<Set<string> | undefined>();
  const root = useRef<HTMLDivElement>(null);
  const select = (ids: string[]) => useBeatbox.getState().set({ selectedHitIds: ids });

  useEffect(() => () => setPlayhead(null), []);

  const label = (c: BeatboxClass | undefined) => {
    const ids = selected.length ? selected : [];
    if (ids.length) void labelHits(ids, c);
  };
  const accept = () => {
    const ids = selected.length ? selected : hits.filter((h) => !isExample(h)).map((h) => h.id);
    const by = new Map<BeatboxClass, string[]>();
    for (const id of ids) {
      const g = guesses[id];
      if (g) by.set(g.label, [...(by.get(g.label) ?? []), id]);
    }
    for (const [c, list] of by) void labelHits(list, c);
  };
  const step = (dir: 1 | -1, onlyLook: boolean) => {
    if (!hits.length) return;
    const at = selected.length ? hits.findIndex((h) => h.id === selected[selected.length - 1]) : -1;
    for (let k = 1; k <= hits.length; k++) {
      const i = (at + dir * k + hits.length * 2) % hits.length;
      const h = hits[i];
      if (!onlyLook || needsLook(h, guesses[h.id] ?? null)) {
        select([h.id]);
        playHit(rec, h);
        return;
      }
    }
  };
  const playAll = () => {
    if (playingAll) {
      stopAudition();
      setPlayhead(null);
      setPlayingAll(false);
      return;
    }
    const a = audioOf(rec.id);
    if (!a) return;
    const when = auditionBuffer(a.buffer, { loop: rec.kind === "take" });
    setPlayhead({ when, offset: 0, duration: a.buffer.duration, loop: rec.kind === "take" });
    setPlayingAll(true);
    if (rec.kind !== "take")
      window.setTimeout(() => setPlayingAll(false), a.buffer.duration * 1000);
  };

  const sel = hits.filter((h) => selected.includes(h.id));
  const one = sel.length === 1 ? sel[0] : null;
  const oneGuess = one ? guesses[one.id] : null;
  const counts = new Map<BeatboxClass, number>();
  for (const h of hits) if (isExample(h)) counts.set(h.label, (counts.get(h.label) ?? 0) + 1);

  return (
    <div
      ref={root}
      className="flex min-h-0 flex-1 flex-col outline-none"
      tabIndex={0}
      data-testid="beatbox-recording"
      onPointerDown={() => root.current?.focus({ preventScroll: true })}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input, select, textarea")) return;
        const n = Number(e.key);
        let used = true;
        if (n >= 1 && n <= 8 && !e.metaKey && !e.ctrlKey) label(BEATBOX_CLASSES[n - 1]);
        else if (e.key === "0") label(undefined);
        else if (e.key === "Enter") accept();
        else if (e.key === "Delete" || e.key === "Backspace") void removeHits(selected);
        else if (e.key === "Tab") step(e.shiftKey ? -1 : 1, true);
        else if (e.key === "ArrowRight") step(1, false);
        else if (e.key === "ArrowLeft") step(-1, false);
        else if (e.key === "Escape") select([]);
        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a")
          select(hits.map((h) => h.id));
        else if (e.key.toLowerCase() === "p") playAll();
        else used = false;
        if (used) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-2 py-1.5">
        <div className="segmented" data-hint="beatbox.kind">
          <button
            data-active={rec.kind === "sounds"}
            onClick={() => void updateRecording(rec.id, { kind: "sounds" })}
          >
            Single sounds
          </button>
          <button
            data-active={rec.kind === "take"}
            onClick={() => void updateRecording(rec.id, { kind: "take" })}
          >
            Take
          </button>
        </div>
        <button
          className="tool-btn"
          onClick={playAll}
          data-hint="beatbox.play"
          data-testid="beatbox-play"
          title="Play (P)"
        >
          {playingAll ? <Square size={12} /> : <Play size={12} />}
          {playingAll ? "Stop" : "Play"}
        </button>
        <span className="num text-[10px] text-faint">
          {rec.duration.toFixed(2)} s · {hits.length} hits
          {rec.bpm ? ` · ${rec.bpm} BPM` : ""}
        </span>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5" data-hint="beatbox.sensitivity">
          <span className="label">Sensitivity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="w-20"
          />
        </label>
        <button
          className="tool-btn"
          onClick={() => void redetect(rec.id, sensitivity)}
          data-hint="beatbox.find"
          data-testid="beatbox-find"
          title="Find the hits again (the ones you labeled stay)"
        >
          <ScanSearch size={13} /> Find hits
        </button>
      </div>

      <div className="relative h-40 shrink-0 border-b border-line">
        <HitWaveform
          audio={audio}
          duration={rec.duration}
          hits={hits}
          selected={selected}
          guesses={guesses}
          flagged={tab === "convert" ? flagged : undefined}
          grid={tab === "convert" ? grid : undefined}
          onSelect={select}
          onPlay={(h) => playHit(rec, h)}
          onAdd={(a, b) => void addHit(rec.id, a, b)}
          onTrim={(id, patch) => void updateHit(id, patch)}
        />
        {!audio && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-dim">
            Loading the audio…
          </div>
        )}
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-1.5"
        data-hint="beatbox.labels"
      >
        {BEATBOX_CLASSES.map((c, i) => (
          <button
            key={c}
            className="tool-btn border border-line !px-1.5"
            disabled={!selected.length}
            data-active={!!one && isExample(one) && one.label === c}
            data-testid={`beatbox-label-${c}`}
            onClick={() => label(c)}
            title={`Label as ${CLASS_INFO[c].name} (${i + 1})`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: CLASS_INFO[c].color }} />
            {CLASS_INFO[c].short}
            <span className="kbd !px-1 !text-[9px]">{i + 1}</span>
            {counts.get(c) ? (
              <span className="num text-[9px] text-faint">{counts.get(c)}</span>
            ) : null}
          </button>
        ))}
        <button
          className="tool-btn"
          onClick={accept}
          disabled={!hits.length}
          data-hint="beatbox.accept"
          data-testid="beatbox-accept"
          title="Take the model's guess (Enter); with nothing selected, for every unlabeled hit"
        >
          <Check size={13} /> {selected.length ? "Accept guess" : "Accept all guesses"}
        </button>
        <button
          className="tool-btn"
          onClick={() => void removeHits(selected)}
          disabled={!selected.length}
          data-hint="beatbox.remove-hit"
          data-testid="beatbox-remove-hit"
          title="Remove (Delete)"
        >
          <Trash2 size={13} />
        </button>
        <span className="ml-1 text-[11px] text-dim" data-testid="beatbox-selection">
          {one
            ? `${one.start.toFixed(3)}–${one.end.toFixed(3)} s · ${
                isExample(one) ? `yours: ${CLASS_INFO[one.label].name}` : "not labeled"
              }${
                oneGuess
                  ? ` · model: ${CLASS_INFO[oneGuess.label].name} ${Math.round(oneGuess.confidence * 100)}%`
                  : ""
              }`
            : sel.length
              ? `${sel.length} hits selected`
              : "Click a hit to hear it · drag to add one · 1–8 label · Tab: the next one to check"}
        </span>
      </div>

      {rec.kind === "take" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1">
          <div className="segmented">
            <button data-active={tab === "convert"} onClick={() => setTab("convert")}>
              Convert
            </button>
            <button data-active={tab === "hits"} onClick={() => setTab("hits")}>
              Hits
            </button>
          </div>
        </div>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === "convert" && rec.kind === "take" ? (
          <ConvertView
            rec={rec}
            hits={hits}
            calibration={calibration}
            onGrid={setGrid}
            onFlagged={setFlagged}
          />
        ) : (
          <HitList rec={rec} hits={hits} guesses={guesses} selected={selected} />
        )}
      </div>
    </div>
  );
}

function HitList({
  rec,
  hits,
  guesses,
  selected,
}: {
  rec: BeatboxRecording;
  hits: BeatboxHit[];
  guesses: Record<string, Guess | null>;
  selected: string[];
}) {
  return (
    <table className="w-full text-[11px]" data-testid="beatbox-hits">
      <thead className="sticky top-0 bg-panel text-left">
        <tr className="text-faint">
          <th className="px-2 py-1 font-normal">#</th>
          <th className="px-2 py-1 font-normal">Start</th>
          <th className="px-2 py-1 font-normal">Length</th>
          <th className="px-2 py-1 font-normal">Your label</th>
          <th className="px-2 py-1 font-normal">The model</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {hits.map((h, i) => {
          const g = guesses[h.id];
          const mine = isExample(h);
          const look = needsLook(h, g ?? null);
          return (
            <tr
              key={h.id}
              className={selected.includes(h.id) ? "bg-raised" : "hover:bg-surface"}
              onClick={(e) => {
                const ids =
                  e.shiftKey || e.metaKey || e.ctrlKey
                    ? selected.includes(h.id)
                      ? selected.filter((x) => x !== h.id)
                      : [...selected, h.id]
                    : [h.id];
                useBeatbox.getState().set({ selectedHitIds: ids });
                playHit(rec, h);
              }}
            >
              <td className="num px-2 py-0.5 text-faint">{i + 1}</td>
              <td className="num px-2 py-0.5">{h.start.toFixed(3)}</td>
              <td className="num px-2 py-0.5 text-dim">
                {Math.round((h.end - h.start) * 1000)} ms
              </td>
              <td className="px-2 py-0.5">
                {mine ? (
                  <span style={{ color: CLASS_INFO[h.label].color }}>
                    {CLASS_INFO[h.label].name}
                    {h.labeledBy === "import" && <span className="text-faint"> (imported)</span>}
                  </span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
              <td className={`px-2 py-0.5 ${look ? "text-amber-400" : "text-dim"}`}>
                {g ? `${CLASS_INFO[g.label].name} ${Math.round(g.confidence * 100)}%` : "…"}
              </td>
              <td className="px-1 text-right">
                <button
                  className="tool-btn !h-5 !min-w-5"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeHits([h.id]);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
