import { useEffect, useRef } from "react";
import * as engine from "../../engine/engine";
import { samplePeaks } from "../../engine/samples";
import { clipOf, type Lane, type Track } from "../../model/types";
import { sampleOf } from "../../model/tracks";
import { contextMenu, type MenuItem } from "../../components/Menu";
import { useStore } from "../../state/store";
import {
  clearClip,
  doubleClip,
  halveClip,
  layerToTrack,
  mergeLayers,
  removeLastLayer,
  toggleLayer,
} from "../../state/clipActions";
import { onFrame } from "../../render/raf";
import { alpha, token } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import { useSamplesVersion } from "../../components/useSamplesVersion";

interface Props {
  track: Track;
  lane: Lane;
  width: number;
  height: number;
}

function clipMenu(track: Track): MenuItem[] {
  const layers = track.layers ?? [];
  return [
    { label: "Double length", disabled: !sampleOf(track), onSelect: () => doubleClip(track.id) },
    { label: "Halve length", disabled: !sampleOf(track), onSelect: () => halveClip(track.id) },
    { separator: true },
    ...layers.map((l, i) => ({
      label: `Layer ${i + 1}`,
      checked: !l.mute,
      onSelect: () => toggleLayer(track.id, l.id),
    })),
    ...(layers.length
      ? [
          { label: "Undo last layer", onSelect: () => removeLastLayer(track.id) },
          { label: "Merge layers", onSelect: () => mergeLayers(track.id) },
          {
            label: "Last layer → new track",
            onSelect: () => layerToTrack(track.id, layers[layers.length - 1].id),
          },
          { separator: true },
        ]
      : []),
    { label: "Clear clip", disabled: !sampleOf(track), onSelect: () => clearClip(track.id) },
  ];
}

/** Waiting for the bar / recording progress / saving, over the clip. */
function RecordingOverlay({ looper }: { looper: { status: string; start: number; end: number } }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      onFrame(() => {
        if (!bar.current || !looper.end) return;
        const p = (engine.audioNow() - looper.start) / (looper.end - looper.start);
        bar.current.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
      }),
    [looper.start, looper.end],
  );
  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[5px]"
      style={{ background: "rgba(239,68,68,0.14)", boxShadow: "inset 0 0 0 1.5px #ef4444" }}
    >
      <div
        ref={bar}
        className="absolute inset-y-0 left-0 w-full origin-left bg-[#ef4444]/25"
        style={{ transform: "scaleX(0)" }}
      />
      <span className="label relative !text-[#fca5a5]">
        {looper.status === "waiting"
          ? "Recording on the next bar…"
          : looper.status === "recording"
            ? "● Recording"
            : "Saving…"}
      </span>
    </div>
  );
}

/** An audio track's clip: the waveform across the page, with a moving playhead. */
export function ClipView({ track, lane, width, height }: Props) {
  const head = useRef<HTMLDivElement>(null);
  const samples = useSamplesVersion();
  const { ref } = useCanvas(
    (ctx, { width: w, height: h }) => {
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 5);
      ctx.fillStyle = token("pad-bg");
      ctx.fill();
      ctx.fillStyle = alpha(track.color, clipOf(lane).active ? 0.14 : 0.05);
      ctx.fill();
      const peaks = samplePeaks(sampleOf(track));
      ctx.fillStyle = clipOf(lane).active ? track.color : token("text-faint");
      ctx.globalAlpha = clipOf(lane).active ? 0.9 : 0.6;
      const mid = h / 2;
      for (let x = 0; x < w; x += 2) {
        const p = peaks[Math.floor((x / w) * (peaks.length - 1))];
        const a = Math.max(0.5, p * (h / 2 - 4));
        ctx.fillRect(x, mid - a, 1.4, a * 2);
      }
      ctx.globalAlpha = 1;
    },
    [track.color, track.sound, lane, samples],
  );

  useEffect(
    () =>
      onFrame(() => {
        const el = head.current;
        if (!el) return;
        const pos = engine.clipPosition(track.id);
        el.style.opacity = pos === null ? "0" : "1";
        if (pos !== null) el.style.transform = `translateX(${pos * width}px)`;
      }),
    [track.id, width],
  );

  const looper = useStore((s) => (s.looper.trackId === track.id ? s.looper : null));
  const layers = track.layers ?? [];
  return (
    <div
      className="relative"
      style={{ width, height }}
      onContextMenu={(e) => {
        e.stopPropagation();
        contextMenu(e, clipMenu(track));
      }}
      // click: hear the clip once (again: stop); while the song plays it plays along
      onClick={() => engine.playOnce(track)}
      data-testid="clip-wave"
    >
      <canvas ref={ref} className="block h-full w-full" />
      {layers.length > 0 && (
        <span
          className="num absolute bottom-1 left-1.5 rounded bg-panel/80 px-1 text-[8.5px] text-dim"
          title="Overdub layers"
        >
          +{layers.filter((l) => !l.mute).length}/{layers.length} layers
        </span>
      )}
      {!sampleOf(track) && !looper && (
        <span className="label absolute inset-0 flex items-center justify-center !text-[9px]">
          {track.arm
            ? "Armed: press Rec to record a loop"
            : "Empty clip: arm ● and record, or drop a sample"}
        </span>
      )}
      {looper && <RecordingOverlay looper={looper} />}
      <div
        ref={head}
        className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded bg-ink opacity-0"
      />
    </div>
  );
}
