/**
 * Audio on the timeline (D188): regions on a Clip track. Drag to move (snaps; Shift: free; Alt:
 * a copy), the edges trim, the top corners fade, the menu has gain, split and delete. A region
 * that runs into the next one's start is cut there (drawn dimmed); one inside a tempo change is
 * marked, because exports bend its pitch there (§0.7).
 */
import { useRef } from "react";
import { contextMenu } from "../../components/Menu";
import { getBuffer, samplePeaks, sampleInfo } from "../../engine/samples";
import { songPosition, startPosition } from "../../engine/transport";
import { toSong } from "../../model/arrangement";
import type { Project } from "../../model/project";
import { tempoAt, tempoChangesIn } from "../../model/tempoMap";
import type { AudioRegion, Track } from "../../model/types";
import { alpha } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import { useSettings } from "../../state/settings";
import {
  copyRegion,
  deleteRegion,
  moveRegion,
  setRegion,
  splitRegion,
  trimRegion,
} from "../../state/timelineActions";
import { dragListeners } from "./dragListeners";
import { TRACK_H, snapQ } from "./geometry";

/** Seconds of the sample per quarter note at q: a warped clip follows the tempo (D192). */
export function sampleSecondsPerQuarter(
  project: Project,
  track: Track,
  sampleId: string,
  q: number,
) {
  const bpm = sampleInfo(sampleId)?.bpm;
  const warp = (track.params["sound.warp"] ?? 1) >= 0.5;
  return warp && bpm ? 60 / bpm : 60 / tempoAt(project, q);
}

function Waveform({
  region,
  width,
  color,
  seconds,
}: {
  region: AudioRegion;
  width: number;
  color: string;
  /** How much of the sample the region plays. */
  seconds: number;
}) {
  const { ref } = useCanvas(
    (ctx, { width: w, height: h }) => {
      ctx.clearRect(0, 0, w, h);
      const dur = getBuffer(region.sampleId)?.duration ?? 0;
      if (!dur) return;
      const peaks = samplePeaks(region.sampleId, 1024);
      // the part of the sample the region plays (past its end: silence)
      const from = region.offset / dur;
      const span = seconds / dur;
      ctx.fillStyle = alpha(color, 0.85);
      const n = Math.max(1, Math.floor(w / 2));
      for (let i = 0; i < n; i++) {
        const f = from + (i / n) * span;
        if (f >= 1) break;
        const v = peaks[Math.floor(f * (peaks.length - 1))] ?? 0;
        ctx.fillRect(i * 2, h / 2 - (v * h) / 2, 1.5, Math.max(1, v * h));
      }
    },
    [region.sampleId, region.offset, width, color, seconds],
  );
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

export function RegionBoxes({
  project,
  track,
  ppq,
}: {
  project: Project;
  track: Track;
  ppq: number;
}) {
  const snap = useSettings((s) => s.timelineSnap);
  const regions = (project.regions ?? [])
    .filter((r) => r.trackId === track.id)
    .map((r) => ({ r, q: toSong(project, r.start) }))
    .filter((x): x is { r: AudioRegion; q: number } => x.q !== null)
    .sort((a, b) => a.q - b.q);
  const box = useRef<HTMLDivElement>(null);
  const grid = (q: number, free: boolean) =>
    snapQ(project, q, free ? "off" : snap === "bar" ? "beat" : snap);

  return (
    <div ref={box} className="pointer-events-none absolute inset-0">
      {regions.map(({ r, q }, i) => {
        const next = regions[i + 1]?.q ?? Infinity;
        const cutAt = Math.min(r.length, next - q);
        const left = q * ppq;
        const width = Math.max(4, r.length * ppq);
        const warn = tempoChangesIn(project, q, q + r.length);
        const local = (clientX: number) =>
          (clientX - box.current!.getBoundingClientRect().left) / ppq;
        const drag = (
          e: React.PointerEvent,
          what: "move" | "left" | "right" | "fadeIn" | "fadeOut",
        ) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          const el = e.currentTarget as HTMLElement;
          el.setPointerCapture(e.pointerId);
          const at0 = local(e.clientX);
          const key = `region-${r.id}-${what}-${Date.now()}`;
          const spq = sampleSecondsPerQuarter(project, track, r.sampleId, q);
          let moved = false;
          const move = (ev: PointerEvent) => {
            const d = local(ev.clientX) - at0;
            if (!moved && Math.abs(d * ppq) < 3) return;
            moved = true;
            if (what === "move") {
              if (!ev.altKey) moveRegion(r.id, grid(Math.max(0, q + d), ev.shiftKey), key);
            } else if (what === "right") {
              const end = grid(q + r.length + d, ev.shiftKey);
              trimRegion(r.id, q, Math.max(0.25, end - q), r.offset, key);
            } else if (what === "left") {
              const start = Math.min(q + r.length - 0.25, Math.max(0, grid(q + d, ev.shiftKey)));
              const into = start - q;
              trimRegion(r.id, start, r.length - into, Math.max(0, r.offset + into * spq), key);
            } else if (what === "fadeIn") {
              setRegion(
                r.id,
                { fadeIn: Math.max(0, Math.min(r.length / 2, (r.fadeIn ?? 0) + d)) },
                key,
              );
            } else {
              setRegion(
                r.id,
                { fadeOut: Math.max(0, Math.min(r.length / 2, (r.fadeOut ?? 0) - d)) },
                key,
              );
            }
          };
          const up = (ev: PointerEvent) => {
            if (moved && what === "move" && ev.altKey) {
              const d = local(ev.clientX) - at0;
              copyRegion(r.id, grid(Math.max(0, q + d), ev.shiftKey));
            }
          };
          dragListeners(el, move, up);
        };
        const split = () => {
          const at = songPosition() ?? startPosition();
          const spq = sampleSecondsPerQuarter(project, track, r.sampleId, q);
          splitRegion(r.id, at, q, (at - q) * spq);
        };
        return (
          <div
            key={r.id}
            className="pointer-events-auto absolute top-[1px] cursor-grab overflow-hidden rounded-[3px] outline-none focus:ring-1 focus:ring-[var(--select)]"
            style={{
              left,
              width,
              height: TRACK_H - 2,
              background: alpha(track.color, 0.22),
              boxShadow: `inset 0 0 0 1px ${alpha(track.color, 0.8)}`,
            }}
            tabIndex={0}
            title={`${sampleInfo(r.sampleId)?.name ?? "Audio"}${warn ? " · ⚠ Exports bend this clip's pitch while the tempo changes" : ""}`}
            data-hint="timeline.region"
            data-testid="timeline-region"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => drag(e, "move")}
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                e.stopPropagation();
                deleteRegion(r.id);
              } else if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                split();
              }
            }}
            onContextMenu={(e) => {
              e.stopPropagation();
              contextMenu(e, [
                {
                  render: () => (
                    <div className="label px-2 pt-1">{sampleInfo(r.sampleId)?.name ?? "Audio"}</div>
                  ),
                },
                ...[-12, -6, -3, 0, 3, 6].map((g) => ({
                  label: `Gain ${g > 0 ? "+" : ""}${g} dB`,
                  checked: (r.gain ?? 0) === g,
                  onSelect: () => setRegion(r.id, { gain: g || undefined }),
                })),
                { separator: true },
                { label: "Split at the playhead", shortcut: "S", onSelect: split },
                { label: "Delete", shortcut: "⌫", onSelect: () => deleteRegion(r.id) },
              ]);
            }}
          >
            <Waveform
              region={r}
              width={width}
              color={track.color}
              seconds={r.length * sampleSecondsPerQuarter(project, track, r.sampleId, q)}
            />
            {cutAt < r.length && (
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-panel/70"
                style={{ left: cutAt * ppq }}
                title="Cut here: the next clip on this track starts"
              />
            )}
            {(r.fadeIn ?? 0) > 0 && (
              <svg
                className="pointer-events-none absolute left-0 top-0 h-full"
                width={(r.fadeIn ?? 0) * ppq}
              >
                <line x1={0} y1="100%" x2="100%" y2={0} stroke="var(--select)" strokeWidth={1} />
              </svg>
            )}
            {(r.fadeOut ?? 0) > 0 && (
              <svg
                className="pointer-events-none absolute right-0 top-0 h-full"
                width={(r.fadeOut ?? 0) * ppq}
              >
                <line x1={0} y1={0} x2="100%" y2="100%" stroke="var(--select)" strokeWidth={1} />
              </svg>
            )}
            {warn && <span className="absolute right-1 top-0 text-[9px] text-lit">⚠</span>}
            <div
              className="absolute inset-y-0 left-0 w-[5px] cursor-ew-resize"
              onPointerDown={(e) => drag(e, "left")}
            />
            <div
              className="absolute inset-y-0 right-0 w-[5px] cursor-ew-resize"
              onPointerDown={(e) => drag(e, "right")}
            />
            <div
              className="absolute left-[5px] top-0 h-[6px] w-[6px] cursor-ew-resize rounded-sm bg-[var(--select)]/60"
              title="Fade in"
              onPointerDown={(e) => drag(e, "fadeIn")}
            />
            <div
              className="absolute right-[5px] top-0 h-[6px] w-[6px] cursor-ew-resize rounded-sm bg-[var(--select)]/60"
              title="Fade out"
              onPointerDown={(e) => drag(e, "fadeOut")}
            />
          </div>
        );
      })}
    </div>
  );
}
