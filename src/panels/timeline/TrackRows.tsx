/**
 * The track rows (D184): each track's lane in every section, in miniature; click a cell to mute
 * the track in that section only (D183). Clip tracks show their audio regions (D188), and every
 * automation lane (D186) sits under its track, the buses or the master.
 */
import { Plus } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { contextMenu, type MenuItem } from "../../components/Menu";
import { layout, toSong } from "../../model/arrangement";
import { automatableKnobs, knobFor, knobValue, targetOwner } from "../../model/automation";
import type { Project } from "../../model/project";
import { clipOf, type AutomationLane, type Track } from "../../model/types";
import { alpha, token } from "../../render/theme";
import { useSettings } from "../../state/settings";
import { useStore } from "../../state/store";
import { droppedSamples, isSampleDrag } from "../../library/drop";
import { loadSample } from "../../library/library";
import {
  addPoint,
  addRegion,
  sampleQuarters,
  automate,
  clearLane,
  deleteLane,
  deletePoints,
  movePoint,
  setLaneOn,
  setPointHold,
  toggleMuteHere,
} from "../../state/timelineActions";
import { CurveLane, type LanePoint } from "./CurveLane";
import { HEADER, LANE_H, TRACK_H, snapQ } from "./geometry";
import { RegionBoxes } from "./RegionBox";
import { ViewCanvas, type View } from "./ViewCanvas";

/** A track's lane in every section and repeat, in miniature; muted cells hatched. */
function drawTrack(
  ctx: CanvasRenderingContext2D,
  project: Project,
  track: Track,
  ppq: number,
  from: number,
  to: number,
) {
  const h = TRACK_H;
  for (const b of layout(project)) {
    if (b.start * ppq > to || (b.start + b.span) * ppq < from) continue;
    const lane = b.pattern.lanes[track.id];
    const muted = b.section.mutes?.includes(track.id);
    const rw = b.length * ppq;
    for (let r = 0; r < b.repeats; r++) {
      const rx = (b.start + r * b.length) * ppq;
      if (rx > to || rx + rw < from) continue;
      if (lane) {
        if (track.mode === "clip") {
          if (clipOf(lane).active) {
            ctx.fillStyle = alpha(track.color, 0.35);
            ctx.fillRect(rx + 1, 5, rw - 2, h - 10);
          }
        } else {
          const cw = rw / b.steps;
          const len = lane.stepCountOverride ?? b.pattern.stepCount;
          for (let s = 0; s < b.steps; s++) {
            const st = lane.steps[s % len];
            if (!st.on) continue;
            ctx.fillStyle = alpha(track.color, 0.5 + st.velocity * 0.5);
            if (track.mode === "notes" && st.notes?.length) {
              const longest = Math.max(...st.notes.map((n) => n.length));
              ctx.fillRect(
                rx + s * cw,
                7,
                Math.max(1, Math.min(longest, b.steps - s) * cw - 1),
                h - 14,
              );
            } else ctx.fillRect(rx + s * cw + cw * 0.15, 5, Math.max(1, cw * 0.6), h - 10);
          }
        }
      }
      if (muted) {
        // hatched: muted in this section only
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, 0, rw, h);
        ctx.clip();
        ctx.strokeStyle = token("hatch") || "rgba(0,0,0,0.45)";
        ctx.lineWidth = 2;
        for (let x = rx - h; x < rx + rw; x += 6) {
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.lineTo(x + h, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // section boundaries
    ctx.fillStyle = alpha(token("text-dim") || "#888888", 0.18);
    ctx.fillRect(b.start * ppq, 0, 1, h);
  }
}

/** The automation lanes of an owner (a track, a bus or the master), with their headers. */
function Lanes({
  project,
  lanes,
  ppq,
  width,
  overridden,
}: {
  project: Project;
  lanes: AutomationLane[];
  ppq: number;
  width: number;
  overridden: Record<string, true>;
}) {
  const snap = useSettings((s) => s.timelineSnap);
  return (
    <>
      {lanes.map((lane) => {
        const knob = knobFor(project, lane.target);
        const def = knob?.def;
        const points: LanePoint[] = lane.points
          .map((p, i) => ({ p, i, q: toSong(project, p) }))
          .filter((x) => x.q !== null)
          .map((x) => ({ index: x.i, q: x.q!, value: x.p.value, flag: !!x.p.hold }));
        const items = (i: number): MenuItem[] => [
          {
            label: "Ramp to the next point",
            checked: !lane.points[i]?.hold,
            onSelect: () => setPointHold(lane.id, i, false),
          },
          {
            label: "Hold until the next point",
            checked: !!lane.points[i]?.hold,
            onSelect: () => setPointHold(lane.id, i, true),
          },
          { separator: true },
          { label: "Delete point", onSelect: () => deletePoints(lane.id, [i]) },
        ];
        return (
          <Row
            key={lane.id}
            height={LANE_H}
            header={
              <div className="flex h-full flex-col justify-center gap-0.5 pl-4 pr-1">
                <span className="truncate text-[10px] text-ink" title={knob?.label ?? lane.target}>
                  {knob?.label.split(" · ").slice(1).join(" · ") ?? "(gone)"}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    className="tool-btn !h-4 !min-w-0 !px-1 text-[9px]"
                    data-active={lane.on}
                    title={
                      lane.on
                        ? "Automation on (click: the knob's own value plays)"
                        : "Automation off"
                    }
                    data-hint="timeline.lane.on"
                    onClick={() => setLaneOn(lane.id, !lane.on)}
                  >
                    {lane.on ? "On" : "Off"}
                  </button>
                  {overridden[lane.target] && (
                    <span
                      className="text-[9px] text-lit"
                      title="Overridden: you turned the knob. Back to automation brings it back."
                    >
                      overridden
                    </span>
                  )}
                  <button
                    className="tool-btn !h-4 !min-w-0 !px-1 text-[9px]"
                    title="Lane menu"
                    data-hint="timeline.lane.menu"
                    onClick={(e) =>
                      contextMenu(e, [
                        { label: "Clear its points", onSelect: () => clearLane(lane.id) },
                        { label: "Delete the lane", onSelect: () => deleteLane(lane.id) },
                      ])
                    }
                  >
                    ⋯
                  </button>
                </span>
              </div>
            }
          >
            <CurveLane
              kind="automation"
              points={points}
              ppq={ppq}
              width={width}
              height={LANE_H}
              min={0}
              max={1}
              color={token("accent") || "#7dd3fc"}
              dimmed={!lane.on || !!overridden[lane.target]}
              format={(v) => (def ? def.format(v) : `${Math.round(v * 100)}%`)}
              snap={(q, free) => snapQ(project, q, free ? "off" : snap === "bar" ? "beat" : snap)}
              onAdd={(q, v) => addPoint(lane.id, q, v)}
              onMove={(i, q, v, key) => movePoint(lane.id, i, q, v, key)}
              onDelete={(ids) => deletePoints(lane.id, ids)}
              onMenu={(i, e) => contextMenu(e, items(i))}
              testId="automation-lane"
              hint="timeline.lane"
            />
          </Row>
        );
      })}
    </>
  );
}

/** One row: a sticky header and its content. */
export function Row({
  header,
  children,
  height,
  className = "",
}: {
  header: ReactNode;
  children: ReactNode;
  height: number;
  className?: string;
}) {
  return (
    <div className={`flex border-b border-line/60 ${className}`} style={{ height }}>
      <div
        className="sticky left-0 z-10 shrink-0 overflow-hidden border-r border-line bg-panel"
        style={{ width: HEADER }}
      >
        {header}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/** "+ automation" for one owner's knobs. */
export function automationPicker(
  project: Project,
  filter: (target: string) => boolean,
  at: number,
): MenuItem[] {
  const knobs = automatableKnobs(project).filter((k) => filter(k.target));
  const used = new Set((project.automation ?? []).map((l) => l.target));
  return knobs.map((k) => ({
    label: k.label,
    checked: used.has(k.target),
    onSelect: () => automate(k.target, at, knobValue(project, k.target)),
  }));
}

export function TrackRows({
  project,
  ppq,
  width,
  view,
  at,
  overridden,
}: {
  project: Project;
  ppq: number;
  width: number;
  view: View;
  /** Where new automation's first point goes (the start marker). */
  at: number;
  overridden: Record<string, true>;
}) {
  const show = useSettings((s) => s.timelineTracks);
  const snap = useSettings((s) => s.timelineSnap);
  const commit = useStore((s) => s.commit);
  const lanes = project.automation ?? [];
  const lanesOf = (pred: (t: string) => boolean) => lanes.filter((l) => pred(l.target));
  const regions = project.regions ?? [];
  const tracks = project.tracks.filter(
    (t) =>
      show === "all" ||
      (show === "used" &&
        (lanes.some((l) => targetOwner(l.target).id === t.id) ||
          regions.some((r) => r.trackId === t.id))),
  );
  const blocks = layout(project);
  const cellClick = (track: Track, e: React.MouseEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const q = x / ppq;
    const b = blocks.find((bl) => q >= bl.start && q < bl.start + bl.span);
    if (b) toggleMuteHere(b.section.id, track.id);
  };

  return (
    <>
      {tracks.map((t) => {
        const own = lanesOf(
          (target) => targetOwner(target).kind === "track" && targetOwner(target).id === t.id,
        );
        return (
          <Fragment key={t.id}>
            <Row
              height={TRACK_H}
              header={
                <div
                  className="flex h-full items-center gap-1 px-1.5"
                  data-track-row-timeline={t.name}
                >
                  <span className="h-2.5 w-1 shrink-0 rounded-sm" style={{ background: t.color }} />
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-ink">
                    {t.name}
                  </span>
                  <button
                    className="tool-btn !h-4 !min-w-[16px] !px-0.5 text-[9px]"
                    data-active={t.mute}
                    title="Mute (everywhere)"
                    data-hint="dm.track.mute"
                    onClick={() =>
                      commit((p) => void (p.tracks.find((x) => x.id === t.id)!.mute = !t.mute))
                    }
                  >
                    M
                  </button>
                  <button
                    className="tool-btn !h-4 !min-w-[16px] !px-0.5 text-[9px]"
                    data-active={t.solo}
                    title="Solo"
                    data-hint="dm.track.solo"
                    onClick={() =>
                      commit((p) => void (p.tracks.find((x) => x.id === t.id)!.solo = !t.solo))
                    }
                  >
                    S
                  </button>
                  <button
                    className="tool-btn !h-4 !min-w-[16px] !px-0.5"
                    title="Automate a knob of this track"
                    data-hint="timeline.track.automate"
                    data-testid="track-automate"
                    onClick={(e) =>
                      contextMenu(
                        e,
                        automationPicker(
                          project,
                          (target) => target.startsWith(`track:${t.id}:`),
                          at,
                        ),
                      )
                    }
                  >
                    <Plus size={10} />
                  </button>
                </div>
              }
            >
              <div
                className="relative cursor-pointer"
                style={{ width, height: TRACK_H }}
                title="Click a section to mute this track there only"
                data-hint="timeline.track.cell"
                data-testid="timeline-track"
                data-track={t.id}
                onClick={(e) => cellClick(t, e)}
                onDragOver={(e) => {
                  if (t.mode === "clip" && isSampleDrag(e.dataTransfer)) e.preventDefault();
                }}
                onDrop={async (e) => {
                  if (t.mode !== "clip") return;
                  e.preventDefault();
                  const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
                  const q = snapQ(project, x / ppq, e.shiftKey ? "off" : snap);
                  const { ids } = await droppedSamples(e.dataTransfer);
                  if (ids[0]) {
                    void loadSample(ids[0]);
                    addRegion(
                      t.id,
                      ids[0],
                      q,
                      sampleQuarters(ids[0], q, (t.params["sound.warp"] ?? 1) >= 0.5),
                    );
                  }
                }}
              >
                <ViewCanvas
                  view={view}
                  height={TRACK_H}
                  deps={[project.slots, project.patterns, t, ppq]}
                  draw={(ctx, from, w) => drawTrack(ctx, project, t, ppq, from, from + w)}
                />
                {t.mode === "clip" && <RegionBoxes project={project} track={t} ppq={ppq} />}
              </div>
            </Row>
            <Lanes project={project} lanes={own} ppq={ppq} width={width} overridden={overridden} />
          </Fragment>
        );
      })}
      {[
        ...project.buses.map((b) => ({ id: b.id, name: `Bus ${b.name}`, prefix: `bus:${b.id}` })),
        { id: "master", name: "Master", prefix: "master" },
      ].map((o) => {
        const own = lanesOf((target) => target === o.prefix || target.startsWith(`${o.prefix}:`));
        if (!own.length) return null;
        return (
          <Fragment key={o.id}>
            <Row
              height={TRACK_H}
              header={
                <div className="flex h-full items-center gap-1 px-1.5">
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-dim">
                    {o.name}
                  </span>
                  <button
                    className="tool-btn !h-4 !min-w-[16px] !px-0.5"
                    title={`Automate a knob of ${o.name}`}
                    onClick={(e) =>
                      contextMenu(
                        e,
                        automationPicker(
                          project,
                          (t) => t === o.prefix || t.startsWith(`${o.prefix}:`),
                          at,
                        ),
                      )
                    }
                  >
                    <Plus size={10} />
                  </button>
                </div>
              }
            >
              <div style={{ width, height: TRACK_H }} />
            </Row>
            <Lanes project={project} lanes={own} ppq={ppq} width={width} overridden={overridden} />
          </Fragment>
        );
      })}
    </>
  );
}
