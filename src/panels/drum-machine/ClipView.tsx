import { useEffect, useRef } from "react";
import * as engine from "../../engine/engine";
import { samplePeaks } from "../../engine/samples";
import type { ClipLane, Track } from "../../model/types";
import { onFrame } from "../../render/raf";
import { alpha, token } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import { useSamplesVersion } from "../../components/useSamplesVersion";

interface Props {
  track: Track;
  lane: ClipLane;
  width: number;
  height: number;
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
      ctx.fillStyle = alpha(track.color, lane.active ? 0.14 : 0.05);
      ctx.fill();
      const peaks = samplePeaks(track.sampleId);
      ctx.fillStyle = lane.active ? track.color : token("text-faint");
      ctx.globalAlpha = lane.active ? 0.9 : 0.6;
      const mid = h / 2;
      for (let x = 0; x < w; x += 2) {
        const p = peaks[Math.floor((x / w) * (peaks.length - 1))];
        const a = Math.max(0.5, p * (h / 2 - 4));
        ctx.fillRect(x, mid - a, 1.4, a * 2);
      }
      ctx.globalAlpha = 1;
    },
    [track.color, track.sampleId, lane.active, samples],
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

  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={ref} className="block h-full w-full" />
      <div
        ref={head}
        className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded bg-ink opacity-0"
      />
    </div>
  );
}
