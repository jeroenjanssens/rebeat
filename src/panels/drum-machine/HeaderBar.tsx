import { useMemo, useRef, type ReactNode } from "react";
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
import { DragValue } from "../../components/DragValue";
import { InlineEdit } from "../../components/InlineEdit";
import { dropdown, type MenuItem } from "../../components/Menu";
import { STEP_COUNT_PRESETS, STEP_SIZES, type StepSize } from "../../model/types";
import { useEditPattern, useStore, type Tool } from "../../state/store";
import { useSettings } from "../../state/settings";
import { KeyMenu } from "./KeyMenu";
import type { SizeClass } from "./layout";
import { ZOOM_LEVELS, formatZoom, nextZoomLevel, percentToZoom } from "./zoom";

function Dropdown({
  label,
  value,
  items,
  title,
  hint,
}: {
  label: string;
  value: string;
  items: () => MenuItem[];
  title?: string;
  hint?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      className="field"
      title={title}
      data-hint={hint}
      onClick={() => dropdown(ref.current!, items())}
    >
      <span className="label">{label}</span>
      <span className="num text-ink">{value}</span>
      <ChevronDown size={12} className="text-dim" />
    </button>
  );
}

/**
 * Sizes itself to the widest of `texts` (rendered invisibly in the same grid cell, so it uses
 * the real font), and shows `children` on top.
 */
function WidestOf({
  texts,
  className,
  children,
}: {
  texts: string[];
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid min-w-0 ${className}`}>
      {texts.map((t) => (
        <span
          key={t}
          aria-hidden
          className="invisible col-start-1 row-start-1 truncate whitespace-nowrap"
        >
          {t}
        </span>
      ))}
      <div className="col-start-1 row-start-1 min-w-0">{children}</div>
    </div>
  );
}

const TOOLS: { id: Tool; icon: typeof Pencil; title: string }[] = [
  { id: "draw", icon: Pencil, title: "Draw (D) · Shift-drag = velocity" },
  { id: "erase", icon: Eraser, title: "Erase (E)" },
  { id: "select", icon: SquareDashedMousePointer, title: "Select (S) · drag a marquee" },
];

export function HeaderBar({
  sizeClass,
  effectiveZoom,
}: {
  sizeClass: SizeClass;
  effectiveZoom: number;
}) {
  const pattern = useEditPattern();
  const slots = useStore((s) => s.project.slots);
  const editSlotId = useStore((s) => s.editSlotId);
  const { view, tool, quantize, follow, lanes, setUi, commit } = useStore();
  const zoom = useSettings((s) => s.zoom);
  const setZoom = (z: number | "fit") => useSettings.getState().set({ zoom: z });
  const pageNumber = slots.findIndex((s) => s.id === editSlotId) + 1;
  const patterns = useStore((s) => s.project.patterns);
  const pageNames = useMemo(
    () => [...new Set(slots.map((s) => patterns[s.patternId]?.name ?? ""))],
    [slots, patterns],
  );
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

  const zoomLevelRef = useRef<HTMLButtonElement>(null);

  /** Items for the zoom combobox dropdown. */
  const zoomItems = (): MenuItem[] => [
    {
      label: "Fit",
      checked: zoom === "fit",
      onSelect: () => setZoom("fit"),
    },
    { separator: true },
    ...ZOOM_LEVELS.map((l) => ({
      label: `${Math.round(l * 100)}%`,
      checked: typeof zoom === "number" && Math.abs(zoom - l) < 0.005,
      onSelect: () => setZoom(l),
    })),
    { separator: true },
    {
      render: (close: () => void) => (
        <label className="flex items-center gap-2 px-2 py-1">
          <span className="label">Custom</span>
          <input
            type="number"
            min={25}
            max={400}
            defaultValue={
              zoom === "fit" ? Math.round(effectiveZoom * 100) : Math.round((zoom as number) * 100)
            }
            className="num w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] outline-none focus:border-accent"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                setZoom(percentToZoom(Number(e.currentTarget.value) || 100));
                close();
              }
              if (e.key === "Escape") close();
            }}
          />
        </label>
      ),
    },
  ];

  const globalSwing = useStore((s) => s.project.swing);
  const swing = (
    <DragValue
      label={pattern.swing === undefined ? "Swing" : "Swing·P"}
      value={Math.round((pattern.swing ?? globalSwing) * 100)}
      min={50}
      max={75}
      defaultValue={Math.round(globalSwing * 100)}
      format={(v) => `${v}%`}
      onChange={(v) => setPattern((p) => (p.swing = v / 100), "swing")}
      onReset={() => setPattern((p) => (p.swing = undefined))}
      title="Pattern swing · double-click = follow the global swing"
    />
  );

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
      <div className="segmented" title="Grid / Pads view (V)" data-hint="dm.header.view">
        <button data-active={view === "grid"} onClick={() => setUi({ view: "grid" })}>
          Grid
        </button>
        <button data-active={view === "pads"} onClick={() => setUi({ view: "pads" })}>
          Pads
        </button>
      </div>

      {/* fixed widths (the longest pattern name and section number), so the controls after them don't move */}
      <div className="flex min-w-0 items-center gap-1.5 px-1" data-hint="dm.header.pattern-name">
        <WidestOf texts={[String(slots.length)]} className="num text-[13px] font-semibold">
          <span style={{ color: pattern.linkColor }}>{pageNumber}</span>
        </WidestOf>
        <WidestOf
          texts={pageNames}
          className="max-w-[180px] text-[13px] font-semibold uppercase tracking-wider"
        >
          <InlineEdit
            value={pattern.name}
            trigger="click"
            onCommit={(v) => setPattern((p) => (p.name = v))}
            className="block w-full text-[13px] font-semibold uppercase tracking-wider"
          />
        </WidestOf>
      </div>

      <Dropdown
        label="Steps"
        value={String(pattern.stepCount)}
        items={stepItems}
        title="Steps in this pattern"
        hint="dm.header.steps"
      />
      {!compact && (
        <Dropdown
          label="Size"
          value={pattern.stepSize}
          items={sizeItems}
          title="Step size"
          hint="dm.header.size"
        />
      )}
      {/* as wide with "Swing·P" as with "Swing", so the controls after it don't move */}
      {!compact && (
        <span data-hint="dm.header.swing" className="inline-flex min-w-[92px]">
          {swing}
        </span>
      )}
      {!compact && <KeyMenu compact={sizeClass !== "large"} />}

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        {TOOLS.map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            className="tool-btn"
            data-active={tool === id}
            title={title}
            data-hint={`dm.header.tool.${id}`}
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
            hint="dm.header.quantize"
          />
          <div className="flex items-center">
            <button
              className="tool-btn"
              title="Zoom out (Alt+−, Ctrl/Cmd+scroll)"
              data-hint="dm.header.zoom-out"
              onClick={() => setZoom(nextZoomLevel(zoom, -1, effectiveZoom))}
            >
              <ZoomOut size={14} />
            </button>
            <button
              ref={zoomLevelRef}
              className="field px-1"
              title="Zoom level — click to change"
              data-hint="dm.header.zoom-level"
              data-testid="dm-zoom-level"
              onClick={() => dropdown(zoomLevelRef.current!, zoomItems())}
            >
              <span className="num text-[10px]">{formatZoom(zoom)}</span>
            </button>
            <button
              className="tool-btn"
              title="Zoom in (Alt+=, Ctrl/Cmd+scroll)"
              data-hint="dm.header.zoom-in"
              onClick={() => setZoom(nextZoomLevel(zoom, 1, effectiveZoom))}
            >
              <ZoomIn size={14} />
            </button>
          </div>
          <button
            className="tool-btn"
            data-active={follow}
            title="Follow the playing section"
            data-hint="dm.header.follow"
            onClick={() => setUi({ follow: !follow })}
          >
            <Crosshair size={14} />
            <span className="label !text-inherit">Follow</span>
          </button>
          <button
            ref={moreRef}
            className="tool-btn"
            title="Lanes"
            data-hint="dm.header.lanes"
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
          data-hint="dm.header.more"
          onClick={() =>
            dropdown(moreRef.current!, [
              { render: () => <div className="flex flex-col gap-1.5 p-2">{swing}</div> },
              { separator: true },
              ...sizeItems().map((i) => ({ ...i, label: `Size ${i.label}` })),
              { separator: true },
              ...quantizeItems().map((i) => ({ ...i, label: `Quantize ${i.label}` })),
              { separator: true },
              {
                label: "Follow the playing section",
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
