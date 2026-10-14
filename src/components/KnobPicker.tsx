/**
 * The knob picker (D208): every knob that can be automated, as a tree with a search box. Owner
 * (a track, a bus, the master) → its Sound, Synth, Mix and Effects → one item per effect or part
 * of the synth (D226) → its knobs.
 * Typing shows the matching knobs as one list. Used to add a lane (the Timeline, a track's +),
 * to move a lane to another knob, and in the Inspector's table.
 */
import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Search } from "lucide-react";
import { pickerKnobs, type AutomatableKnob } from "../model/automation";
import { useStore } from "../state/store";
import { useMenu } from "./Menu";

export interface KnobPickerOptions {
  /** Only these owners' knobs (a track's "+ automation"). */
  only?: (target: string) => boolean;
  /** The group to open first (the lane's own track). */
  open?: string;
  /** The knob it picks now (checked). */
  current?: string;
  /** Knobs that already have a lane: checked, or disabled when moving a lane. */
  used?: Set<string>;
  disableUsed?: boolean;
  onPick: (target: string) => void;
}

/** Open the picker under an element, or at the pointer. */
export function openKnobPicker(
  at: HTMLElement | { clientX: number; clientY: number },
  options: KnobPickerOptions,
) {
  let x: number;
  let y: number;
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect();
    x = r.left;
    y = r.bottom + 4;
  } else {
    x = at.clientX;
    y = at.clientY;
  }
  useMenu
    .getState()
    .show(x, y, [{ render: (close) => <KnobPicker {...options} close={close} /> }], 280);
}

const SECTIONS = ["Sound", "Synth", "Mix", "Effects"] as const;

/** Where a knob folds within its section: its effect, or its part of the synth. */
const subOf = (k: AutomatableKnob) => k.effect ?? k.part;

function KnobPicker({
  only,
  open,
  current,
  used,
  disableUsed,
  onPick,
  close,
}: KnobPickerOptions & { close: () => void }) {
  const project = useStore((s) => s.project);
  const knobs = useMemo(
    () => pickerKnobs(project).filter((k) => !only || only(k.target)),
    [project, only],
  );
  const groups = useMemo(() => [...new Set(knobs.map((k) => k.group))], [knobs]);
  const currentKnob = knobs.find((k) => k.target === current);
  const [query, setQuery] = useState("");
  // what's open: groups by name, effects by id; the current knob's group and effect, else the
  // one group there is, or the one asked for
  const [opened, setOpened] = useState<Set<string>>(
    () =>
      new Set(
        [
          open,
          currentKnob?.group,
          currentKnob && subOf(currentKnob) && `fx:${subOf(currentKnob)!.id}`,
          groups.length === 1 ? groups[0] : undefined,
        ].filter((x): x is string => !!x),
      ),
  );
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const toggle = (key: string) =>
    setOpened((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length
    ? knobs.filter((k) => words.every((w) => k.label.toLowerCase().includes(w)))
    : null;

  // the rows shown, in order: what arrows and Enter walk through
  type Row =
    | { kind: "group"; group: string }
    | { kind: "section"; section: string; group: string }
    | { kind: "effect"; id: string; name: string }
    | { kind: "knob"; knob: AutomatableKnob; depth: number; full?: boolean };
  const rows: Row[] = [];
  if (found) for (const knob of found) rows.push({ kind: "knob", knob, depth: 0, full: true });
  else
    for (const group of groups) {
      const own = knobs.filter((k) => k.group === group);
      if (groups.length > 1) rows.push({ kind: "group", group });
      if (groups.length > 1 && !opened.has(group)) continue;
      for (const section of SECTIONS) {
        const inSection = own.filter((k) => k.section === section);
        if (!inSection.length) continue;
        rows.push({ kind: "section", section, group });
        if (section !== "Effects" && section !== "Synth") {
          for (const knob of inSection) rows.push({ kind: "knob", knob, depth: 1 });
          continue;
        }
        const subs = [...new Map(inSection.map((k) => [subOf(k)!.id, subOf(k)!])).values()];
        for (const sub of subs) {
          rows.push({ kind: "effect", id: sub.id, name: sub.name });
          if (!opened.has(`fx:${sub.id}`)) continue;
          for (const knob of inSection.filter((k) => subOf(k)!.id === sub.id))
            rows.push({ kind: "knob", knob, depth: 2 });
        }
      }
    }
  const pickable = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.kind !== "section" && !(r.kind === "knob" && blocked(r.knob)));
  function blocked(k: AutomatableKnob) {
    return !!k.why || (!!disableUsed && !!used?.has(k.target) && k.target !== current);
  }
  const activeRow = pickable[Math.min(active, pickable.length - 1)]?.i ?? -1;

  const choose = (r: Row | undefined) => {
    if (!r) return;
    if (r.kind === "group") toggle(r.group);
    else if (r.kind === "effect") toggle(`fx:${r.id}`);
    else if (r.kind === "knob" && !blocked(r.knob)) {
      close();
      onPick(r.knob.target);
    }
  };
  const move = (d: number) => {
    const n = pickable.length;
    if (!n) return;
    const next = (Math.min(active, n - 1) + d + n) % n;
    setActive(next);
    list.current
      ?.querySelector(`[data-row="${pickable[next].i}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div
      className="flex w-[280px] flex-col"
      data-testid="knob-picker"
      data-hint="automation.picker"
    >
      <label className="mb-1 flex items-center gap-1.5 rounded border border-line bg-surface px-2">
        <Search size={12} className="shrink-0 text-faint" />
        <input
          autoFocus
          className="h-7 min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none"
          placeholder="Search knobs"
          value={query}
          data-testid="knob-picker-search"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") move(1);
            else if (e.key === "ArrowUp") move(-1);
            else if (e.key === "Enter") choose(pickable[Math.min(active, pickable.length - 1)]?.r);
            else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              const r = rows[activeRow];
              const key = r?.kind === "group" ? r.group : r?.kind === "effect" ? `fx:${r.id}` : "";
              if (key && opened.has(key) !== (e.key === "ArrowRight")) toggle(key);
              else return;
            } else return;
            e.preventDefault();
          }}
        />
      </label>
      <div ref={list} className="scroll-thin max-h-[60vh] overflow-y-auto">
        {rows.length === 0 && (
          <div className="px-2 py-1.5 text-[11.5px] text-faint">No knob matches.</div>
        )}
        {rows.map((r, i) => {
          const lit = i === activeRow ? " bg-accent/15" : "";
          if (r.kind === "section")
            return (
              <div
                key={`s-${r.group}-${r.section}`}
                className="label px-2 pb-0.5 pt-1.5 !text-[9px]"
                style={{ paddingLeft: groups.length > 1 ? 22 : 8 }}
              >
                {r.section}
              </div>
            );
          if (r.kind === "group" || r.kind === "effect") {
            const key = r.kind === "group" ? r.group : `fx:${r.id}`;
            const Chevron = opened.has(key) ? ChevronDown : ChevronRight;
            return (
              <button
                key={key}
                data-row={i}
                className={`menu-item${lit}`}
                style={r.kind === "effect" ? { paddingLeft: groups.length > 1 ? 22 : 8 } : {}}
                data-testid={r.kind === "group" ? "knob-picker-group" : "knob-picker-effect"}
                onClick={() => choose(r)}
              >
                <Chevron size={12} className="shrink-0 text-dim" />
                <span className={`flex-1 truncate ${r.kind === "group" ? "font-semibold" : ""}`}>
                  {r.kind === "group" ? r.group : r.name}
                </span>
              </button>
            );
          }
          const k = r.knob;
          const indent = r.full ? 8 : 8 + (groups.length > 1 ? 14 : 0) + (r.depth - 1) * 14;
          return (
            <button
              key={k.target}
              data-row={i}
              data-knob={k.target}
              className={`menu-item${lit}`}
              style={{ paddingLeft: indent }}
              disabled={blocked(k)}
              title={
                k.why ??
                (blocked(k)
                  ? "This knob has a lane already"
                  : k.note
                    ? `${k.label}: ${k.note}`
                    : k.label)
              }
              onClick={() => choose(r)}
            >
              <span className="w-3.5 shrink-0">
                {(k.target === current || (!disableUsed && used?.has(k.target))) && (
                  <Check size={13} />
                )}
              </span>
              <span className="flex-1 truncate">
                {r.full ? k.label : k.name}
                {k.why && <span className="ml-1.5 text-[10px] text-faint">can't be automated</span>}
                {!k.why && k.note && (
                  <span className="ml-1.5 text-[10px] text-faint" data-testid="knob-note">
                    {k.note.split(". ")[0]}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
