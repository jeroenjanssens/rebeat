import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Save } from "lucide-react";
import { Encoder } from "../../components/Encoder";
import { Keyboard } from "../../components/Keyboard";
import { toast } from "../../components/Toast";
import * as engine from "../../engine/engine";
import { SYNTH_PRESETS, defaultInstrument, patchOf } from "../../engine/instruments";
import { factorySynth } from "../../library/synths";
import { saveInstrument } from "../../library/userInstruments";
import {
  INIT_PATCH,
  MOD_DESTS,
  MOD_SOURCES,
  NOTE_LENGTHS,
  type Env,
  type LfoShape,
  type ModDest,
  type ModSource,
  type SynthPatch,
} from "../../model/synth";
import type { Track } from "../../model/types";
import { useSelectedTrack, useStore } from "../../state/store";
import { setInstrument, soundLabel } from "../../state/trackActions";
import {
  KNOB_OF_DEST,
  SECTIONS,
  fromKnob,
  getPath,
  knobDef,
  modRanges,
  modulated,
  setPath,
  toKnob,
  type PatchParam,
} from "./patchParams";

const SOURCE_LABEL: Record<ModSource, string> = {
  lfo1: "LFO 1",
  lfo2: "LFO 2",
  lfo3: "LFO 3",
  env1: "Amp env",
  env2: "Filter env",
  env3: "Mod env",
  velocity: "Velocity",
  note: "Note",
  modwheel: "Mod wheel",
  aftertouch: "Aftertouch",
  pitchbend: "Pitch bend",
  random: "Random",
  macro1: "Macro 1",
  macro2: "Macro 2",
  macro3: "Macro 3",
  macro4: "Macro 4",
  macro5: "Macro 5",
  macro6: "Macro 6",
  macro7: "Macro 7",
  macro8: "Macro 8",
};

const LFO_SHAPES: [LfoShape, string][] = [
  ["sine", "Sine"],
  ["triangle", "Triangle"],
  ["rampUp", "Ramp up"],
  ["rampDown", "Ramp down"],
  ["square", "Square"],
  ["sh", "Sample & hold"],
  ["smooth", "Smooth random"],
];

const emptySlot = () => ({ source: null, dest: null, amount: 0, via: null });

/** Shape the selected track's synth (D81, D83): edits a copy on the track; built-ins never change. */
export function SynthEditorPanel() {
  const track = useSelectedTrack();
  const src = track?.kind === "instrument" ? (track.instrument ?? defaultInstrument(track)) : null;
  if (!track || !src || src.source !== "synth")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[12px] text-faint">
        <p>Select an instrument track that plays a synth to shape its sound here.</p>
        {track?.kind === "instrument" && (
          <button
            className="tool-btn border border-line"
            onClick={() => setInstrument(track.id, { source: "synth", preset: "init" })}
          >
            Make {track.name} a synth
          </button>
        )}
      </div>
    );
  return <Editor track={track} />;
}

function Editor({ track }: { track: Track }) {
  const commit = useStore((s) => s.commit);
  const src = track.instrument ?? defaultInstrument(track);
  const patch = patchOf(src);
  const factory = factorySynth(src.preset);
  const defaults = factory?.patch ?? INIT_PATCH;
  const edited = !!src.patch;
  const [saving, setSaving] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // the keyboard's lowest C: two octaves around the track's range
  const [low, setLow] = useState(track.category === "bass" ? 24 : 48);

  /**
   * Change the patch. The first edit copies the factory synth onto the track; an older (version 1)
   * patch is upgraded. The copy is made from the store's state, outside the draft.
   */
  const edit = (fn: (p: SynthPatch) => void, key?: string) => {
    const fresh = structuredClone(patchOf(src));
    commit((pr) => {
      const t = pr.tracks.find((x) => x.id === track.id);
      if (!t) return;
      t.instrument ??= { ...src };
      if (t.instrument.patch?.version !== 2) t.instrument.patch = fresh;
      fn(t.instrument.patch as SynthPatch);
    }, key);
  };
  const set = (path: string, v: unknown) =>
    edit((p) => setPath(p, path, v), `syn-${track.id}-${path}`);

  // modulation: the range the matrix can move each knob, and where it is now (live)
  const synth = engine.trackSynth(track);
  useEffect(() => {
    synth?.monitor(true);
    return () => synth?.monitor(false);
  }, [synth]);
  const ranges = modRanges(patch);
  const DESTS = Object.keys(MOD_DESTS) as ModDest[];
  const knob = (d: PatchParam) => {
    const value = getPath(patch, d.path);
    const r = ranges.get(d.path);
    const octaves = r ? KNOB_OF_DEST[r.dest]?.octaves : false;
    const toK = (v: number) => toKnob(d, Math.min(d.max, Math.max(d.min, v)));
    return (
      <Encoder
        key={d.path}
        def={knobDef(d, getPath(defaults, d.path))}
        value={toKnob(d, value)}
        onChange={(k) => set(d.path, fromKnob(d, k))}
        color={track.color}
        size={34}
        hint={hintFor(d.path)}
        modRange={
          r
            ? [toK(modulated(value, r.lo, octaves)), toK(modulated(value, r.hi, octaves))]
            : undefined
        }
        live={
          r && synth
            ? () => {
                const m = synth.modulation();
                return m ? toK(modulated(value, m[DESTS.indexOf(r.dest)], octaves)) : null;
              }
            : undefined
        }
      />
    );
  };
  const knobs = (id: string, skip: (path: string) => boolean = () => false) => (
    <div className="flex flex-wrap gap-1">
      {SECTIONS.find((s) => s.id === id)!
        .params.filter((d) => !skip(d.path))
        .map(knob)}
    </div>
  );

  const choice = <T extends string | number>(
    value: T,
    options: [T, string][],
    onPick: (v: T) => void,
    hint: string,
  ) => (
    <div className="segmented" data-hint={hint}>
      {options.map(([v, label]) => (
        <button key={String(v)} data-active={value === v} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
  const toggle = (on: boolean, label: string, onFlip: (v: boolean) => void, hint: string) => (
    <button
      className="tool-btn !h-6 border border-line !text-[10.5px]"
      data-active={on}
      aria-pressed={on}
      onClick={() => onFlip(!on)}
      data-hint={hint}
    >
      {label}
    </button>
  );

  const oscBox = (i: 0 | 1 | 2) => {
    const o = patch.osc[i];
    return (
      <Box
        key={`o${i}`}
        title={`Oscillator ${i + 1}`}
        on={o.on}
        onToggle={(v) => set(`osc.${i}.on`, v)}
        hint="synth.osc.on"
      >
        <div className="flex flex-wrap gap-1.5">
          {toggle(
            o.retrigger,
            "Retrigger",
            (v) => set(`osc.${i}.retrigger`, v),
            "synth.osc.retrigger",
          )}
          {i > 0 && toggle(o.sync, "Sync to 1", (v) => set(`osc.${i}.sync`, v), "synth.osc.sync")}
        </div>
        {knobs(
          `osc${i}`,
          (p) => (p.endsWith(".pw") && o.shape < 2.5) || (p.endsWith(".phase") && !o.retrigger),
        )}
      </Box>
    );
  };

  const filterBox = (i: 0 | 1) => {
    const f = patch.filters[i];
    return (
      <Box
        key={`f${i}`}
        title={`Filter ${i + 1}`}
        on={f.on}
        onToggle={(v) => set(`filters.${i}.on`, v)}
        hint="synth.filter.on"
      >
        <div className="flex flex-wrap gap-1.5">
          {choice(
            f.model,
            [
              ["ladder", "Ladder"],
              ["svf", "SVF"],
            ],
            (v) => set(`filters.${i}.model`, v),
            "synth.filter.model",
          )}
          {(f.model === "svf" || f.type !== "lp") &&
            choice(
              f.type,
              [
                ["lp", "LP"],
                ["hp", "HP"],
                ["bp", "BP"],
                ["notch", "Notch"],
              ],
              (v) => set(`filters.${i}.type`, v),
              "synth.filter.type",
            )}
          {i === 1 &&
            choice(
              patch.routing,
              [
                ["serial", "After 1"],
                ["parallel", "Beside 1"],
              ],
              (v) => set("routing", v),
              "synth.filter.routing",
            )}
        </div>
        {knobs(`filter${i}`)}
      </Box>
    );
  };

  const envBox = (i: 0 | 1 | 2, title: string) => {
    const e = patch.envs[i];
    return (
      <Box key={`e${i}`} title={title}>
        <EnvelopeView
          env={e}
          color={track.color}
          onChange={(next, key) => edit((p) => void Object.assign(p.envs[i], next), key)}
          hint="synth.env.view"
        />
        <div className="flex flex-wrap gap-1.5">
          {toggle(e.loop, "Loop", (v) => set(`envs.${i}.loop`, v), "synth.env.loop")}
        </div>
        {knobs(`env${i}`)}
      </Box>
    );
  };

  const lfoBox = (i: 0 | 1 | 2) => {
    const l = patch.lfos[i];
    return (
      <Box key={`l${i}`} title={`LFO ${i + 1}`}>
        <div className="flex flex-wrap gap-1.5">
          <select
            className="input !h-6"
            value={l.shape}
            onChange={(e) => set(`lfos.${i}.shape`, e.target.value)}
            data-hint="synth.lfo.shape"
          >
            {LFO_SHAPES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="input !h-6"
            value={l.sync ?? ""}
            onChange={(e) => set(`lfos.${i}.sync`, e.target.value || null)}
            data-hint="synth.lfo.sync"
          >
            <option value="">Free</option>
            {NOTE_LENGTHS.map((s) => (
              <option key={s} value={s}>
                Sync {s}
              </option>
            ))}
          </select>
          {choice(
            l.mode,
            [
              ["voice", "Per note"],
              ["global", "Global"],
            ],
            (v) => set(`lfos.${i}.mode`, v),
            "synth.lfo.mode",
          )}
          {toggle(l.unipolar, "0..1", (v) => set(`lfos.${i}.unipolar`, v), "synth.lfo.unipolar")}
        </div>
        {knobs(`lfo${i}`, (p) => p.endsWith(".rate") && !!l.sync)}
      </Box>
    );
  };

  const save = async (name: string) => {
    const entry = await saveInstrument(
      useStore.getState().project.tracks.find((t) => t.id === track.id)!,
      name,
    );
    // the track now plays the saved instrument
    setInstrument(track.id, entry.source);
    toast(`Saved “${name}” to Your instruments`);
    setSaving(null);
  };

  return (
    <div
      ref={root}
      className="flex h-full min-h-0 flex-col outline-none"
      tabIndex={0}
      data-testid="synth-editor"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="h-3 w-1 rounded" style={{ background: track.color }} />
        <span className="label !text-ink">{track.name}</span>
        <select
          className="input !h-6 max-w-[220px]"
          value={src.from ? "" : src.preset}
          onChange={(e) => setInstrument(track.id, { source: "synth", preset: e.target.value })}
          title="Start from a factory synth"
          data-hint="synth.start"
          data-testid="synth-start"
        >
          {src.from && <option value="">{soundLabel(track)}</option>}
          {[...new Set(SYNTH_PRESETS.map((p) => p.group))].map((g) => (
            <optgroup key={g} label={g}>
              {SYNTH_PRESETS.filter((p) => p.group === g).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {edited && !src.from && <span className="text-[10.5px] text-lit">edited</span>}
        <span className="flex-1" />
        {edited && !src.from && factory && (
          <button
            className="tool-btn"
            title={`Back to the factory “${factory.name}”`}
            data-hint="synth.revert"
            onClick={() => setInstrument(track.id, { source: "synth", preset: src.preset })}
          >
            <RotateCcw size={13} />
          </button>
        )}
        {saving === null ? (
          <button
            className="tool-btn border border-line"
            data-hint="synth.save"
            data-testid="synth-save"
            onClick={() => setSaving(src.name ?? `${factory?.name ?? "Synth"} (mine)`)}
          >
            <Save size={13} /> Save to library
          </button>
        ) : (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (saving.trim()) void save(saving.trim());
            }}
          >
            <input
              autoFocus
              className="input !h-6 w-44"
              value={saving}
              onChange={(e) => setSaving(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSaving(null)}
              data-testid="synth-save-name"
            />
            <button className="hw-btn !min-h-[24px]" type="submit" data-testid="synth-save-ok">
              Save
            </button>
          </form>
        )}
      </div>
      <SignalFlow patch={patch} color={track.color} onPlay={() => engine.playOnce(track)} />

      <div className="scroll-thin grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2 overflow-auto p-2">
        {oscBox(0)}
        {oscBox(1)}
        {oscBox(2)}
        <Box title="Sub · noise · ring · FM">
          <div className="flex flex-wrap gap-1.5">
            {choice(
              patch.sub.octave,
              [
                [-1, "Sub −1"],
                [-2, "−2"],
              ],
              (v) => set("sub.octave", v),
              "synth.sub.octave",
            )}
            {choice(
              patch.sub.shape,
              [
                ["sine", "Sine"],
                ["square", "Square"],
              ],
              (v) => set("sub.shape", v),
              "synth.sub.shape",
            )}
            {choice(
              patch.noise.color,
              [
                ["white", "White"],
                ["pink", "Pink"],
              ],
              (v) => set("noise.color", v),
              "synth.noise.color",
            )}
            {choice(
              patch.fm.route,
              [
                ["2>1", "FM 2→1"],
                ["3>1", "3→1"],
                ["3>2", "3→2"],
                ["1>1", "1→1"],
              ],
              (v) => set("fm.route", v),
              "synth.fm.route",
            )}
          </div>
          {knobs("extra")}
        </Box>
        {filterBox(0)}
        {filterBox(1)}
        {envBox(0, "Amp envelope")}
        {envBox(1, "Filter envelope")}
        {envBox(2, "Mod envelope")}
        {lfoBox(0)}
        {lfoBox(1)}
        {lfoBox(2)}
        <Box title="Mod matrix" wide>
          <Matrix patch={patch} onChange={(fn) => edit(fn)} color={track.color} />
        </Box>
        <Box title="Voice">
          <div className="flex flex-wrap gap-1.5">
            {choice(
              patch.voice.mode,
              [
                ["poly", "Poly"],
                ["mono", "Mono"],
                ["legato", "Legato"],
              ],
              (v) => set("voice.mode", v),
              "synth.voice.mode",
            )}
            {choice(
              patch.voice.glideMode,
              [
                ["always", "Glide always"],
                ["legato", "Overlapping"],
              ],
              (v) => set("voice.glideMode", v),
              "synth.voice.glideMode",
            )}
            {choice(
              patch.voice.steal,
              [
                ["oldest", "Steal oldest"],
                ["quietest", "Quietest"],
              ],
              (v) => set("voice.steal", v),
              "synth.voice.steal",
            )}
          </div>
          {knobs("voice")}
        </Box>
        <Box title="Output">{knobs("output")}</Box>
      </div>
      <div className="flex h-[74px] shrink-0 gap-2 border-t border-line px-2 py-1.5">
        <Wheels track={track} />
        <div className="min-w-0 flex-1">
          <Keyboard
            low={low}
            scope={root}
            onOctave={(d) => setLow((l) => Math.max(12, Math.min(84, l + 12 * d)))}
            play={(pitch, velocity) => engine.holdNote(track, pitch, velocity)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Pitch bend and mod wheel, like the ones beside a keyboard: bend springs back to the middle
 * when you let go; the mod wheel stays where you leave it.
 */
function Wheels({ track }: { track: Track }) {
  const [bend, setBend] = useState(0);
  const [mod, setMod] = useState(0);
  const send = (name: "pitchbend" | "modwheel", v: number) =>
    engine.trackSynth(track)?.control(name, v);
  const wheel = (
    label: string,
    value: number,
    bipolar: boolean,
    onValue: (v: number) => void,
    onRelease: (() => void) | null,
    hint: string,
    testid: string,
  ) => {
    const at = (e: React.PointerEvent) => {
      const r = e.currentTarget.getBoundingClientRect();
      const k = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      onValue(bipolar ? k * 2 - 1 : k);
    };
    const pos = bipolar ? (value + 1) / 2 : value;
    return (
      <div className="flex flex-col items-center gap-0.5" data-hint={hint}>
        <div
          className="relative w-5 flex-1 cursor-ns-resize touch-none rounded bg-display"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            at(e);
          }}
          onPointerMove={(e) => e.buttons && at(e)}
          onPointerUp={() => onRelease?.()}
          data-testid={testid}
        >
          <div
            className="absolute inset-x-0.5 h-1.5 rounded-sm bg-[var(--lit)]"
            style={{ bottom: `calc(${pos * 100}% - 3px)` }}
          />
        </div>
        <span className="label !text-[8.5px]">{label}</span>
      </div>
    );
  };
  return (
    <div className="flex gap-1.5">
      {wheel(
        "Bend",
        bend,
        true,
        (v) => {
          setBend(v);
          send("pitchbend", v);
        },
        () => {
          setBend(0);
          send("pitchbend", 0);
        },
        "synth.wheel.bend",
        "bend-wheel",
      )}
      {wheel(
        "Mod",
        mod,
        false,
        (v) => {
          setMod(v);
          send("modwheel", v);
        },
        null,
        "synth.wheel.mod",
        "mod-wheel",
      )}
    </div>
  );
}

/** The explain-mode hint of a knob: the same for every oscillator, filter, envelope and LFO. */
export const hintFor = (path: string) => `synth.${path.replace(/\.\d+\./, ".")}`;

/** The mod matrix: 8 slots of source → destination × amount, optionally scaled by "via". */
function Matrix({
  patch,
  onChange,
  color,
}: {
  patch: SynthPatch;
  onChange: (fn: (p: SynthPatch) => void) => void;
  color: string;
}) {
  const slots = Array.from({ length: 8 }, (_, i) => patch.matrix[i] ?? emptySlot());
  const setSlot = (i: number, change: Partial<SynthPatch["matrix"][number]>) =>
    onChange((p) => {
      while (p.matrix.length < 8) p.matrix.push(emptySlot());
      Object.assign(p.matrix[i], change);
    });
  const sourceSelect = (
    value: ModSource | null,
    onPick: (v: ModSource | null) => void,
    hint: string,
    none: string,
  ) => (
    <select
      className="input !h-6 min-w-0"
      value={value ?? ""}
      onChange={(e) => onPick((e.target.value || null) as ModSource | null)}
      data-hint={hint}
    >
      <option value="">{none}</option>
      {MOD_SOURCES.map((s) => (
        <option key={s} value={s}>
          {SOURCE_LABEL[s]}
        </option>
      ))}
    </select>
  );
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
          {sourceSelect(s.source, (v) => setSlot(i, { source: v }), "synth.matrix.source", "—")}
        </span>,
        <select
          key={`d${i}`}
          className="input !h-6 min-w-0"
          value={s.dest ?? ""}
          onChange={(e) => setSlot(i, { dest: (e.target.value || null) as ModDest | null })}
          data-hint="synth.matrix.dest"
        >
          <option value="">—</option>
          {(Object.keys(MOD_DESTS) as ModDest[]).map((d) => (
            <option key={d} value={d}>
              {MOD_DESTS[d].label}
            </option>
          ))}
        </select>,
        <span key={`a${i}`} className="flex items-center gap-1" data-hint="synth.matrix.amount">
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
        </span>,
        <span key={`v${i}`} className="contents">
          {sourceSelect(s.via, (v) => setSlot(i, { via: v }), "synth.matrix.via", "always")}
        </span>,
      ])}
    </div>
  );
}

function Box({
  title,
  children,
  on,
  onToggle,
  hint,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  on?: boolean;
  onToggle?: (v: boolean) => void;
  hint?: string;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(true);
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
        {onToggle && (
          <button
            className="tool-btn !h-5 border border-line !px-1.5 !text-[10px]"
            data-active={on}
            aria-pressed={on}
            onClick={() => onToggle(!on)}
            data-hint={hint}
          >
            {on ? "On" : "Off"}
          </button>
        )}
      </div>
      {open && children}
    </section>
  );
}

const W = 230;
const H = 56;

/** One cycle of what the oscillators make together. */
function WavePreview({ patch, color }: { patch: SynthPatch; color: string }) {
  const basic = (k: number, t: number, pw: number) =>
    k <= 0
      ? Math.sin(t * 2 * Math.PI)
      : k === 1
        ? 1 - 4 * Math.abs(t - 0.5)
        : k === 2
          ? 2 * t - 1
          : t < pw
            ? 1
            : -1;
  const wave = (o: SynthPatch["osc"][number], x: number) => {
    const t = (x * Math.pow(2, o.octave + o.semi / 12)) % 1;
    const a = Math.floor(o.shape);
    const f = o.shape - a;
    return a >= 3 ? basic(3, t, o.pw) : basic(a, t, o.pw) * (1 - f) + basic(a + 1, t, o.pw) * f;
  };
  const n = 200;
  const ys = Array.from({ length: n + 1 }, (_, i) => {
    const x = i / n;
    let y = patch.sub.level * Math.sin(x * Math.PI);
    for (const o of patch.osc) if (o.on) y += o.level * wave(o, x);
    return y;
  });
  const peak = Math.max(...ys.map(Math.abs));
  const pts = ys.map((y, i) => `${(i / n) * W},${H / 2 - (y / (peak || 1)) * (H / 2 - 3)}`);
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="rounded bg-display"
      data-hint="synth.wave.view"
    >
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.1)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

/** An envelope's shape with draggable points: attack, decay/sustain, release. */
function EnvelopeView({
  env,
  color,
  onChange,
  hint,
}: {
  env: Env;
  color: string;
  onChange: (e: Partial<Env>, key: string) => void;
  hint: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ point: "a" | "d" | "r"; key: string } | null>(null);
  // times drawn on a square-root scale, so short and long envelopes both fit
  const seg = W / 4;
  const tx = (t: number) => Math.sqrt(Math.min(t, 10) / 10) * seg;
  const fromX = (x: number) => Math.max(0.001, Math.pow(Math.max(0, x) / seg, 2) * 10);
  const a = tx(env.attack);
  const h = a + tx(env.hold);
  const d = h + tx(env.decay);
  const s = H - 4 - env.sustain * (H - 8);
  const hold = d + seg * 0.6;
  const r = hold + tx(env.release);
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    const next: Partial<Env> = {};
    if (drag.current.point === "a") next.attack = fromX(x);
    if (drag.current.point === "d") {
      next.decay = fromX(x - h);
      next.sustain = Math.min(1, Math.max(0, (H - 4 - y) / (H - 8)));
    }
    if (drag.current.point === "r") next.release = Math.min(15, fromX(x - hold));
    onChange(next, drag.current.key);
  };
  const handle = (point: "a" | "d" | "r", x: number, y: number) => (
    <circle
      cx={x}
      cy={y}
      r={4}
      fill={color}
      className="cursor-grab"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { point, key: `env-${point}-${performance.now()}` };
      }}
    />
  );
  return (
    <svg
      ref={ref}
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="touch-none rounded bg-display"
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      data-hint={hint}
    >
      <polyline
        points={`0,${H - 4} ${a},4 ${h},4 ${d},${s} ${hold},${s} ${r},${H - 4}`}
        fill={`color-mix(in oklab, ${color} 18%, transparent)`}
        stroke={color}
        strokeWidth={1.5}
      />
      {handle("a", a, 4)}
      {handle("d", d, s)}
      {handle("r", r, H - 4)}
    </svg>
  );
}

/** The path the sound takes, left to right; the envelopes, LFOs and matrix steer it. */
function SignalFlow({
  patch,
  color,
  onPlay,
}: {
  patch: SynthPatch;
  color: string;
  onPlay: () => void;
}) {
  const sources = [
    ...patch.osc.flatMap((o, i) => (o.on && o.level > 0 ? [`Osc ${i + 1}`] : [])),
    patch.sub.level > 0 && "Sub",
    patch.noise.level > 0 && "Noise",
    patch.ring > 0 && "Ring",
  ].filter(Boolean);
  const name = (f: SynthPatch["filters"][number]) =>
    f.model === "ladder" && f.type === "lp" ? "Ladder" : `SVF ${f.type.toUpperCase()}`;
  const filters = patch.filters.filter((f) => f.on).map(name);
  const step = (label: string, sub?: string) => (
    <span className="flex flex-col items-center rounded border border-line bg-surface px-2 py-0.5">
      <span className="text-[11px] text-ink">{label}</span>
      {sub && <span className="text-[9.5px] text-faint">{sub}</span>}
    </span>
  );
  const arrow = <span className="text-faint">→</span>;
  const mods = patch.matrix.filter((m) => m.source && m.dest && m.amount !== 0).length;
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5"
      data-hint="synth.flow"
    >
      <button
        className="w-[140px]"
        onClick={onPlay}
        title="Click to hear it"
        data-testid="synth-wave"
      >
        <WavePreview patch={patch} color={color} />
      </button>
      {step(
        sources.join(" + ") || "Silence",
        patch.fm.amount > 0 ? `FM ${patch.fm.route.replace(">", "→")}` : undefined,
      )}
      {arrow}
      {step(
        filters.length ? filters.join(patch.routing === "parallel" ? " ∥ " : " → ") : "No filter",
        filters.length ? "filter envelope" : undefined,
      )}
      {arrow}
      {step("Amp", "amp envelope")}
      {arrow}
      {step(patch.output.drive > 0.01 ? "Drive · out" : "Out")}
      {mods > 0 && (
        <span className="text-[10.5px] text-faint">
          · {mods} modulation{mods > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
