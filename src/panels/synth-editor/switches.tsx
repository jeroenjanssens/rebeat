/**
 * Switch atom components for the synth editor: Group (foldable section), Box (block with
 * title, copy/paste, on/off), and the switch controls (Choice, Toggle, SwitchSelect, BoxToggle)
 * that can be MIDI-learned and automated.
 */
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, ClipboardPaste, Copy } from "lucide-react";
import { create } from "zustand";
import { contextMenu } from "../../components/Menu";
import { AutoMark } from "../../components/AutoMark";
import { optionLabels, switchOf, switchValue, type SwitchValue } from "../../model/patchSwitches";
import { onFrame } from "../../render/raf";
import { useAutomated, controlItems } from "../../state/automationKnob";
import { toast } from "../../components/Toast";
import { clone, type SynthPatch } from "../../model/synth";
import { useSettings } from "../../state/settings";

export type ClipKind = "osc" | "filter" | "env" | "lfo";

/** A copied block (oscillator, filter, envelope, LFO), to paste on another of its kind. */
export const useClip = create<{
  clip: { kind: ClipKind; from: string; data: Record<string, unknown> } | null;
}>(() => ({ clip: null }));

export interface SwitchProps {
  path: string;
  /** Its MIDI-learn and automation target (none for a library sound). */
  target?: string;
  learnLabel: string;
}

/**
 * A section of the Advanced view, in the order the sound flows. Fold it with its title; the
 * editor remembers which are folded.
 */
export function Group({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  const folded = useSettings((s) => s.synthFolded.includes(id));
  const toggle = () => {
    const f = useSettings.getState().synthFolded;
    useSettings.getState().set({ synthFolded: folded ? f.filter((x) => x !== id) : [...f, id] });
  };
  return (
    <section className="flex flex-col gap-1.5" data-group={id}>
      <button
        className="flex items-center gap-1.5 self-start text-left"
        onClick={toggle}
        aria-expanded={!folded}
        data-hint="synth.group"
      >
        {folded ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <span className="label !text-ink">{title}</span>
      </button>
      {!folded && (
        <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2">
          {children}
        </div>
      )}
    </section>
  );
}

export function Box({
  title,
  children,
  on,
  onToggle,
  hint,
  wide,
  clip,
  toggleSwitch,
}: {
  title: string;
  children: React.ReactNode;
  on?: boolean;
  onToggle?: (v: boolean) => void;
  hint?: string;
  wide?: boolean;
  /** Copy this block's settings, or paste another block's of the same kind. */
  clip?: { kind: ClipKind; data: object; paste: (data: Record<string, unknown>) => void };
  /** Its On as a switch (D231): learnable and automatable. */
  toggleSwitch?: SwitchProps;
}) {
  const [open, setOpen] = useState(true);
  const copied = useClip((s) => s.clip);
  return (
    <section
      className={`flex flex-col gap-2 rounded-md border border-line bg-surface/50 p-2 ${wide ? "col-span-full" : ""}`}
      style={{ opacity: on === false ? 0.6 : 1 }}
      data-section={title}
    >
      <div className="flex items-center gap-1.5">
        <button
          className="text-faint"
          onClick={() => setOpen(!open)}
          title={open ? "Fold" : "Unfold"}
          data-hint="synth.fold"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="label flex-1">{title}</span>
        {clip && (
          <>
            <button
              className="tool-btn !h-5 !px-1 text-faint"
              title={`Copy ${title}`}
              data-hint="synth.copy"
              onClick={() => {
                useClip.setState({
                  clip: {
                    kind: clip.kind,
                    from: title,
                    data: clone(clip.data) as Record<string, unknown>,
                  },
                });
                toast(`Copied ${title}`);
              }}
            >
              <Copy size={11} />
            </button>
            {copied?.kind === clip.kind && copied.from !== title && (
              <button
                className="tool-btn !h-5 !px-1 text-faint"
                title={`Paste ${copied.from} here`}
                data-hint="synth.paste"
                onClick={() => clip.paste(copied.data)}
              >
                <ClipboardPaste size={11} />
              </button>
            )}
          </>
        )}
        {onToggle && <BoxToggle on={!!on} onToggle={onToggle} hint={hint} sw={toggleSwitch} />}
      </div>
      {open && children}
    </section>
  );
}

/** A switch's value as it plays: while its lane plays, the lane's choice. */
export function useSwitchValue<T>(target: string | undefined, path: string, value: T): T {
  const auto = useAutomated(target);
  const [k, setK] = useState<number | null>(null);
  useEffect(() => {
    const live = auto.live;
    if (!live) return;
    return onFrame(() =>
      setK((prev) => {
        const next = live();
        // Avoid writes that don't change the displayed choice.
        return next === prev ? prev : next;
      }),
    );
  }, [auto.live]);
  const sw = switchOf(path);
  return k === null || !sw || !auto.live ? value : (switchValue(sw, k) as T);
}

export const switchMenu = (e: React.MouseEvent, p: SwitchProps) =>
  p.target && contextMenu(e, controlItems(p.target, p.learnLabel));

export function Choice<T extends string | number>({
  value,
  options,
  onPick,
  hint,
  ...p
}: SwitchProps & {
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
  hint: string;
}) {
  const shown = useSwitchValue(p.target, p.path, value);
  return (
    <span className="inline-flex items-center gap-0.5" onContextMenu={(e) => switchMenu(e, p)}>
      <div className="segmented" data-hint={hint} data-switch={p.path}>
        {options.map(([v, label]) => (
          <button key={String(v)} data-active={shown === v} onClick={() => onPick(v)}>
            {label}
          </button>
        ))}
      </div>
      <AutoMark target={p.target} />
    </span>
  );
}

export function Toggle({
  on,
  label,
  onFlip,
  hint,
  ...p
}: SwitchProps & { on: boolean; label: string; onFlip: (v: boolean) => void; hint: string }) {
  const shown = useSwitchValue(p.target, p.path, on);
  return (
    <span className="inline-flex items-center gap-0.5" onContextMenu={(e) => switchMenu(e, p)}>
      <button
        className="tool-btn !h-6 border border-line !text-[10.5px]"
        data-active={shown}
        aria-pressed={shown}
        onClick={() => onFlip(!on)}
        data-hint={hint}
        data-switch={p.path}
      >
        {label}
      </button>
      <AutoMark target={p.target} />
    </span>
  );
}

/** A switch with many options (an LFO's shape, the matrix's routing), as a menu. The matrix's
 * sources name the macros as the patch does, in a group of their own. */
export function SwitchSelect({
  value,
  onPick,
  hint,
  patch,
  ...p
}: SwitchProps & {
  value: SwitchValue;
  onPick: (v: SwitchValue) => void;
  hint: string;
  /** The patch whose macro names a matrix source shows. */
  patch?: SynthPatch;
}) {
  const sw = switchOf(p.path)!;
  const shown = useSwitchValue(p.target, p.path, value);
  // the options' own values (none: ""), so a menu reads as it always did
  const key = (v: SwitchValue) => (v === null ? "" : String(v));
  const name = optionLabels(p.path, patch);
  const option = (o: (typeof sw.options)[number]) => (
    <option key={key(o.value)} value={key(o.value)}>
      {name ? name(o.value, o.label) : o.label}
    </option>
  );
  const isMacro = (o: (typeof sw.options)[number]) =>
    !!name && typeof o.value === "string" && o.value.startsWith("macro");
  return (
    <span className="flex min-w-0 items-center gap-0.5" onContextMenu={(e) => switchMenu(e, p)}>
      <select
        className="input !h-6 min-w-0"
        value={key(shown)}
        onChange={(e) => {
          const o = sw.options.find((x) => key(x.value) === e.target.value);
          if (o) onPick(o.value);
        }}
        data-hint={hint}
        data-switch={p.path}
      >
        {sw.options.filter((o) => !isMacro(o)).map(option)}
        {name && <optgroup label="Macros">{sw.options.filter(isMacro).map(option)}</optgroup>}
      </select>
      <AutoMark target={p.target} />
    </span>
  );
}

/** A block's On (an oscillator's, a filter's), learnable and automatable when it's a switch. */
export function BoxToggle({
  on,
  onToggle,
  hint,
  sw,
}: {
  on: boolean;
  onToggle: (v: boolean) => void;
  hint?: string;
  sw?: SwitchProps;
}) {
  const shown = useSwitchValue(sw?.target, sw?.path ?? "", on);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      onContextMenu={(e) => sw && switchMenu(e, sw)}
    >
      <AutoMark target={sw?.target} />
      <button
        className="tool-btn !h-5 border border-line !px-1.5 !text-[10px]"
        data-active={shown}
        aria-pressed={shown}
        onClick={() => onToggle(!on)}
        data-hint={hint}
        data-switch={sw?.path}
      >
        {shown ? "On" : "Off"}
      </button>
    </span>
  );
}
