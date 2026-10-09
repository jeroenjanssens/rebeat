import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Brain, ChevronDown, Ellipsis, Plus, Speech, Square, X } from "lucide-react";
import { contextMenu, dropdown, type MenuItem } from "../../components/Menu";
import { toast } from "../../components/Toast";
import { ask } from "../../components/Ask";
import { InlineEdit } from "../../components/InlineEdit";
import { openGuide } from "../../app/openers";
import { CLASS_INFO, type BeatboxClass } from "../../library/beatbox/classes";
import type { BeatboxHit, BeatboxRecording } from "../../library/beatbox/dataset";
import { loadModel, useModel } from "../../library/beatbox/model";
import {
  addVoice,
  calibrationOf,
  guessOf,
  hitsOf,
  isExample,
  loadAudio,
  loadBeatbox,
  predict,
  predictVoice,
  removeRecording,
  removeVoice,
  renameVoice,
  setVoice,
  updateRecording,
  useBeatbox,
  type Guess,
} from "../../library/beatbox/store";
import { cancelRecording, stopRecording, useBeatboxRecorder } from "../../library/beatbox/record";
import { RecordDialog } from "./RecordDialog";
import { RecordingView } from "./RecordingView";
import { ModelView } from "./ModelView";
import { addMenu, datasetMenu } from "./actions";

type Filter = "all" | "unlabeled" | "uncertain" | "disagree";

const UNCERTAIN = 0.6;

/** Is a hit worth a look: unlabeled and the model isn't sure, or your label and its guess differ. */
export function needsLook(hit: BeatboxHit, guess: Guess | null) {
  if (!guess) return false;
  if (isExample(hit)) return guess.label !== hit.label;
  return guess.confidence < UNCERTAIN;
}

/**
 * The Beatbox panel (D111): record or add recordings of your beatboxing, label their hits, let
 * the model learn your voice, and turn takes into step tracks.
 */
export function BeatboxPanel() {
  const s = useBeatbox();
  const model = useModel();
  const session = useBeatboxRecorder((r) => r.session);
  const [filter, setFilter] = useState<Filter>("all");
  const [recordOpen, setRecordOpen] = useState(false);
  const [view, setView] = useState<"recording" | "model">("recording");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadBeatbox();
    // the model downloads the first time the panel is used (D109)
    void loadModel().catch(() => {});
  }, []);

  // calibration needs the embeddings of every labeled hit of the voice
  useEffect(() => {
    if (s.loaded && model.status === "ready" && s.voiceId) void predictVoice(s.voiceId);
  }, [s.loaded, model.status, s.voiceId]);

  const rec = s.recordings.find((r) => r.id === s.selectedRecordingId) ?? null;
  useEffect(() => {
    if (rec) {
      void loadAudio(rec);
      if (useModel.getState().status === "ready") void predict(rec.id);
    }
  }, [rec, model.status]);

  const calibrations = useMemo(() => {
    const out = new Map<string, ReturnType<typeof calibrationOf>>();
    for (const v of s.voices) out.set(v.id, calibrationOf(v.id, s));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.voices, s.recordings, s.hits, s.predictions]);

  const guesses = useMemo(() => {
    const out: Record<string, Guess | null> = {};
    const voiceOf = new Map(s.recordings.map((r) => [r.id, r.voiceId]));
    for (const h of s.hits)
      out[h.id] = guessOf(h, calibrations.get(voiceOf.get(h.recordingId) ?? "") ?? null);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.hits, s.predictions, calibrations]);

  const voiceRecordings = s.recordings.filter((r) => r.voiceId === s.voiceId);
  const shown = voiceRecordings.filter((r) => {
    if (filter === "all") return true;
    const hs = hitsOf(r.id, s.hits);
    if (filter === "unlabeled") return hs.some((h) => !isExample(h));
    if (filter === "uncertain")
      return hs.some((h) => !isExample(h) && (guesses[h.id]?.confidence ?? 1) < UNCERTAIN);
    return hs.some((h) => isExample(h) && guesses[h.id] && guesses[h.id]!.label !== h.label);
  });

  const voice = s.voices.find((v) => v.id === s.voiceId);

  const voiceMenu = (el: HTMLElement) => {
    const items: MenuItem[] = s.voices.map((v) => ({
      label: v.name,
      checked: v.id === s.voiceId,
      onSelect: () => void setVoice(v.id),
    }));
    items.push(
      { separator: true },
      {
        label: "New voice…",
        onSelect: async () => {
          const name = await ask({
            title: "New voice",
            message: "Who's beatboxing? Each voice has its own recordings and calibration.",
            input: "",
            placeholder: "A name",
            confirm: "Add",
          });
          if (name) void addVoice(name);
        },
      },
      {
        label: `Rename “${voice?.name ?? ""}”…`,
        onSelect: async () => {
          const name = await ask({
            title: "Rename voice",
            input: voice?.name ?? "",
            confirm: "Rename",
          });
          if (name && voice) void renameVoice(voice.id, name);
        },
      },
      {
        label: `Remove “${voice?.name ?? ""}”…`,
        disabled: s.voices.length < 2,
        onSelect: async () => {
          if (
            voice &&
            (await ask({
              title: "Remove voice",
              message: `Remove the voice “${voice.name}”? Its recordings move to another voice.`,
              confirm: "Remove",
              danger: true,
            }))
          )
            void removeVoice(voice.id);
        },
      },
    );
    dropdown(el, items);
  };

  return (
    <div
      ref={root}
      className="flex h-full flex-col outline-none"
      data-testid="beatbox"
      tabIndex={-1}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
        <button
          className="field"
          data-hint="beatbox.voice"
          data-testid="beatbox-voice"
          onClick={(e) => voiceMenu(e.currentTarget)}
        >
          <Speech size={12} className="text-dim" />
          <span className="max-w-32 truncate">{voice?.name ?? "…"}</span>
          <ChevronDown size={12} className="text-faint" />
        </button>
        {session ? (
          <RecordingStatus />
        ) : (
          <button
            className="hw-btn !min-h-[26px] !flex-row gap-1.5"
            data-hint="beatbox.record"
            data-testid="beatbox-record"
            onClick={() => setRecordOpen(true)}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Record
          </button>
        )}
        <button
          className="tool-btn"
          data-hint="beatbox.add"
          data-testid="beatbox-add"
          onClick={(e) => dropdown(e.currentTarget, addMenu())}
        >
          <Plus size={13} /> Add
        </button>
        <div className="flex-1" />
        <ModelStatus />
        <div className="segmented" data-hint="beatbox.view">
          <button data-active={view === "recording"} onClick={() => setView("recording")}>
            Recordings
          </button>
          <button
            data-active={view === "model"}
            data-testid="beatbox-model-view"
            onClick={() => setView("model")}
          >
            Model
          </button>
        </div>
        <button
          className="tool-btn"
          title="More"
          data-hint="beatbox.menu"
          data-testid="beatbox-menu"
          onClick={(e) =>
            dropdown(e.currentTarget, [
              ...datasetMenu(s.voiceId, voice?.name ?? ""),
              { separator: true },
              { label: "Open the guide", onSelect: () => openGuide("beatbox") },
            ])
          }
        >
          <Ellipsis size={14} />
        </button>
      </div>

      {view === "model" ? (
        <ModelView guesses={guesses} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-56 shrink-0 flex-col border-r border-line">
            <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1">
              <select
                className="input !h-6 w-full !text-[11px]"
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                data-hint="beatbox.filter"
                data-testid="beatbox-filter"
              >
                <option value="all">All recordings</option>
                <option value="unlabeled">With unlabeled hits</option>
                <option value="uncertain">With uncertain guesses</option>
                <option value="disagree">Where you and the model disagree</option>
              </select>
            </div>
            <div
              className="scroll-thin min-h-0 flex-1 overflow-y-auto py-1"
              data-hint="beatbox.list"
              data-testid="beatbox-list"
            >
              {shown.map((r) => (
                <RecordingRow
                  key={r.id}
                  rec={r}
                  hits={hitsOf(r.id, s.hits)}
                  guesses={guesses}
                  selected={r.id === s.selectedRecordingId}
                />
              ))}
              {!shown.length && (
                <p className="px-3 py-4 text-[11px] leading-relaxed text-dim">
                  {voiceRecordings.length
                    ? "Nothing matches this filter."
                    : "No recordings yet. Record single sounds (a kick eight times, then a snare…) so the model learns your voice, or a take to turn into step tracks."}
                </p>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {rec ? (
              <RecordingView
                key={rec.id}
                rec={rec}
                guesses={guesses}
                calibration={calibrations.get(rec.voiceId) ?? null}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-[11px] text-dim">
                <div className="max-w-sm space-y-2">
                  <AudioLines size={28} className="mx-auto text-faint" />
                  <p>
                    Beatbox here, label what you did, and Rebeat learns your sounds. A take becomes
                    step tracks: one per kind of sound, with your rhythm on the steps.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <RecordDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  );
}

function RecordingRow({
  rec,
  hits,
  guesses,
  selected,
}: {
  rec: BeatboxRecording;
  hits: BeatboxHit[];
  guesses: Record<string, Guess | null>;
  selected: boolean;
}) {
  const voices = useBeatbox((s) => s.voices);
  const counts = new Map<BeatboxClass, number>();
  let unlabeled = 0;
  for (const h of hits) {
    if (isExample(h)) counts.set(h.label, (counts.get(h.label) ?? 0) + 1);
    else unlabeled++;
  }
  const look = hits.filter((h) => needsLook(h, guesses[h.id] ?? null)).length;
  return (
    <div
      className={`group mx-1 cursor-default rounded px-2 py-1 ${selected ? "bg-raised" : "hover:bg-surface"}`}
      data-recording={rec.name}
      onClick={() => useBeatbox.getState().set({ selectedRecordingId: rec.id, selectedHitIds: [] })}
      onContextMenu={(e) =>
        contextMenu(e, [
          ...voices
            .filter((v) => v.id !== rec.voiceId)
            .map((v) => ({
              label: `Move to “${v.name}”`,
              onSelect: () => void updateRecording(rec.id, { voiceId: v.id }),
            })),
          ...(voices.length > 1 ? [{ separator: true }] : []),
          {
            label: rec.kind === "take" ? "Treat as single sounds" : "Treat as a take",
            onSelect: () =>
              void updateRecording(rec.id, { kind: rec.kind === "take" ? "sounds" : "take" }),
          },
          {
            label: "Remove…",
            onSelect: async () => {
              if (
                await ask({
                  title: "Remove recording",
                  message: `Remove “${rec.name}” and its ${hits.length} hits? This can't be undone.`,
                  confirm: "Remove",
                  danger: true,
                })
              )
                void removeRecording(rec.id);
            },
          },
        ])
      }
    >
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-faint">{rec.kind === "take" ? "♪" : "•"}</span>
        <InlineEdit
          value={rec.name}
          onCommit={(name) => void updateRecording(rec.id, { name })}
          className="min-w-0 flex-1 text-ink"
        />
        <span className="num text-[10px] text-faint">{hits.length}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-3.5">
        {[...counts].map(([c, n]) => (
          <span
            key={c}
            className="rounded px-1 text-[9px] font-semibold"
            style={{ background: `${CLASS_INFO[c].color}33`, color: CLASS_INFO[c].color }}
          >
            {CLASS_INFO[c].short} {n}
          </span>
        ))}
        {unlabeled > 0 && <span className="text-[9px] text-faint">{unlabeled} unlabeled</span>}
        {look > 0 && (
          <span className="text-[9px] text-amber-400" title="Hits worth a look">
            {look} to check
          </span>
        )}
      </div>
    </div>
  );
}

function RecordingStatus() {
  const session = useBeatboxRecorder((r) => r.session)!;
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 50);
    return () => window.clearInterval(id);
  }, []);
  void now;
  const label =
    session.status === "count-in"
      ? "Get ready…"
      : session.status === "saving"
        ? "Saving…"
        : session.kind === "sounds"
          ? `Recording ${session.label ? CLASS_INFO[session.label].name : ""}`
          : "Recording take";
  return (
    <div className="flex items-center gap-1.5" data-testid="beatbox-session">
      <span className="flex items-center gap-1.5 rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-300">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> {label}
      </span>
      {session.kind === "sounds" && <SoundsPrompt />}
      {session.kind === "take" && !session.end && session.status === "recording" && (
        <button className="tool-btn" onClick={stopRecording} data-testid="beatbox-stop">
          <Square size={12} /> Stop
        </button>
      )}
      <button className="tool-btn" title="Cancel" onClick={cancelRecording}>
        <X size={13} />
      </button>
    </div>
  );
}

/** The pulse that paces single sounds: a dot that lights on every prompt. */
function SoundsPrompt() {
  const session = useBeatboxRecorder((r) => r.session)!;
  const dot = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = async () => {
      const { audioContext } = await import("../../engine/context");
      const t = audioContext().currentTime;
      const prompts = session.prompts ?? [];
      const i = prompts.findIndex((p) => p > t - 0.15);
      const lit = i >= 0 && Math.abs(prompts[i] - t) < 0.12;
      if (dot.current) dot.current.dataset.lit = String(lit);
      if (text.current)
        text.current.textContent =
          i < 0 ? "done" : t < prompts[0] - 0.2 ? "on the light" : `${i + 1} of ${prompts.length}`;
      raf = requestAnimationFrame(() => void tick());
    };
    void tick();
    return () => cancelAnimationFrame(raf);
  }, [session]);
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-dim">
      <span
        ref={dot}
        className="h-3 w-3 rounded-full bg-raised transition-colors data-[lit=true]:bg-lit"
      />
      <span ref={text} className="num" />
    </span>
  );
}

function ModelStatus() {
  const model = useModel();
  const label =
    model.status === "ready"
      ? `Model ${model.info?.version}`
      : model.status === "loading"
        ? "Loading the model…"
        : model.status === "error"
          ? "The model didn't load"
          : "Model";
  return (
    <button
      className="tool-btn"
      data-hint="beatbox.model"
      data-testid="beatbox-model-status"
      data-status={model.status}
      title={model.error ?? undefined}
      onClick={() => {
        if (model.status === "error")
          void loadModel().catch((e: Error) => toast(e.message, "error"));
      }}
    >
      <Brain
        size={13}
        className={
          model.status === "ready"
            ? "text-accent"
            : model.status === "error"
              ? "text-red-400"
              : "animate-pulse"
        }
      />
      {label}
    </button>
  );
}
