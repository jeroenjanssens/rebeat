import { useEffect, useRef, useState } from "react";
import { audioNow } from "../../engine/engine";
import { onFrame } from "../../render/raf";
import { alpha, token } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import { CLASS_INFO } from "../../library/beatbox/classes";
import type { BeatboxHit } from "../../library/beatbox/dataset";
import type { Audio, Guess } from "../../library/beatbox/store";
import { isExample } from "../../library/beatbox/store";

/** Where the preview is playing (for the playhead): the audio time it started, from where. */
export interface Playhead {
  when: number;
  offset: number;
  duration: number;
  loop: boolean;
}
let playing: Playhead | null = null;
export function setPlayhead(p: Playhead | null) {
  playing = p;
}

export interface Grid {
  bpm: number;
  firstBeat: number;
  /** Seconds per step. */
  step: number;
  stepsPerBar: number;
}

interface Props {
  audio: Audio | undefined;
  duration: number;
  hits: BeatboxHit[];
  selected: string[];
  guesses: Record<string, Guess | null>;
  flagged?: Set<string>;
  grid?: Grid;
  onSelect: (ids: string[]) => void;
  onPlay: (hit: BeatboxHit) => void;
  onAdd: (start: number, end: number) => void;
  onTrim: (id: string, patch: { start?: number; end?: number }) => void;
}

const EDGE = 5;

/**
 * The selected recording: its waveform with every hit as a region colored by its class (your
 * label, or the model's guess in outline). Drag a region's edges to trim it, drag on empty space
 * to add a hit, click to select and hear one; Ctrl/⌘ + wheel zooms, the wheel scrolls.
 */
export function HitWaveform(props: Props) {
  const { audio, duration, hits, selected, guesses, flagged, grid } = props;
  // null: the whole recording
  const [zoom, setView] = useState<[number, number] | null>(null);
  const view: [number, number] = zoom ?? [0, Math.max(0.01, duration)];
  const drag = useRef<
    | { kind: "start" | "end"; id: string; t: number }
    | { kind: "new"; from: number; to: number }
    | null
  >(null);
  const [, force] = useState(0);
  const [cursor, setCursor] = useState("crosshair");

  const toX = (t: number, w: number) => ((t - view[0]) / (view[1] - view[0])) * w;
  const toT = (x: number, w: number) => view[0] + (x / w) * (view[1] - view[0]);

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = token("display");
    ctx.fillRect(0, 0, w, h);
    const mid = h / 2 + 6;
    // the grid of a take: bars and beats
    if (grid) {
      const beat = grid.step * 4;
      const first = Math.ceil((view[0] - grid.firstBeat) / grid.step);
      for (let i = first; ; i++) {
        const t = grid.firstBeat + i * grid.step;
        if (t > view[1]) break;
        const x = toX(t, w);
        const bar = i % grid.stepsPerBar === 0;
        const isBeat =
          Math.abs((t - grid.firstBeat) / beat - Math.round((t - grid.firstBeat) / beat)) < 1e-6;
        if (!bar && !isBeat && (grid.step / (view[1] - view[0])) * w < 6) continue;
        ctx.fillStyle = alpha(token("text-faint"), bar ? 0.5 : isBeat ? 0.25 : 0.1);
        ctx.fillRect(Math.round(x), 0, 1, h);
      }
    }
    // the waveform
    if (audio) {
      const peaks = audio.peaks;
      ctx.fillStyle = alpha(token("text-dim"), 0.55);
      for (let x = 0; x < w; x++) {
        const a = Math.floor((toT(x, w) / duration) * peaks.length);
        const b = Math.max(a + 1, Math.floor((toT(x + 1, w) / duration) * peaks.length));
        let m = 0;
        for (let i = Math.max(0, a); i < Math.min(peaks.length, b); i++) m = Math.max(m, peaks[i]);
        const y = m * (h / 2 - 16);
        ctx.fillRect(x, mid - y, 1, Math.max(1, y * 2));
      }
    }
    // hits
    const sel = new Set(selected);
    ctx.font = "600 9px Inter Variable, sans-serif";
    ctx.textBaseline = "top";
    for (const hit of hits) {
      const x0 = toX(hit.start, w);
      const x1 = toX(hit.end, w);
      if (x1 < 0 || x0 > w) continue;
      const guess = guesses[hit.id];
      const mine = isExample(hit);
      const cls = mine ? hit.label : (hit.label ?? guess?.label);
      const color = cls ? CLASS_INFO[cls].color : token("text-dim");
      const isSel = sel.has(hit.id);
      ctx.fillStyle = alpha(color, isSel ? 0.32 : mine ? 0.18 : 0.08);
      ctx.fillRect(x0, 14, x1 - x0, h - 14);
      ctx.strokeStyle = alpha(color, isSel ? 1 : 0.7);
      ctx.lineWidth = isSel ? 1.5 : 1;
      if (!mine) ctx.setLineDash([3, 3]);
      ctx.strokeRect(x0 + 0.5, 14.5, Math.max(1, x1 - x0 - 1), h - 15);
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.fillRect(x0, 14, 2, h - 14);
      if (x1 - x0 > 16) {
        const disagree = mine && guess && guess.label !== hit.label;
        const text =
          (cls ? CLASS_INFO[cls].short : "?") +
          (mine ? "" : guess ? ` ${Math.round(guess.confidence * 100)}%` : "") +
          (disagree ? " ≠" : "") +
          (flagged?.has(hit.id) ? " !" : "");
        ctx.fillStyle = mine ? token("text") : token("text-dim");
        ctx.fillText(text, x0 + 4, 18, Math.max(0, x1 - x0 - 6));
      }
    }
    const d = drag.current;
    if (d?.kind === "new") {
      const a = toX(Math.min(d.from, d.to), w);
      const b = toX(Math.max(d.from, d.to), w);
      ctx.fillStyle = alpha(token("accent"), 0.2);
      ctx.fillRect(a, 14, b - a, h - 14);
    }
    // the time ruler
    ctx.fillStyle = token("panel");
    ctx.fillRect(0, 0, w, 13);
    ctx.fillStyle = token("text-faint");
    const span = view[1] - view[0];
    const tick = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10].find((s) => (s / span) * w > 60) ?? 10;
    for (let t = Math.ceil(view[0] / tick) * tick; t <= view[1]; t += tick) {
      const x = toX(t, w);
      ctx.fillRect(Math.round(x), 9, 1, 4);
      ctx.fillText(`${t.toFixed(tick < 1 ? 2 : 0)}s`, x + 3, 1);
    }
    // the playhead
    const p = playing;
    if (p) {
      let t = audioNow() - p.when;
      if (t >= 0) {
        if (p.loop) t %= p.duration;
        if (t <= p.duration) {
          ctx.fillStyle = token("lit");
          ctx.fillRect(Math.round(toX(p.offset + t, w)), 0, 1.5, h);
        }
      }
    }
  };

  const { ref, size } = useCanvas(
    (ctx, { width, height }) => draw(ctx, width, height),
    [audio, hits, selected, guesses, view, flagged, grid],
  );

  useEffect(
    () =>
      onFrame(() => {
        if (!playing) return;
        const ctx = ref.current?.getContext("2d");
        const { width, height, dpr } = size.current;
        if (!ctx || !width) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(ctx, width, height);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audio, hits, selected, guesses, view, flagged, grid],
  );

  const hitAt = (x: number, w: number) => {
    // edges first (the nearest within EDGE px), then the region under the pointer
    let best: { id: string; kind: "start" | "end"; d: number } | null = null;
    for (const h of hits) {
      for (const kind of ["start", "end"] as const) {
        const d = Math.abs(toX(h[kind], w) - x);
        if (d <= EDGE && (!best || d < best.d)) best = { id: h.id, kind, d };
      }
    }
    if (best) return best;
    const t = toT(x, w);
    const inside = hits.filter((h) => t >= h.start && t <= h.end);
    const h = inside[inside.length - 1];
    return h ? { id: h.id, kind: "inside" as const, d: 0 } : null;
  };

  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left, w: r.width };
  };

  return (
    <canvas
      ref={ref}
      className="h-full w-full touch-none"
      data-testid="beatbox-wave"
      data-hint="beatbox.wave"
      style={{ cursor }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const { x, w } = local(e);
        const at = hitAt(x, w);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (at && at.kind !== "inside") {
          drag.current = { kind: at.kind, id: at.id, t: toT(x, w) };
          if (!selected.includes(at.id)) props.onSelect([at.id]);
          return;
        }
        if (at) {
          const additive = e.shiftKey || e.metaKey || e.ctrlKey;
          props.onSelect(
            additive
              ? selected.includes(at.id)
                ? selected.filter((id) => id !== at.id)
                : [...selected, at.id]
              : [at.id],
          );
          const hit = hits.find((h) => h.id === at.id);
          if (hit) props.onPlay(hit);
          return;
        }
        const t = toT(x, w);
        drag.current = { kind: "new", from: t, to: t };
        props.onSelect([]);
      }}
      onPointerMove={(e) => {
        const { x, w } = local(e);
        const d = drag.current;
        if (!d) {
          const at = hitAt(x, w);
          const next = at && at.kind !== "inside" ? "ew-resize" : at ? "pointer" : "crosshair";
          if (next !== cursor) setCursor(next);
          return;
        }
        const t = Math.min(duration, Math.max(0, toT(x, w)));
        if (d.kind === "new") d.to = t;
        else d.t = t;
        if (d.kind !== "new") {
          const h = hits.find((x) => x.id === d.id);
          if (h) {
            // live: draw the edge where it is now
            const moved = { ...h, [d.kind]: t };
            if (moved.end > moved.start + 0.01) Object.assign(h, moved);
          }
        }
        force((n) => n + 1);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (d.kind === "new") {
          const a = Math.min(d.from, d.to);
          const b = Math.max(d.from, d.to);
          if (b - a > 0.015) props.onAdd(a, b);
          force((n) => n + 1);
          return;
        }
        const h = hits.find((x) => x.id === d.id);
        if (h) props.onTrim(d.id, d.kind === "start" ? { start: h.start } : { end: h.end });
      }}
      onWheel={(e) => {
        const { x, w } = local(e);
        const span = view[1] - view[0];
        if (e.ctrlKey || e.metaKey) {
          const t = toT(x, w);
          const k = Math.exp(e.deltaY * 0.004);
          const next = Math.min(duration, Math.max(0.05, span * k));
          const a = Math.max(0, Math.min(duration - next, t - (x / w) * next));
          setView([a, a + next]);
        } else if (span < duration) {
          const dt = ((e.deltaX || e.deltaY) / w) * span;
          const a = Math.max(0, Math.min(duration - span, view[0] + dt));
          setView([a, a + span]);
        }
      }}
      onDoubleClick={() => setView(null)}
    />
  );
}
