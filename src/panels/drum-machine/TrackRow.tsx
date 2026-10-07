import { useEffect, useRef, type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AudioLines, Disc3, GripVertical, Music2, Power } from "lucide-react";
import { contextMenu, useMenu, type MenuItem } from "../../components/Menu";
import { InlineEdit } from "../../components/InlineEdit";
import { MiniFader } from "../../components/MiniFader";
import { Scope } from "../../components/Scope";
import { onStep } from "../../engine/transport";
import { TRACK_PALETTE } from "../../model/colors";
import { KITS, KIT_SOUNDS, kitSounds } from "../../engine/kits";
import { toUnit } from "../../model/params";
import {
  clearLane,
  convertTrack,
  deleteTrack,
  duplicateTrack,
  randomizeLane,
  reverseLane,
  rotateLane,
} from "../../model/project";
import { STEP_SIZES, type Lane, type Pattern, type Track } from "../../model/types";
import { applyHeld } from "../../state/actions";
import { useStore } from "../../state/store";
import { ClipView } from "./ClipView";
import type { Geometry } from "./layout";
import { ScratchStrip } from "./ScratchStrip";
import { StepsArea } from "./StepsArea";

interface Props {
  track: Track;
  index: number;
  lane: Lane;
  pattern: Pattern;
  geo: Geometry;
  selectedSteps: Set<number>;
  isSelected: boolean;
}

function chips(
  label: string,
  options: { label: string; active: boolean; onClick: () => void }[],
): MenuItem {
  return {
    render: (close) => (
      <div className="px-2 py-1.5">
        <div className="label mb-1.5">{label}</div>
        <div className="flex flex-wrap gap-1">
          {options.map((o) => (
            <button
              key={o.label}
              className="tool-btn border border-line"
              data-active={o.active}
              onClick={() => {
                o.onClick();
                close();
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    ),
  };
}

/** Replace the track's sound with a built-in kit sound (the library adds your own in Phase 3). */
function SamplePicker({
  current,
  audio,
  onPick,
}: {
  current?: string;
  audio: boolean;
  onPick: (id: string, name: string) => void;
}) {
  const groups = audio
    ? [{ label: "Loops", sounds: KIT_SOUNDS.filter((k) => k.bpm) }]
    : KITS.map((kit) => ({ label: `${kit} kit`, sounds: kitSounds(kit) }));
  return (
    <div className="max-w-[300px] px-2 py-1.5">
      <div className="label mb-1.5">Replace sound</div>
      {groups.map((g) => (
        <div key={g.label} className="mb-1.5">
          <div className="mb-1 text-[10px] text-faint">{g.label}</div>
          <div className="flex flex-wrap gap-1">
            {g.sounds.map((k) => (
              <button
                key={k.id}
                className="tool-btn border border-line !h-6 !text-[10.5px]"
                data-active={current === k.id}
                onClick={() => onPick(k.id, k.name)}
              >
                {k.name.replace(/^\d+ /, "")}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrackRow({ track, index, lane, pattern, geo, selectedSteps, isSelected }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });
  const stepsRef = useRef<HTMLDivElement>(null);
  const commit = useStore((s) => s.commit);
  const setUi = useStore((s) => s.setUi);
  const jogOpen = useStore((s) => !!s.jogOpen[track.id]);
  const cursorIndex = useStore((s) => (s.cursor?.trackId === track.id ? s.cursor.index : -1));
  const compact = geo.sizeClass === "compact";
  const length =
    lane.kind === "steps" ? (lane.stepCountOverride ?? pattern.stepCount) : pattern.stepCount;

  // playhead + trigger flashes, straight on the DOM (no React re-render per step)
  useEffect(() => {
    let head: Element | null = null;
    return onStep((e) => {
      head?.classList.remove("head");
      head = null;
      if (e.pageStep < 0 || e.patternId !== pattern.id || lane.kind !== "steps") return;
      const i = e.laneSteps.get(track.id) ?? e.pageStep % length;
      const el = stepsRef.current?.querySelector(`[data-i="${i}"]`);
      if (!el) return;
      head = el;
      el.classList.add("head");
      if (e.triggered.has(track.id)) {
        el.classList.remove("trig");
        void (el as HTMLElement).offsetWidth; // restart the animation
        el.classList.add("trig");
      }
    });
  }, [pattern.id, length, lane.kind, track.id]);

  const update = (fn: (t: Track) => void, key?: string) =>
    commit((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    }, key);

  const updateLane = (fn: (l: Lane) => void) =>
    commit((p) => {
      const l = p.patterns[pattern.id].lanes[track.id];
      if (l) fn(l);
    });

  const menuItems = (): MenuItem[] => {
    const steps = lane.kind === "steps";
    return [
      {
        label: "Duplicate",
        shortcut: "DUPL",
        onSelect: () => commit((p) => void duplicateTrack(p, track.id)),
      },
      { label: "Delete", onSelect: () => commit((p) => deleteTrack(p, track.id)) },
      { separator: true },
      {
        render: (close) => (
          <div className="px-2 py-1.5">
            <div className="label mb-1.5">Color</div>
            <div className="grid grid-cols-8 gap-1">
              {TRACK_PALETTE.map((c) => (
                <button
                  key={c}
                  className="h-4 w-4 rounded-sm"
                  style={{
                    background: c,
                    outline: c === track.color ? "2px solid var(--select)" : undefined,
                  }}
                  onClick={() => {
                    update((t) => (t.color = c));
                    close();
                  }}
                />
              ))}
            </div>
          </div>
        ),
      },
      ...(track.kind !== "instrument"
        ? [
            {
              render: (close: () => void) => (
                <SamplePicker
                  current={track.sampleId}
                  audio={track.kind === "audio"}
                  onPick={(id, name) => {
                    update((t) => {
                      t.sampleId = id;
                      t.source = name;
                    });
                    close();
                  }}
                />
              ),
            },
          ]
        : []),
      { separator: true },
      {
        label: "Clear steps",
        shortcut: "CLEAR",
        disabled: !steps,
        onSelect: () => updateLane((l) => l.kind === "steps" && clearLane(l)),
      },
      {
        label: "Shift left",
        disabled: !steps,
        onSelect: () => updateLane((l) => l.kind === "steps" && rotateLane(l, length, -1)),
      },
      {
        label: "Shift right",
        disabled: !steps,
        onSelect: () => updateLane((l) => l.kind === "steps" && rotateLane(l, length, 1)),
      },
      {
        label: "Reverse",
        disabled: !steps,
        onSelect: () => updateLane((l) => l.kind === "steps" && reverseLane(l, length)),
      },
      {
        label: "Randomize",
        shortcut: "RAND",
        disabled: !steps,
        onSelect: () => updateLane((l) => l.kind === "steps" && randomizeLane(l, length)),
      },
      {
        label: "Euclidean…",
        shortcut: "EUCLID",
        disabled: !steps,
        onSelect: () => setUi({ selectedTrackId: track.id, euclidOpen: true }),
      },
      { separator: true },
      ...(steps && lane.kind === "steps"
        ? [
            chips(
              "Track length on this page",
              [undefined, 3, 5, 6, 7, 12].map((n) => ({
                label: n === undefined ? "Page" : String(n),
                active: lane.stepCountOverride === n,
                onClick: () => updateLane((l) => l.kind === "steps" && (l.stepCountOverride = n)),
              })),
            ),
            chips(
              "Track rate on this page",
              [undefined, ...STEP_SIZES].map((sz) => ({
                label: sz ?? "Page",
                active: lane.stepSizeOverride === sz,
                onClick: () => updateLane((l) => l.kind === "steps" && (l.stepSizeOverride = sz)),
              })),
            ),
            { separator: true },
          ]
        : []),
      ...(track.kind === "drum"
        ? [
            chips(
              "Choke group",
              Array.from({ length: 9 }, (_, g) => ({
                label: g === 0 ? "None" : String(g),
                active: toUnit.choke(track.params["sound.choke"] ?? 0) === g,
                onClick: () => update((t) => (t.params["sound.choke"] = g / 8)),
              })),
            ),
          ]
        : []),
      chips(
        "Convert to",
        (["drum", "instrument", "audio"] as const).map((k) => ({
          label: k[0].toUpperCase() + k.slice(1),
          active: track.kind === k,
          onClick: () => commit((p) => convertTrack(p, track.id, k)),
        })),
      ),
    ];
  };

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const typeIcon =
    track.kind === "instrument" ? (
      <Music2 size={12} />
    ) : track.kind === "audio" ? (
      <AudioLines size={12} />
    ) : null;

  return (
    <div ref={setNodeRef} style={style} data-track-row={track.id}>
      <div className="flex w-max min-w-full items-center" style={{ minHeight: geo.padH + 8 }}>
        {/* ---- header ---- */}
        <div
          className="sticky left-0 z-[2] flex shrink-0 items-center gap-1.5 self-stretch bg-panel pr-2"
          style={{ width: geo.headerW }}
          onPointerDown={(e) => {
            if (applyHeld({ trackId: track.id })) e.stopPropagation();
            else setUi({ selectedTrackId: track.id });
          }}
          onContextMenu={(e) => contextMenu(e, menuItems())}
        >
          <div
            className="my-[3px] flex w-[14px] shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-[3px] active:cursor-grabbing"
            style={{ background: track.color, width: compact ? 6 : 14 }}
            {...attributes}
            {...listeners}
            title="Drag to reorder"
          >
            {!compact && <GripVertical size={11} className="text-black/45" />}
          </div>
          <div
            className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 ${isSelected ? "bg-raised" : ""}`}
            style={isSelected ? { boxShadow: `inset 0 0 0 1px ${track.color}` } : undefined}
          >
            {!compact && (
              <span className="num w-4 shrink-0 text-[10px] text-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
            <InlineEdit
              value={track.name}
              onCommit={(v) => update((t) => (t.name = v))}
              className="min-w-0 flex-1 text-[11.5px] font-semibold uppercase tracking-wide"
            />
            {typeIcon && <span className="shrink-0 text-dim">{typeIcon}</span>}
          </div>
          <TrackButton
            label="M"
            title="Mute"
            lit={track.mute}
            color="#f59e0b"
            onClick={() => update((t) => (t.mute = !t.mute))}
          />
          {!compact && (
            <>
              <TrackButton
                label="S"
                title="Solo"
                lit={track.solo}
                color="#22d3ee"
                onClick={() => update((t) => (t.solo = !t.solo))}
              />
              <TrackButton
                label="●"
                title={
                  track.kind === "drum" ? "Record-arm (audio/instrument tracks)" : "Record-arm"
                }
                lit={track.arm}
                color="#ef4444"
                disabled={track.kind === "drum"}
                onClick={() => update((t) => (t.arm = !t.arm))}
              />
              <MiniFader
                value={track.volume}
                color={track.color}
                onChange={(v) => update((t) => (t.volume = v), `vol-${track.id}`)}
              />
              <button
                className="num h-[18px] min-w-[26px] rounded-[3px] border border-line px-1 text-[9.5px] text-dim hover:text-ink"
                title={track.effects.map((f) => f.name).join(" → ") || "No effects"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setUi({ selectedTrackId: track.id, bank: "fx", fxIndex: 0 })}
              >
                FX{track.effects.length ? ` ${track.effects.length}` : ""}
              </button>
            </>
          )}
        </div>

        {/* ---- steps / clip ---- */}
        <div ref={stepsRef} className="flex items-center py-1 pl-1">
          {lane.kind === "steps" ? (
            <StepsArea
              track={track}
              lane={lane}
              length={length}
              geo={geo}
              selected={selectedSteps}
              cursor={cursorIndex}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col gap-1">
                <button
                  className="tool-btn !h-[18px] !min-w-[18px] !p-0"
                  data-active={lane.active}
                  title={lane.active ? "Clip active on this page" : "Clip inactive on this page"}
                  onClick={() => updateLane((l) => l.kind === "clip" && (l.active = !l.active))}
                >
                  <Power size={11} />
                </button>
                {!compact && (
                  <button
                    className="tool-btn !h-[18px] !min-w-[18px] !p-0"
                    data-active={jogOpen}
                    title="Scratch"
                    onClick={() =>
                      setUi({ jogOpen: { ...useStore.getState().jogOpen, [track.id]: !jogOpen } })
                    }
                  >
                    <Disc3 size={11} />
                  </button>
                )}
              </div>
              <div className="relative">
                <ClipView
                  track={track}
                  lane={lane}
                  width={Math.max(80, geo.stepsW - 26)}
                  height={geo.padH}
                />
                <button
                  className="label absolute right-1.5 top-1 rounded bg-panel/80 px-1 !text-[8.5px] hover:!text-ink"
                  onClick={() =>
                    updateLane(
                      (l) =>
                        l.kind === "clip" &&
                        (l.launchMode = l.launchMode === "loop" ? "oneshot" : "loop"),
                    )
                  }
                  title="Launch mode"
                >
                  {lane.launchMode === "loop" ? "Loop" : "1-shot"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* ---- scope + meter ---- */}
        <div
          className="sticky right-0 z-[2] flex shrink-0 items-center self-stretch bg-panel pl-2"
          style={{ width: geo.scopeW }}
        >
          <button
            className="h-[calc(100%-8px)] w-full"
            title="Click to enlarge"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              useMenu.getState().show(r.right - 380, r.bottom + 4, [
                {
                  render: () => (
                    <div className="p-2">
                      <div className="label mb-1.5" style={{ color: track.color }}>
                        {track.name} · scope
                      </div>
                      <div style={{ width: 360, height: 150 }}>
                        <Scope trackId={track.id} color={track.color} />
                      </div>
                    </div>
                  ),
                },
              ]);
            }}
          >
            <Scope trackId={track.id} color={track.color} meter />
          </button>
        </div>
      </div>
      {jogOpen && lane.kind === "clip" && (
        <div className="flex w-max min-w-full">
          <div className="sticky left-0 bg-panel" style={{ width: geo.headerW }} />
          <ScratchStrip track={track} width={Math.max(240, geo.stepsW)} />
        </div>
      )}
    </div>
  );
}

function TrackButton(props: {
  label: string;
  title: string;
  lit: boolean;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="num flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border text-[9.5px] font-bold"
      style={{
        borderColor: props.lit ? props.color : "var(--border)",
        background: props.lit ? props.color : "var(--raised)",
        color: props.lit ? "#000" : props.disabled ? "var(--text-faint)" : "var(--text-dim)",
        opacity: props.disabled ? 0.45 : 1,
      }}
      title={props.title}
      disabled={props.disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}
