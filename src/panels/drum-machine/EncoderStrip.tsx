import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { Encoder } from "../../components/Encoder";
import { samplePeaks } from "../../engine/samples";
import {
  EFFECT_PARAMS,
  MIX_PARAMS,
  SOUND_PARAMS,
  stepParams,
  type ParamDef,
} from "../../model/params";
import type { Track } from "../../model/types";
import { token } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import { useSamplesVersion } from "../../components/useSamplesVersion";
import { editSteps, selectedIndices } from "../../state/actions";
import { stepKey, useEditPattern, useSelectedTrack, useStore, type Bank } from "../../state/store";
import type { SizeClass } from "./layout";

const BANKS: { id: Bank; label: string }[] = [
  { id: "sound", label: "Sound" },
  { id: "step", label: "Step" },
  { id: "fx", label: "FX" },
  { id: "mix", label: "Mix" },
];

interface Slot {
  def: ParamDef | null;
  value: number | null;
  onChange: (v: number) => void;
}

/** What the 8 encoders control for the selected track and bank. */
function useEncoderSlots(track: Track): { slots: Slot[]; note?: string } {
  const pattern = useEditPattern();
  const { bank, fxIndex, commit } = useStore();
  const selected = useStore((s) => s.selectedSteps);
  const nop = () => {};

  const setTrack = (fn: (t: Track) => void, key: string) =>
    commit((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    }, key);

  const pad = (slots: Slot[]) =>
    [
      ...slots,
      ...Array.from({ length: 8 - slots.length }, () => ({
        def: null,
        value: null,
        onChange: nop,
      })),
    ].slice(0, 8);

  if (bank === "sound" || bank === "mix") {
    const defs = bank === "sound" ? SOUND_PARAMS[track.kind] : MIX_PARAMS;
    return {
      slots: defs.map((def) => {
        const key = `${bank}.${def.id}`;
        if (def.id === "volume" && bank === "mix")
          return {
            def,
            value: track.volume,
            onChange: (v) => setTrack((t) => (t.volume = v), `enc-${track.id}-vol`),
          };
        return {
          def,
          value: track.params[key] ?? def.default,
          onChange: (v) => setTrack((t) => (t.params[key] = v), `enc-${track.id}-${key}`),
        };
      }),
    };
  }

  if (bank === "fx") {
    const fx = track.effects[fxIndex];
    if (!fx)
      return {
        slots: pad([]),
        note: "No effects on this track. Add them in the Inspector (Phase 5).",
      };
    const defs = EFFECT_PARAMS[fx.name] ?? [];
    return {
      slots: pad(
        defs.map((def) => ({
          def,
          value: fx.params[def.id] ?? def.default,
          onChange: (v) =>
            setTrack(
              (t) => (t.effects[fxIndex].params[def.id] = v),
              `enc-${track.id}-fx${fxIndex}-${def.id}`,
            ),
        })),
      ),
    };
  }

  // STEP bank: edits the selected steps of this track, relative to the first one
  const lane = pattern.lanes[track.id];
  const indices = Object.keys(selected).length ? selectedIndices(track.id) : [];
  const defs = stepParams(track.kind, true);
  if (lane?.kind !== "steps") return { slots: pad([]), note: "Audio tracks have no steps." };
  if (indices.length === 0)
    return {
      slots: defs.map((def) => ({ def, value: null, onChange: nop })),
      note: "Select steps to edit them: Alt+click, the Select tool, or hold SELECT.",
    };
  const first = lane.steps[indices[0]];
  return {
    slots: defs.map((def) => ({
      def,
      value: def.get(first),
      onChange: (v) => {
        const delta = v - def.get(first);
        editSteps(
          indices.map((i) => stepKey(track.id, i)),
          (s) => def.set(s, Math.min(1, Math.max(0, def.get(s) + delta))),
          `enc-step-${def.id}`,
        );
      },
    })),
  };
}

function Display({ track, width }: { track: Track; width: number }) {
  const selectedCount = useStore(
    (s) => Object.keys(s.selectedSteps).filter((k) => k.startsWith(`${track.id}:`)).length,
  );
  const index = useStore((s) => s.project.tracks.findIndex((t) => t.id === track.id));
  const samples = useSamplesVersion();
  const { ref } = useCanvas(
    (ctx, { width: w, height: h }) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = track.color;
      ctx.fillStyle = track.color;
      if (track.kind === "instrument") {
        // envelope shape from the sound parameters
        const a = track.params["sound.attack"] ?? 0.05;
        const d = track.params["sound.decay"] ?? 0.4;
        const s = track.params["sound.sustain"] ?? 0.7;
        const r = track.params["sound.release"] ?? 0.35;
        const seg = w / 4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h - 1);
        ctx.lineTo(a * seg, 2);
        ctx.lineTo(a * seg + d * seg, h - s * (h - 3));
        ctx.lineTo(w - r * seg, h - s * (h - 3));
        ctx.lineTo(w, h - 1);
        ctx.stroke();
      } else {
        const peaks = samplePeaks(track.sampleId);
        const mid = h / 2;
        for (let x = 0; x < w; x += 2) {
          const p = peaks[Math.floor((x / w) * (peaks.length - 1))];
          ctx.fillRect(x, mid - p * mid, 1.3, Math.max(1, p * h));
        }
      }
      ctx.fillStyle = token("text-faint");
      ctx.fillRect(0, h / 2, w, 0.5);
    },
    [track.color, track.sampleId, track.kind, track.params, samples],
  );

  return (
    <div
      className="flex shrink-0 flex-col justify-between rounded-md border border-line bg-display px-2.5 py-2"
      style={{ width }}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className="num font-semibold" style={{ color: track.color }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="truncate font-semibold uppercase tracking-wider text-white/90">
          {track.name}
        </span>
        <span className="label ml-auto !text-white/40">{track.kind}</span>
      </div>
      <div className="relative my-1.5 h-[30px]">
        <canvas ref={ref} className="block h-full w-full" />
        {selectedCount > 0 && (
          <div className="label absolute inset-0 flex items-center justify-center rounded bg-black/70 !text-[10px] !text-white">
            {selectedCount} step{selectedCount > 1 ? "s" : ""} selected
          </div>
        )}
      </div>
      <div className="num truncate text-[10px] text-white/50">{track.source}</div>
    </div>
  );
}

export function EncoderStrip({ sizeClass }: { sizeClass: SizeClass }) {
  const track = useSelectedTrack();
  const { bank, fxIndex, setUi } = useStore();
  const { slots, note } = useEncoderSlots(track);
  const [open, setOpen] = useState(false);
  const fx = track.effects[fxIndex];

  const tabs = (
    <div className="flex items-center gap-1">
      <div className="segmented">
        {BANKS.map((b) => (
          <button key={b.id} data-active={bank === b.id} onClick={() => setUi({ bank: b.id })}>
            {b.label}
          </button>
        ))}
      </div>
      {bank === "fx" && track.effects.length > 0 && (
        <div className="flex items-center gap-0.5 text-[10px]">
          <button
            className="tool-btn !h-6 !min-w-6 !p-0"
            onClick={() =>
              setUi({ fxIndex: (fxIndex - 1 + track.effects.length) % track.effects.length })
            }
          >
            <ChevronLeft size={13} />
          </button>
          <span className="label !text-ink">
            {fx?.name ?? "—"}{" "}
            <span className="text-faint">
              {fxIndex + 1}/{track.effects.length}
            </span>
          </span>
          <button
            className="tool-btn !h-6 !min-w-6 !p-0"
            onClick={() => setUi({ fxIndex: (fxIndex + 1) % track.effects.length })}
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );

  const knobSize = sizeClass === "large" ? 52 : 40;
  const encoders = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {tabs}
        {note && <span className="truncate text-[10.5px] text-faint">{note}</span>}
      </div>
      <div className="flex items-start justify-between gap-1">
        {slots.map((s, i) =>
          s.def ? (
            <Encoder
              key={`${bank}-${i}-${s.def.id}`}
              def={s.def}
              value={s.value}
              onChange={s.onChange}
              color={track.color}
              size={knobSize}
            />
          ) : (
            <div
              key={i}
              style={{ width: knobSize + 18 }}
              className="flex flex-col items-center gap-0.5 opacity-30"
            >
              <div className="label">—</div>
              <div
                className="rounded-full border border-line"
                style={{ width: knobSize - 12, height: knobSize - 12, margin: 6 }}
              />
            </div>
          ),
        )}
      </div>
    </div>
  );

  if (sizeClass === "compact") {
    const summary = slots
      .filter((s) => s.def)
      .slice(0, 4)
      .map((s) => `${s.def!.label} ${s.value === null ? "—" : s.def!.format(s.value)}`)
      .join(" · ");
    return (
      <div className="relative shrink-0 border-b border-line">
        <button
          className="flex h-8 w-full items-center gap-2 px-3 text-left"
          onClick={() => setOpen(!open)}
        >
          <span className="h-3 w-1.5 rounded-sm" style={{ background: track.color }} />
          <span className="text-[11px] font-semibold uppercase tracking-wide">{track.name}</span>
          <span className="label">{bank}</span>
          <span className="num min-w-0 flex-1 truncate text-[10px] text-dim">{summary}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {open && (
          <div className="absolute inset-x-2 top-full z-20 flex flex-col gap-2 rounded-lg border border-line-strong bg-raised p-3 shadow-2xl">
            <Display track={track} width={240} />
            {encoders}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-stretch gap-3 border-b border-line bg-surface/60 px-3 py-2">
      <Display track={track} width={sizeClass === "large" ? 280 : 220} />
      {encoders}
    </div>
  );
}
