/**
 * Macro editor and mod matrix for the synth editor Advanced view.
 */
import { contextMenu } from "../../components/Menu";
import { AutoMark } from "../../components/AutoMark";
import { Encoder } from "../../components/Encoder";
import { controlItems } from "../../state/automationKnob";
import { switchName } from "../../model/patchSwitches";
import { SECTIONS, fromKnob, knobDef, paramName, paramOf, toKnob } from "../../model/patchParams";
import {
  applyMacros,
  clone,
  numberAt,
  setThroughMacros,
  withMacroValues,
  type MacroTarget,
  type ModDest,
  type ModSource,
  type SynthPatch,
} from "../../model/synth";
import type { Track } from "../../model/types";
import { macroKey, soundHint } from "../../library/synthTrack";
import { SwitchSelect } from "./switches";

/** The Encoder def for a macro knob, shared between Basic and the Macros editor. */
export const macroDef = (
  m: SynthPatch["macros"][number],
  i: number,
  label = m.name || `Macro ${i + 1}`,
) => ({
  id: `macro${i + 1}`,
  label,
  default: m.value,
  format: (v: number) => `${Math.round(v * 100)}%`,
});

const emptySlot = () => ({ source: null, dest: null, amount: 0, via: null });

/**
 * A new target for macro `i`: the knob's whole range, shifted (and squeezed where it must be) so
 * the macro, where it is, gives the value you hear now: adding it doesn't change the sound.
 */
export function newTarget(p: SynthPatch, i: number, path: string, values: number[]): MacroTarget {
  const d = paramOf(path)!;
  const at = values[i] ?? p.macros[i].value;
  const v = numberAt(applyMacros(withMacroValues(p, values)), path);
  // a copy (p may be a draft) with just this target
  const probe = clone(p);
  probe.macros = [{ name: "", value: at, targets: [{ path, min: d.min, max: d.max }] }];
  setThroughMacros(probe, path, v, d.min, d.max, [at]);
  return probe.macros[0].targets[0];
}

export function TargetSelect({
  value,
  onPick,
  placeholder,
}: {
  value: string;
  onPick: (path: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      className={`input !h-6 min-w-0 ${placeholder ? "self-start" : "flex-1"}`}
      value={value}
      onChange={(e) => e.target.value && onPick(e.target.value)}
      data-hint={placeholder ? "synth.macro.add" : "synth.macro.target"}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {SECTIONS.map((s) => (
        <optgroup key={s.id} label={s.title}>
          {s.params.map((d) => (
            <option key={d.path} value={d.path}>
              {paramName(d.path)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** The explain-mode hint of a knob: the same for every oscillator, filter, envelope and LFO. */
export const pathHint = (path: string) => `synth.${path.replace(/\.\d+\./, ".")}`;

/**
 * The macros: each one's name and where it is (the track's SOUND knob), and up to 4 targets, each
 * moved from its min to its max as the macro turns.
 */
export function Macros({
  track,
  patch,
  values,
  setMacro,
  onChange,
  learn,
}: {
  track: Track;
  patch: SynthPatch;
  values: number[];
  setMacro: (i: number, v: number) => void;
  onChange: (fn: (p: SynthPatch) => void, key?: string) => void;
  learn: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2"
      data-testid="macro-editor"
    >
      {patch.macros.map((m, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 rounded border border-line p-1.5"
          data-macro={i}
        >
          <div className="flex items-center gap-1.5">
            <Encoder
              def={macroDef(m, i, "")}
              value={values[i]}
              onChange={(v) => setMacro(i, v)}
              color={track.color}
              size={28}
              hint={soundHint(`macro${i + 1}`)}
              midiTarget={learn ? `track:${track.id}:${macroKey(i)}` : undefined}
              learnLabel={`${track.name} · ${m.name}`}
            />
            <input
              className="input !h-6 min-w-0 flex-1"
              value={m.name}
              onChange={(e) =>
                onChange((p) => void (p.macros[i].name = e.target.value), `macro-name-${i}`)
              }
              aria-label={`Macro ${i + 1} name`}
              data-hint="synth.macro.name"
            />
          </div>
          {m.targets.map((t, j) => {
            const d = paramOf(t.path);
            if (!d) return null;
            const bound = (end: "min" | "max") => (
              <Encoder
                def={{ ...knobDef(d, d[end]), label: end === "min" ? "At 0" : "At 1" }}
                value={toKnob(d, t[end])}
                onChange={(k) =>
                  onChange((p) => {
                    p.macros[i].targets[j][end] = fromKnob(d, k);
                  }, `macro-${i}-${j}-${end}`)
                }
                color={track.color}
                size={26}
                hint={`synth.macro.${end}`}
              />
            );
            return (
              <div key={j} className="flex items-center gap-1" data-target={j}>
                <TargetSelect
                  value={t.path}
                  onPick={(path) =>
                    onChange((p) => {
                      p.macros[i].targets[j] = newTarget(p, i, path, values);
                    })
                  }
                />
                {bound("min")}
                {bound("max")}
                <button
                  className="tool-btn !h-5 !px-1 text-faint"
                  title="Remove this target"
                  data-hint="synth.macro.remove"
                  onClick={() => onChange((p) => void p.macros[i].targets.splice(j, 1))}
                >
                  ×
                </button>
              </div>
            );
          })}
          {m.targets.length < 4 && (
            <TargetSelect
              value=""
              placeholder="+ Target"
              onPick={(path) =>
                onChange((p) => void p.macros[i].targets.push(newTarget(p, i, path, values)))
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** The mod matrix: 8 slots of source → destination × amount, optionally scaled by "via". */
export function Matrix({
  patch,
  onChange,
  color,
  target,
  name,
}: {
  patch: SynthPatch;
  onChange: (fn: (p: SynthPatch) => void) => void;
  color: string;
  /** The track's synth target prefix ("track:<id>:synth:"), for MIDI learn and automation. */
  target?: string;
  name: string;
}) {
  const menu = (e: React.MouseEvent, path: string, label: string) =>
    target && contextMenu(e, controlItems(`${target}${path}`, `${name} · ${label}`));
  const slots = Array.from({ length: 8 }, (_, i) => patch.matrix[i] ?? emptySlot());
  const setSlot = (i: number, change: Partial<SynthPatch["matrix"][number]>) =>
    onChange((p) => {
      while (p.matrix.length < 8) p.matrix.push(emptySlot());
      Object.assign(p.matrix[i], change);
    });
  const slotSwitch = (i: number, part: "source" | "dest" | "via") => {
    const path = `matrix.${i}.${part}`;
    return {
      path,
      target: target && `${target}${path}`,
      learnLabel: `${name} · ${switchName(path)}`,
    };
  };
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_100px_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 text-[11px]"
      data-testid="mod-matrix"
    >
      <span className="label">Source</span>
      <span className="label">Destination</span>
      <span className="label">Amount</span>
      <span className="label">Via</span>
      {slots.flatMap((s, i) => [
        <span key={`s${i}`} className="contents" data-slot={i}>
          <SwitchSelect
            value={s.source}
            onPick={(v) => setSlot(i, { source: v as ModSource | null })}
            hint="synth.matrix.source"
            patch={patch}
            {...slotSwitch(i, "source")}
          />
        </span>,
        <span key={`d${i}`} className="contents">
          <SwitchSelect
            value={s.dest}
            onPick={(v) => setSlot(i, { dest: v as ModDest | null })}
            hint="synth.matrix.dest"
            {...slotSwitch(i, "dest")}
          />
        </span>,
        <span
          key={`a${i}`}
          className="flex items-center gap-1"
          data-hint="synth.matrix.amount"
          onContextMenu={(e) => menu(e, `matrix.${i}.amount`, `Matrix slot ${i + 1} amount`)}
        >
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={s.amount}
            onChange={(e) => setSlot(i, { amount: Number(e.target.value) })}
            onDoubleClick={() => setSlot(i, { amount: 0 })}
            className="w-16"
            style={{ accentColor: color }}
            aria-label={`Slot ${i + 1} amount`}
          />
          <span className="num w-8 text-right text-[10px] text-dim">
            {Math.round(s.amount * 100)}
          </span>
          <AutoMark target={target && `${target}matrix.${i}.amount`} />
        </span>,
        <span key={`v${i}`} className="contents">
          <SwitchSelect
            value={s.via}
            onPick={(v) => setSlot(i, { via: v as ModSource | null })}
            hint="synth.matrix.via"
            patch={patch}
            {...slotSwitch(i, "via")}
          />
        </span>,
      ])}
    </div>
  );
}
