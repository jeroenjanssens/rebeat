/**
 * The Inspector showing a lane's points, or the tempo changes, as a table (D199–D202): one row
 * per point in time order, On, Position, Value, Ease in and Ease out, drag, scroll or type
 * everywhere. It edits the same data as the lane on the timeline, and shares its selection.
 */
import { ArrowLeft, ChevronDown, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { contextMenu, dropdown } from "../../../components/Menu";
import { startPosition } from "../../../engine/transport";
import { barQuarters, songLength } from "../../../model/arrangement";
import { DEFAULT_STRENGTH, EASE_LABEL, type Ease, type EaseType } from "../../../model/ease";
import type { Project } from "../../../model/project";
import { useSettings } from "../../../state/settings";
import { useStore } from "../../../state/store";
import { setLaneOn } from "../../../state/timelineActions";
import { revealOnTimeline } from "../../timeline/reveal";
import { pickLaneKnob } from "../../timeline/TrackRows";
import { formatInSection, formatPosition, parsePosition } from "./parse";
import { ScrubField } from "./ScrubField";
import { laneSource, tempoSource, type PointSource, type Row } from "./sources";

const ROW_H = 52;

/** One step of the Snap grid, in quarter notes (Shift: a 16th). */
function gridStep(project: Project, fine: boolean) {
  if (fine) return 0.25;
  switch (useSettings.getState().timelineSnap) {
    case "bar":
      return barQuarters(project);
    case "beat":
      return 4 / project.timeSignature[1];
    case "16th":
      return 0.25;
    default:
      return 0.0625;
  }
}

function EaseCell({
  side,
  ease,
  types,
  disabled,
  onChange,
  testId,
}: {
  side: "in" | "out";
  ease?: Ease;
  types: EaseType[];
  disabled?: boolean;
  onChange: (e: Ease, key?: string) => void;
  testId: string;
}) {
  const type = ease?.type ?? "linear";
  const strength = ease?.strength ?? DEFAULT_STRENGTH;
  const fixed = type === "linear" || type === "none";
  const start = useRef<{ key: string; v: number } | null>(null);
  const set = (s: number, key?: string) =>
    onChange({ type, strength: Math.round(Math.max(0, Math.min(1, s)) * 100) / 100 }, key);
  return (
    <span
      className="flex min-w-0 flex-1 items-center gap-0.5"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <span className="label w-[22px] shrink-0 !text-[8.5px]">{side === "in" ? "In" : "Out"}</span>
      <button
        className="field !h-[22px] min-w-0 flex-1 !gap-0.5 !px-1 text-[10px]"
        disabled={disabled}
        title={
          side === "in"
            ? "Ease in: how the curve arrives here"
            : "Ease out: how the curve leaves here"
        }
        data-testid={`${testId}-type`}
        data-hint={`automation.ease-${side}`}
        onClick={(e) =>
          dropdown(
            e.currentTarget,
            types.map((t) => ({
              label: EASE_LABEL[t],
              checked: t === type,
              onSelect: () => onChange({ type: t, strength: ease?.strength }),
            })),
          )
        }
      >
        <span className="truncate text-ink">{EASE_LABEL[type].replace(" (jump)", "")}</span>
      </button>
      <ScrubField
        axis="y"
        className="w-[38px] shrink-0 justify-end"
        text={fixed ? "—" : `${Math.round(strength * 100)}%`}
        disabled={disabled || fixed}
        title="Strength: drag, scroll or type (double-click: 50%)"
        testId={`${testId}-strength`}
        hint="automation.strength"
        onDrag={(px, fine, key) => {
          if (start.current?.key !== key) start.current = { key, v: strength };
          set(start.current.v + px / (fine ? 600 : 150), key);
        }}
        onWheel={(dir, fine) => set(strength + dir * (fine ? 0.01 : 0.05))}
        onType={(t) => {
          const n = parseFloat(t);
          if (!Number.isFinite(n)) return false;
          set(n / 100);
          return true;
        }}
        onReset={() => set(DEFAULT_STRENGTH)}
      />
    </span>
  );
}

function PointRow({
  row,
  prev,
  source,
  project,
  selected,
  targets,
  select,
}: {
  row: Row;
  prev?: Row;
  source: PointSource;
  project: Project;
  selected: boolean;
  /** The rows an edit of this one acts on: the selection, if it's in it. */
  targets: number[];
  select: (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
}) {
  const start = useRef<{ key: string; v: number; dq: number } | null>(null);
  const tempo = !!source.setRamp;
  const range = source.max - source.min;
  const clampV = (v: number) => Math.max(source.min, Math.min(source.max, v));
  const roundV = (v: number) => (tempo ? Math.round(v * 10) / 10 : v);
  const insertBefore =
    prev && prev.q !== null && row.q !== null && row.q - prev.q > 1e-3
      ? () => {
          const index = source.insert((prev.q! + row.q!) / 2);
          if (index >= 0)
            useStore.getState().setUi({ pointSelection: { lane: source.key, indexes: [index] } });
        }
      : null;
  return (
    <div
      className={`group relative flex flex-col justify-center gap-0.5 border-b border-line/60 px-2 ${
        selected ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]" : ""
      }`}
      style={{ height: ROW_H, opacity: row.on ? 1 : 0.55 }}
      data-testid="point-row"
      data-index={row.index}
      data-selected={selected}
      onPointerDown={(e) => select(e)}
    >
      {insertBefore && (
        <button
          className="absolute -top-[9px] right-2 z-10 hidden h-[17px] items-center gap-0.5 rounded-full border border-line-strong bg-raised px-1.5 text-[9px] text-ink group-hover:flex"
          title="Insert a point halfway between these two, on the curve"
          data-testid="insert-between"
          data-hint="automation.insert"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={insertBefore}
        >
          <Plus size={9} /> insert
        </button>
      )}
      <div className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={row.on}
          className="shrink-0 accent-[var(--accent)]"
          title={row.on ? "On (click: off, the curve skips it)" : "Off: the curve skips it"}
          data-testid="point-on"
          data-hint="automation.on"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={() => source.setOn(targets, !row.on)}
        />
        <span className="flex min-w-0 flex-1 flex-col leading-none">
          <ScrubField
            axis="x"
            text={row.q === null ? "hidden" : formatPosition(project, row.q)}
            disabled={row.q === null}
            title="Position: drag sideways or scroll (Shift: a 16th), or type 17.3.2 or 6:3.2"
            testId="point-position"
            hint="automation.position"
            onDrag={(px, fine, key) => {
              if (start.current?.key !== key) start.current = { key, v: row.value, dq: 0 };
              const step = gridStep(project, fine);
              const dq = Math.round(px / 14) * step;
              if (dq !== start.current.dq) {
                source.moveBy(targets, dq - start.current.dq, key);
                start.current.dq = dq;
              }
            }}
            onWheel={(dir, fine) =>
              source.moveBy(targets, dir * gridStep(project, fine), `wheel-pos-${source.key}`)
            }
            onType={(t) => {
              const q = parsePosition(project, t);
              if (q === null || row.q === null) return false;
              source.moveBy([row.index], q - row.q, `type-pos-${row.index}`);
              return true;
            }}
          />
          <span className="truncate px-1 text-[9px] text-faint">
            {row.q === null ? "its section is shorter now" : formatInSection(project, row.q)}
          </span>
        </span>
        <ScrubField
          axis="y"
          className="w-[74px] shrink-0 justify-end"
          text={source.format(row.value)}
          title="Value: drag or scroll (Shift: finer), click to type, double-click to reset"
          testId="point-value"
          hint="automation.value"
          onDrag={(px, fine, key) => {
            if (start.current?.key !== key) start.current = { key, v: row.value, dq: 0 };
            const v = clampV(start.current.v + (px * range) / (fine ? 800 : 160));
            source.setValue(targets, roundV(v), key);
          }}
          onWheel={(dir, fine) =>
            source.setValue(
              targets,
              roundV(
                clampV(
                  row.value + (dir * range) / (tempo ? (fine ? 2800 : 280) : fine ? 1000 : 100),
                ),
              ),
              `wheel-value-${source.key}`,
            )
          }
          onType={(t) => {
            const v = source.parse(t);
            if (v === null) return false;
            source.setValue(targets, roundV(v), `type-value-${row.index}`);
            return true;
          }}
          onReset={() => source.setValue(targets, source.reset, `reset-${row.index}`)}
        />
        <button
          className="tool-btn !h-[20px] !min-w-[18px] !px-0.5 text-[10px]"
          title="More"
          data-testid="point-menu"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) =>
            contextMenu(e, [
              {
                label: "Duplicate (a beat later)",
                disabled: row.q === null,
                onSelect: () => source.add(row.q! + 4 / project.timeSignature[1], row.value),
              },
              {
                label: "Reset the value",
                onSelect: () => source.setValue(targets, source.reset, `reset-${row.index}`),
              },
              { label: "Delete", onSelect: () => source.remove(targets) },
            ])
          }
        >
          ⋯
        </button>
        <button
          className="tool-btn !h-[20px] !min-w-[18px] !px-0.5"
          title="Delete"
          data-testid="point-delete"
          data-hint="automation.delete"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => source.remove([row.index])}
        >
          <X size={10} />
        </button>
      </div>
      <div className="flex items-center gap-1.5 pl-[18px]">
        {tempo && (
          <button
            className="field !h-[22px] !px-1 text-[10px]"
            title="Jump to this tempo, or ramp to it from the change before"
            data-testid="point-ramp"
            data-hint="automation.ramp"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => source.setRamp!(targets, !row.ramp)}
          >
            <span className="text-ink">{row.ramp ? "Ramp" : "Jump"}</span>
          </button>
        )}
        <EaseCell
          side="in"
          ease={row.in}
          types={source.inTypes}
          // a tempo change that jumps has no ramp to arrive by
          disabled={tempo && !row.ramp}
          onChange={(e) => source.setEase(targets, "in", e)}
          testId="ease-in"
        />
        <EaseCell
          side="out"
          ease={row.out}
          types={source.outTypes}
          onChange={(e) => source.setEase(targets, "out", e)}
          testId="ease-out"
        />
      </div>
    </div>
  );
}

function PointTable({ source, project }: { source: PointSource; project: Project }) {
  const list = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 400 });
  const selection = useStore((s) => s.pointSelection);
  const selected = selection.lane === source.key ? selection.indexes : [];
  const anchor = useRef<number | null>(null);
  const rows = source.rows;
  const setSelected = (indexes: number[]) =>
    useStore.getState().setUi({ pointSelection: { lane: source.key, indexes } });

  useEffect(() => {
    const el = list.current!;
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // a point selected on the lane: its row comes into view
  const first = selected[0];
  useEffect(() => {
    const el = list.current;
    const pos = rows.findIndex((r) => r.index === first);
    if (!el || pos < 0) return;
    const top = pos * ROW_H;
    if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight)
      el.scrollTo({ top: Math.max(0, top - ROW_H) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first]);

  const select = (row: Row, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (e.shiftKey && anchor.current !== null) {
      const a = rows.findIndex((r) => r.index === anchor.current);
      const b = rows.findIndex((r) => r.index === row.index);
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      setSelected(rows.slice(lo, hi + 1).map((r) => r.index));
    } else if (e.metaKey || e.ctrlKey) {
      anchor.current = row.index;
      setSelected(
        selected.includes(row.index)
          ? selected.filter((i) => i !== row.index)
          : [...selected, row.index],
      );
    } else {
      anchor.current = row.index;
      if (!selected.includes(row.index)) setSelected([row.index]);
    }
    if (row.q !== null) revealOnTimeline(row.q);
  };

  const from = Math.max(0, Math.floor(view.top / ROW_H) - 4);
  const to = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_H) + 4);

  return (
    <div
      ref={list}
      className="scroll-thin relative min-h-0 flex-1 overflow-y-auto outline-none"
      tabIndex={0}
      data-testid="point-table"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input")) return;
        const pos = rows.findIndex((r) => r.index === selected[selected.length - 1]);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          const next =
            rows[Math.max(0, Math.min(rows.length - 1, pos + (e.key === "ArrowDown" ? 1 : -1)))];
          if (next) select(next, { shiftKey: e.shiftKey, metaKey: false, ctrlKey: false });
        } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
          e.preventDefault();
          e.stopPropagation();
          source.remove(selected);
          setSelected([]);
        } else if (e.key === "Escape" && selected.length) {
          e.stopPropagation();
          setSelected([]);
        }
      }}
    >
      {rows.length === 0 && (
        <div className="p-4 text-[11px] text-faint">
          No points yet. Add one with the buttons above, or click the lane on the timeline.
        </div>
      )}
      <div style={{ height: rows.length * ROW_H, position: "relative" }}>
        {rows.slice(from, to).map((row, k) => {
          const i = from + k;
          const isSel = selected.includes(row.index);
          return (
            <div key={row.index} className="absolute inset-x-0" style={{ top: i * ROW_H }}>
              <PointRow
                row={row}
                prev={rows[i - 1]}
                source={source}
                project={project}
                selected={isSel}
                targets={isSel ? selected : [row.index]}
                select={(e) => select(row, e)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The Inspector's view of a lane or the tempo changes. */
export function AutomationInspector() {
  const project = useStore((s) => s.project);
  const inspect = useStore((s) => s.inspect)!;
  const setUi = useStore((s) => s.setUi);
  const source = inspect.kind === "tempo" ? tempoSource(project) : laneSource(project, inspect.id);
  const lane =
    inspect.kind === "lane" ? project.automation?.find((l) => l.id === inspect.id) : undefined;
  const back = () => setUi({ inspect: null });
  if (!source)
    return (
      <div className="p-4 text-[12px] text-faint">
        This lane is gone.{" "}
        <button className="underline" onClick={back}>
          Back to the track
        </button>
      </div>
    );
  const last = [...source.rows].reverse().find((r) => r.q !== null);
  const addAt = (q: number) => {
    const index = source.insert(Math.min(q, Math.max(0, songLength(project) - 1e-3)));
    if (index >= 0) setUi({ pointSelection: { lane: source.key, indexes: [index] } });
  };
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel" data-testid="automation-inspector">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-line px-3 py-2">
        <button
          className="flex items-center gap-1 self-start text-[10px] text-dim hover:text-ink"
          data-testid="inspector-back"
          data-hint="automation.back"
          onClick={back}
        >
          <ArrowLeft size={11} /> Back to the track
        </button>
        <div className="flex items-center gap-2">
          {lane ? (
            // the lane's knob: pick another one here (D208)
            <button
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[12px] font-semibold text-ink hover:bg-surface"
              title="Pick another knob for this lane"
              data-testid="inspector-knob"
              data-hint="automation.knob"
              onClick={(e) => pickLaneKnob(e.currentTarget, project, lane.id)}
            >
              <span className="truncate">{source.title}</span>
              <ChevronDown size={12} className="shrink-0 text-dim" />
            </button>
          ) : (
            <span
              className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink"
              title={source.title}
            >
              {source.title}
            </span>
          )}
          {lane && (
            <button
              className="tool-btn !h-5 !px-1.5 text-[10px]"
              data-active={lane.on}
              title={
                lane.on ? "Automation on (click: the knob's own value plays)" : "Automation off"
              }
              data-hint="timeline.lane.on"
              onClick={() => setLaneOn(lane.id, !lane.on)}
            >
              {lane.on ? "On" : "Off"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="label flex-1">
            {source.rows.length} point{source.rows.length === 1 ? "" : "s"}
          </span>
          <button
            className="tool-btn !h-6 border border-line text-[10px]"
            title="A point at the start marker, on the curve"
            data-testid="add-at-marker"
            data-hint="automation.add-marker"
            onClick={() => addAt(startPosition())}
          >
            <Plus size={10} /> at ▼
          </button>
          <button
            className="tool-btn !h-6 border border-line text-[10px]"
            title="A point a bar after the last one"
            data-testid="add-after-last"
            data-hint="automation.add-last"
            onClick={() =>
              last ? source.add(last.q! + barQuarters(project), last.value) : addAt(startPosition())
            }
          >
            <Plus size={10} /> after the last
          </button>
        </div>
      </div>
      <PointTable source={source} project={project} />
    </div>
  );
}
