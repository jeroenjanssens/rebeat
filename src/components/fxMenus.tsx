/**
 * Menus for effect chains (D210, D211, D217): adding an effect by group, copying and pasting
 * effects, copying them to other tracks.
 */
import { useState } from "react";
import { EFFECT_GROUPS } from "../model/params";
import type { Effect } from "../model/types";
import {
  accepts,
  addEffect,
  copyEffects,
  copyEffectsTo,
  duplicateEffect,
  pasteEffects,
  pasteSettings,
  removeAllEffects,
  removeEffect,
  settingsFor,
  useFxClipboard,
  type FxTarget,
} from "../state/effectActions";
import { useStore } from "../state/store";
import { useMenu, type MenuItem } from "./Menu";

/** Add an effect: the effects in their groups. */
export function addEffectItems(target: FxTarget): MenuItem[] {
  return EFFECT_GROUPS.flatMap((g) => {
    const names = g.effects.filter((n) => accepts(target, n));
    if (!names.length) return [];
    return [
      { heading: g.name },
      ...names.map((name) => ({ label: name, onSelect: () => addEffect(target, name) })),
    ];
  });
}

const clipLabel = () => {
  const clip = useFxClipboard.getState().effects;
  if (!clip?.length) return "";
  return clip.length === 1 ? ` (${clip[0].name})` : ` (${clip.length} effects)`;
};

/** A chain's menu (right-click an FX button). */
export function chainMenu(
  target: FxTarget,
  effects: Effect[],
  at: { clientX: number; clientY: number },
): MenuItem[] {
  const clip = useFxClipboard.getState().effects;
  return [
    {
      label: effects.length ? `Copy effects (${effects.length})` : "Copy effects",
      disabled: !effects.length,
      onSelect: () => copyEffects(effects),
    },
    {
      label: `Paste: replace the chain${clipLabel()}`,
      disabled: !clip?.length,
      onSelect: () => pasteEffects(target, "replace"),
    },
    {
      label: `Paste after the chain${clipLabel()}`,
      disabled: !clip?.length,
      onSelect: () => pasteEffects(target, {}),
    },
    {
      label: "Copy the chain to…",
      disabled: !effects.length,
      onSelect: () => setTimeout(() => openCopyTo(at, effects, target)),
    },
    { separator: true },
    {
      label: "Remove all effects",
      disabled: !effects.length,
      onSelect: () => removeAllEffects(target),
    },
  ];
}

/** One effect's menu (its header's ⋯, or right-click it). */
export function effectMenu(
  target: FxTarget,
  index: number,
  effect: Effect,
  at: { clientX: number; clientY: number },
  removable = true,
): MenuItem[] {
  const clip = useFxClipboard.getState().effects;
  const same = settingsFor(effect.name);
  return [
    { label: `Copy ${effect.name}`, onSelect: () => copyEffects([effect]) },
    { label: "Duplicate", onSelect: () => duplicateEffect(target, index) },
    {
      label: `Paste after it${clipLabel()}`,
      disabled: !clip?.length,
      onSelect: () => pasteEffects(target, { after: index }),
    },
    {
      label: `Paste settings${same ? "" : ` (copy a ${effect.name} first)`}`,
      disabled: !same,
      onSelect: () => pasteSettings(target, index),
    },
    {
      label: "Copy to…",
      onSelect: () => setTimeout(() => openCopyTo(at, [effect], target)),
    },
    ...(removable
      ? [{ separator: true }, { label: "Remove", onSelect: () => removeEffect(target, index) }]
      : []),
  ];
}

const key = (t: FxTarget) => JSON.stringify(t);

/** Where effects can go: every track, the buses, the master. */
function destinations(): { target: FxTarget; name: string; color?: string }[] {
  const { project } = useStore.getState();
  return [
    ...project.tracks.map((t) => ({ target: { track: t.id }, name: t.name, color: t.color })),
    ...project.buses.map((b) => ({ target: { bus: b.id }, name: `${b.name} bus` })),
    { target: "master" as const, name: "Master" },
  ];
}

/** Copy effects to other chains: tick where they go. */
export function openCopyTo(
  at: { clientX: number; clientY: number },
  effects: Effect[],
  from: FxTarget,
) {
  useMenu
    .getState()
    .show(at.clientX, at.clientY, [
      { render: (close) => <CopyTo effects={effects} from={from} close={close} /> },
    ]);
}

function CopyTo({
  effects,
  from,
  close,
}: {
  effects: Effect[];
  from: FxTarget;
  close: () => void;
}) {
  const all = destinations().filter((d) => key(d.target) !== key(from));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const tracks = all.filter((d) => typeof d.target === "object" && "track" in d.target);
  const toggle = (k: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const what = effects.length === 1 ? effects[0].name : `${effects.length} effects`;
  return (
    <div className="flex w-[240px] flex-col gap-1 p-1" data-testid="fx-copy-to">
      <div className="label px-1">Copy {what} to</div>
      <button
        className="menu-item"
        onClick={() =>
          setPicked((s) =>
            tracks.every((d) => s.has(key(d.target)))
              ? new Set()
              : new Set([...s, ...tracks.map((d) => key(d.target))]),
          )
        }
      >
        <span className="w-3.5" />
        <span className="flex-1 text-dim">Every track</span>
      </button>
      <div className="scroll-thin max-h-[50vh] overflow-y-auto">
        {all.map((d) => (
          <label key={key(d.target)} className="menu-item cursor-pointer">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={picked.has(key(d.target))}
              onChange={() => toggle(key(d.target))}
            />
            {d.color && <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />}
            <span className="flex-1 truncate">{d.name}</span>
          </label>
        ))}
      </div>
      <button
        className="hw-btn !min-h-[26px]"
        disabled={!picked.size}
        data-testid="fx-copy-to-go"
        onClick={() => {
          copyEffectsTo(
            all.filter((d) => picked.has(key(d.target))).map((d) => d.target),
            effects,
          );
          close();
        }}
      >
        Copy{picked.size ? ` to ${picked.size}` : ""}
      </button>
    </div>
  );
}
