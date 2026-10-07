import { useRef } from "react";
import {
  ChevronDown,
  Crosshair,
  Eraser,
  MoreHorizontal,
  Pencil,
  Rows3,
  SquareDashedMousePointer,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { DragValue } from "../components/DragValue";
import { InlineEdit } from "../components/InlineEdit";
import { dropdown, type MenuItem } from "../components/Menu";
import { STEP_COUNT_PRESETS, STEP_SIZES, type StepSize } from "../model/types";
import { useEditPattern, useStore, type Tool } from "../state/store";
import type { SizeClass } from "./layout";

function Dropdown({
  label,
  value,
  items,
  title,
}: {
  label: string;
  value: string;
  items: () => MenuItem[];
  title?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      className="field"
      title={title}
      onClick={() => dropdown(ref.current!, items())}
    >
      <span className="label">{label}</span>
      <span className="num text-ink">{value}</span>
      <ChevronDown size={12} className="text-dim" />
    </button>
  );
}

const TOOLS: { id: Tool; icon: typeof Pencil; title: string }[] = [
  { id: "draw", icon: Pencil, title: "Draw (D) · Shift-drag = velocity" },
  { id: "erase", icon: Eraser, title: "Erase (E)" },
  { id: "select", icon: SquareDashedMousePointer, title: "Select (S) · drag a marquee" },
];

export function HeaderBar({ sizeClass }: { sizeClass: SizeClass }) {
  const pattern = useEditPattern();
  const slots = useStore((s) => s.project.slots);
  const editSlotId = useStore((s) => s.editSlotId);
  const { view, tool, quantize, zoom, follow, lanes, setUi, commit } = useStore();
  const pageNumber = slots.findIndex((s) => s.id === editSlotId) + 1;
  const compact = sizeClass === "compact";
  const moreRef = useRef<HTMLButtonElement>(null);

  const setPattern = (fn: (p: typeof pattern) => void, key?: string) =>
    commit((p) => fn(p.patterns[pattern.id]), key);

  const stepItems = (): MenuItem[] => [
    ...STEP_COUNT_PRESETS.map((n) => ({
      label: `${n} steps`,
      checked: pattern.stepCount === n,
      onSelect: () => setPattern((p) => (p.stepCount = n)),
    })),
    { separator: true },
    {
      render: (close) => (
        <label className="flex items-center gap-2 px-2 py-1">
          <span className="label">Custom</span>
          <input
            type="number"
            min={1}
            max={128}
            defaultValue={pattern.stepCount}
            className="num w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] outline-none focus:border-accent"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                const n = Math.min(128, Math.max(1, Number(e.currentTarget.value) || 16));
                setPattern((p) => (p.stepCount = n));
                close();
              }
            }}
          />
        </label>
      ),
    },
  ];

  const sizeItems = (): MenuItem[] =>
    STEP_SIZES.map((sz: StepSize) => ({
      label: sz,
      checked: pattern.stepSize === sz,
      onSelect: () => setPattern((p) => (p.stepSize = sz)),
    }));

  const quantizeItems = (): MenuItem[] =>
    ["Off", "1/4", "1/8", "1/16", "1/32"].map((q) => ({
      label: q,
      checked: quantize === q,
      onSelect: () => setUi({ quantize: q }),
    }));

  const laneItems = (): MenuItem[] =>
    (["velocity", "probability", "nudge"] as const).map((f) => ({
      label: `${f[0].toUpperCase()}${f.slice(1)} lane`,
      checked: lanes[f],
      onSelect: () => setUi({ lanes: { ...lanes, [f]: !lanes[f] } }),
    }));

  const swing = (
    <DragValue
      label="Swing"
      value={Math.round(pattern.swing * 100)}
      min={50}
      max={75}
      defaultValue={50}
      format={(v) => `${v}%`}
      onChange={(v) => setPattern((p) => (p.swing = v / 100), "swing")}
    />
  );

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
      <div className="segmented" title="Grid / Pads view (V)">
        <button data-active={view === "grid"} onClick={() => setUi({ view: "grid" })}>
          Grid
        </button>
        <button data-active={view === "pads"} onClick={() => setUi({ view: "pads" })}>
          Pads
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 px-1">
        <span className="num text-[13px] font-semibold" style={{ color: pattern.linkColor }}>
          {pageNumber}
        </span>
        <InlineEdit
          value={pattern.name}
          trigger="click"
          onCommit={(v) => setPattern((p) => (p.name = v))}
          className="max-w-[140px] text-[13px] font-semibold uppercase tracking-wider"
        />
      </div>

      <Dropdown
        label="Steps"
        value={String(pattern.stepCount)}
        items={stepItems}
        title="Steps on this page"
      />
      {!compact && (
        <Dropdown label="Size" value={pattern.stepSize} items={sizeItems} title="Step size" />
      )}
      {!compact && swing}

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        {TOOLS.map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            className="tool-btn"
            data-active={tool === id}
            title={title}
            onClick={() => setUi({ tool: id })}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      {!compact && (
        <>
          <div className="mx-1 h-5 w-px bg-line" />
          <Dropdown
            label="Q"
            value={quantize}
            items={quantizeItems}
            title="Quantize for live recording"
          />
          <div className="flex items-center">
            <button
              className="tool-btn"
              title="Zoom out (Ctrl/Cmd+scroll)"
              onClick={() => setUi({ zoom: Math.max(0.6, zoom / 1.15) })}
            >
              <ZoomOut size={14} />
            </button>
            <span className="num w-9 text-center text-[10px] text-dim">
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="tool-btn"
              title="Zoom in (Ctrl/Cmd+scroll)"
              onClick={() => setUi({ zoom: Math.min(2.5, zoom * 1.15) })}
            >
              <ZoomIn size={14} />
            </button>
          </div>
          <button
            className="tool-btn"
            data-active={follow}
            title="Follow the playing page"
            onClick={() => setUi({ follow: !follow })}
          >
            <Crosshair size={14} />
            <span className="label !text-inherit">Follow</span>
          </button>
          <button
            ref={moreRef}
            className="tool-btn"
            title="Lanes"
            onClick={() => dropdown(moreRef.current!, laneItems())}
          >
            <Rows3 size={14} />
          </button>
        </>
      )}

      {compact && (
        <button
          ref={moreRef}
          className="tool-btn"
          title="More"
          onClick={() =>
            dropdown(moreRef.current!, [
              { render: () => <div className="flex flex-col gap-1.5 p-2">{swing}</div> },
              { separator: true },
              ...sizeItems().map((i) => ({ ...i, label: `Size ${i.label}` })),
              { separator: true },
              ...quantizeItems().map((i) => ({ ...i, label: `Quantize ${i.label}` })),
              { separator: true },
              {
                label: "Follow playing page",
                checked: follow,
                onSelect: () => setUi({ follow: !follow }),
              },
              ...laneItems(),
            ])
          }
        >
          <MoreHorizontal size={15} />
        </button>
      )}
    </div>
  );
}
