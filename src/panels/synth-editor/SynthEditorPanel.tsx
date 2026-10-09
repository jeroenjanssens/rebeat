import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Dices,
  MoreHorizontal,
  RotateCcw,
  Save,
} from "lucide-react";
import { create } from "zustand";
import { dropdown } from "../../components/Menu";
import { RANDOM_GROUPS, randomizePatch } from "../../model/randomize";
import { SYNTH_EXT, exportSynth, importSynth } from "../../library/rbsynth";
import { platform } from "../../platform";
import { Encoder } from "../../components/Encoder";
import { Keyboard } from "../../components/Keyboard";
import { toast } from "../../components/Toast";
import * as engine from "../../engine/engine";
import { SYNTH_PRESETS, defaultInstrument, patchOf } from "../../engine/instruments";
import { Scope } from "../../components/Scope";
import {
  editPatch,
  macroKey,
  resetMacros,
  macroValues,
  setSynthParam,
  soundHint,
} from "../../library/synthTrack";
import { useSettings } from "../../state/settings";
import { EnvelopeView, H, LfoView, W } from "./pictures";
import { factorySynth } from "../../library/synths";
import { saveInstrument } from "../../library/userInstruments";
import {
  INIT_PATCH,
  applyMacros,
  setThroughMacros,
  withMacroValues,
  MOD_DESTS,
  MOD_SOURCES,
  NOTE_LENGTHS,
  type LfoShape,
  type MacroTarget,
  type ModDest,
  type ModSource,
  type SynthPatch,
} from "../../model/synth";
import type { Track } from "../../model/types";
import { useSelectedTrack, useStore } from "../../state/store";
import { playInstrumentOn, setInstrument, soundLabel } from "../../state/trackActions";

type ClipKind = "osc" | "filter" | "env" | "lfo";
/** A copied block (oscillator, filter, envelope, LFO), to paste on another of its kind. */
const useClip = create<{
  clip: { kind: ClipKind; from: string; data: Record<string, unknown> } | null;
}>(() => ({ clip: null }));

/** A/B compare: per track, which side is playing and the other side's patch (this session). */
const useAB = create<{ ab: Record<string, { side: "A" | "B"; other: SynthPatch }> }>(() => ({
  ab: {},
}));
import {
  KNOB_OF_DEST,
  SECTIONS,
  fromKnob,
  getPath,
  knobDef,
  modRanges,
  modulated,
  paramName,
  paramOf,
  toKnob,
  type PatchParam,
} from "../../model/patchParams";

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
  // what you hear: the macros where the track's SOUND knobs have them
  const values = macroValues(track, patch);
  const shown = applyMacros(withMacroValues(patch, values));
  const view = useSettings((s) => s.synthView);
  const bpm = useStore((s) => s.project.bpm);
  const factory = factorySynth(src.preset);
  const defaults = factory?.patch ?? INIT_PATCH;
  const edited = !!src.patch;
  const [saving, setSaving] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // the keyboard's lowest C: two octaves around the track's range
  const [low, setLow] = useState(track.category === "bass" ? 24 : 48);

  /** Change the patch: the first edit copies the factory synth onto the track (editPatch). */
  const onTrack = (fn: (t: Track) => void, key?: string) =>
    commit((pr) => {
      const t = pr.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    }, key);
  const edit = (fn: (p: SynthPatch) => void, key?: string) => onTrack((t) => editPatch(t, fn), key);
  // values that macros move keep the macros' place (setThroughMacros)
  const set = (path: string, v: unknown) =>
    onTrack((t) => setSynthParam(t, path, v), `syn-${track.id}-${path}`);
  /** Paste a copied block's settings at `prefix` ("osc.1"); macros keep their place. */
  const paste =
    (prefix: string, skip: string[] = []) =>
    (data: Record<string, unknown>) =>
      onTrack((t) => {
        for (const [k, v] of Object.entries(data))
          if (!skip.includes(k)) setSynthParam(t, `${prefix}.${k}`, v);
      }, `paste-${prefix}-${performance.now()}`);

  // A/B: the other side waits here; B starts as a copy of A
  const ab = useAB((s) => s.ab[track.id]);
  const side = ab?.side ?? "A";
  const pickSide = (to: "A" | "B") => {
    if (to === side) return;
    const current = JSON.parse(JSON.stringify(patch)) as SynthPatch;
    const next = JSON.parse(JSON.stringify(ab?.other ?? patch)) as SynthPatch;
    onTrack((t) => editPatch(t, (p) => Object.assign(p, next)));
    useAB.setState((s) => ({ ab: { ...s.ab, [track.id]: { side: to, other: current } } }));
  };
  const name = src.name ?? factory?.name ?? "Synth";
  const more = (el: HTMLElement) =>
    dropdown(el, [
      {
        label: "Init patch",
        onSelect: () =>
          onTrack((t) => {
            editPatch(t, (p) => Object.assign(p, JSON.parse(JSON.stringify(INIT_PATCH))));
            resetMacros(t);
          }),
      },
      {
        render: (close) => (
          <RandomizeMenu
            onRandomize={(amount, locked) => {
              onTrack((t) =>
                editPatch(t, (p) =>
                  Object.assign(p, randomizePatch(p, amount, locked, macroValues(t, p))),
                ),
              );
              close();
            }}
          />
        ),
      },
      { separator: true },
      {
        label: `Export ${SYNTH_EXT}…`,
        onSelect: () => void exportSynth(track, name),
      },
      {
        label: `Import ${SYNTH_EXT}…`,
        onSelect: async () => {
          const [f] = await platform.files.open({ accept: [SYNTH_EXT] });
          if (!f) return;
          try {
            const entry = await importSynth(f);
            playInstrumentOn(track.id, entry);
            toast(`Imported “${entry.name}” into Your instruments`);
          } catch (e) {
            toast(`Couldn't read ${f.name}: ${e instanceof Error ? e.message : e}`, "error");
          }
        },
      },
    ]);
  const setMacro = (i: number, v: number) =>
    onTrack((t) => void (t.params[macroKey(i)] = v), `syn-${track.id}-macro${i}`);

  // modulation: the range the matrix can move each knob, and where it is now (live)
  const synth = engine.trackSynth(track);
  useEffect(() => {
    synth?.monitor(true);
    return () => synth?.monitor(false);
  }, [synth]);
  const ranges = modRanges(shown);
  const DESTS = Object.keys(MOD_DESTS) as ModDest[];
  const knob = (d: PatchParam) => {
    const value = getPath(shown, d.path);
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
        midiTarget={`track:${track.id}:synth:${d.path}`}
        learnLabel={`${track.name} · ${paramName(d.path)}`}
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
    const o = shown.osc[i];
    return (
      <Box
        key={`o${i}`}
        title={`Oscillator ${i + 1}`}
        on={o.on}
        onToggle={(v) => set(`osc.${i}.on`, v)}
        hint="synth.osc.on"
        clip={{ kind: "osc", data: o, paste: paste(`osc.${i}`, i === 0 ? ["sync"] : []) }}
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
        <ShapePicker
          shape={o.shape}
          pw={o.pw}
          color={track.color}
          onPick={(v) => set(`osc.${i}.shape`, v)}
        />
        {knobs(
          `osc${i}`,
          (p) =>
            p.endsWith(".shape") ||
            (p.endsWith(".pw") && o.shape < 2.5) ||
            (p.endsWith(".phase") && !o.retrigger),
        )}
      </Box>
    );
  };

  const filterBox = (i: 0 | 1) => {
    const f = shown.filters[i];
    return (
      <Box
        key={`f${i}`}
        title={`Filter ${i + 1}`}
        on={f.on}
        onToggle={(v) => set(`filters.${i}.on`, v)}
        hint="synth.filter.on"
        clip={{ kind: "filter", data: f, paste: paste(`filters.${i}`) }}
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
    const e = shown.envs[i];
    return (
      <Box key={`e${i}`} title={title} clip={{ kind: "env", data: e, paste: paste(`envs.${i}`) }}>
        <EnvelopeView
          env={e}
          color={track.color}
          onChange={(next, key) =>
            onTrack((t) => {
              for (const [k, v] of Object.entries(next)) setSynthParam(t, `envs.${i}.${k}`, v);
            }, key)
          }
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
    const l = shown.lfos[i];
    return (
      <Box
        key={`l${i}`}
        title={`LFO ${i + 1}`}
        clip={{ kind: "lfo", data: l, paste: paste(`lfos.${i}`) }}
      >
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
        <LfoView lfo={l} color={track.color} bpm={bpm} />
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
        <div className="segmented" data-hint="synth.ab" data-testid="synth-ab">
          {(["A", "B"] as const).map((s) => (
            <button key={s} data-active={side === s} onClick={() => pickSide(s)}>
              {s}
            </button>
          ))}
        </div>
        <button
          className="tool-btn"
          title="Init, randomize, export, import"
          data-hint="synth.more"
          data-testid="synth-more"
          onClick={(e) => more(e.currentTarget)}
        >
          <MoreHorizontal size={14} />
        </button>
        <div className="segmented" data-hint="synth.view" data-testid="synth-view">
          {(
            [
              ["basic", "Basic"],
              ["advanced", "Advanced"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              data-active={view === v}
              onClick={() => useSettings.getState().set({ synthView: v })}
            >
              {label}
            </button>
          ))}
        </div>
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
      {view === "basic" ? (
        <Basic
          track={track}
          patch={shown}
          values={values}
          setMacro={setMacro}
          set={set}
          glide={knob(paramOf("voice.glide")!)}
        />
      ) : (
        <>
          <div className="flex shrink-0 items-center border-b border-line">
            <SignalFlow patch={shown} color={track.color} onPlay={() => engine.playOnce(track)} />
            <div className="flex shrink-0 gap-1.5 px-2">
              <div className="h-[40px] w-[120px]" data-hint="synth.scope">
                <Scope
                  trackId={track.id}
                  color={track.color}
                  meter={false}
                  className="h-full w-full"
                />
              </div>
              <div className="h-[40px] w-[120px]" data-hint="synth.spectrum">
                <Scope
                  trackId={track.id}
                  color={track.color}
                  meter={false}
                  mode="spectrum"
                  className="h-full w-full"
                />
              </div>
            </div>
          </div>

          <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
            <Group id="osc" title="Oscillators">
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
            </Group>
            <Group id="filters" title="Filters">
              {filterBox(0)}
              {filterBox(1)}
            </Group>
            <Group id="envs" title="Envelopes">
              {envBox(0, "Amp envelope")}
              {envBox(1, "Filter envelope")}
              {envBox(2, "Mod envelope")}
            </Group>
            <Group id="lfos" title="LFOs">
              {lfoBox(0)}
              {lfoBox(1)}
              {lfoBox(2)}
            </Group>
            <Group id="matrix" title="Matrix · macros">
              <Box title="Mod matrix" wide>
                <Matrix patch={patch} onChange={(fn) => edit(fn)} color={track.color} />
              </Box>
              <Box title="Macros" wide>
                <Macros
                  track={track}
                  patch={patch}
                  values={values}
                  setMacro={setMacro}
                  onChange={(fn, key) => edit(fn, key)}
                />
              </Box>
            </Group>
            <Group id="voice" title="Voice · output">
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
            </Group>
          </div>
        </>
      )}
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

const SHAPE_NAMES = ["Sine", "Triangle", "Saw", "Pulse"];

/** One cycle of a basic shape, as an SVG path in a w × h box. */
function shapePath(k: number, pw: number, w: number, h: number) {
  const y = (v: number) => h / 2 - v * (h / 2 - 2);
  if (k === 3) return `M0 ${y(1)} H${w * pw} V${y(-1)} H${w} `;
  const pts = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    const v = k === 0 ? Math.sin(t * 2 * Math.PI) : k === 1 ? 1 - 4 * Math.abs(t - 0.5) : 2 * t - 1;
    return `${t * w},${y(v)}`;
  });
  return `M${pts.join(" L")}`;
}

/**
 * The oscillator's shape as four pictures: one click picks one. Between two shapes (a macro or
 * the mod matrix can morph them) both light up, each as much as it's heard.
 */
function ShapePicker({
  shape,
  pw,
  color,
  onPick,
}: {
  shape: number;
  pw: number;
  color: string;
  onPick: (shape: number) => void;
}) {
  const w = 34;
  const h = 18;
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Shape" data-hint="synth.osc.shape">
      {SHAPE_NAMES.map((name, k) => {
        // how much of this shape you hear (1 when it's exactly this one)
        const amount = Math.max(0, 1 - Math.abs(shape - k));
        return (
          <button
            key={name}
            role="radio"
            aria-checked={amount > 0.5}
            aria-label={name}
            title={name}
            data-active={amount > 0.5}
            data-shape={k}
            className="flex flex-col items-center rounded border px-1 py-0.5"
            style={{
              borderColor: amount > 0 ? color : "var(--line)",
              background: `color-mix(in oklab, ${color} ${Math.round(amount * 22)}%, transparent)`,
            }}
            onClick={() => onPick(k)}
          >
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <path
                d={shapePath(k, pw, w, h)}
                fill="none"
                stroke={amount > 0 ? color : "currentColor"}
                strokeWidth={1.5}
                opacity={0.4 + amount * 0.6}
              />
            </svg>
            <span className="text-[9px] text-faint">{name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Randomize: how far, and which sections stay as they are (remembered). */
function RandomizeMenu({
  onRandomize,
}: {
  onRandomize: (amount: number, locked: string[]) => void;
}) {
  const { amount, locked } = useSettings((s) => s.synthRandom);
  const set = (next: Partial<{ amount: number; locked: string[] }>) =>
    useSettings.getState().set({ synthRandom: { amount, locked, ...next } });
  return (
    <div className="flex w-[220px] flex-col gap-2 px-2 py-1.5" data-testid="randomize">
      <div className="flex items-center gap-2 text-[11px]" data-hint="synth.random.amount">
        <span className="text-dim">Amount</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={amount}
          onChange={(e) => set({ amount: Number(e.target.value) })}
          className="flex-1"
          aria-label="Randomize amount"
        />
        <span className="num w-8 text-right">{Math.round(amount * 100)}%</span>
      </div>
      <div className="flex flex-wrap gap-1" data-hint="synth.random.lock">
        {RANDOM_GROUPS.map((g) => {
          const on = !locked.includes(g.id);
          return (
            <button
              key={g.id}
              className="tool-btn !h-6 border border-line !text-[10.5px]"
              data-active={on}
              aria-pressed={on}
              onClick={() =>
                set({ locked: on ? [...locked, g.id] : locked.filter((x) => x !== g.id) })
              }
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <button
        className="hw-btn !min-h-[26px]"
        onClick={() => onRandomize(amount, locked)}
        data-hint="synth.random.go"
      >
        <Dices size={13} /> Randomize
      </button>
    </div>
  );
}

/**
 * The Basic view: the 8 macros (the track's SOUND knobs), Poly/Mono with glide, and a scope of
 * what the synth plays. Everything else is in Advanced.
 */
function Basic({
  track,
  patch,
  values,
  setMacro,
  set,
  glide,
}: {
  track: Track;
  patch: SynthPatch;
  values: number[];
  setMacro: (i: number, v: number) => void;
  set: (path: string, v: unknown) => void;
  glide: React.ReactNode;
}) {
  const mono = patch.voice.mode !== "poly";
  return (
    <div
      className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3"
      data-testid="synth-basic"
    >
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] justify-items-center gap-y-3"
        data-testid="synth-macros"
      >
        {patch.macros.map((m, i) => (
          <Encoder
            key={i}
            def={{
              id: `macro${i + 1}`,
              label: m.name || `Macro ${i + 1}`,
              default: patch.macros[i].value,
              format: (v) => `${Math.round(v * 100)}%`,
            }}
            value={values[i]}
            onChange={(v) => setMacro(i, v)}
            color={track.color}
            size={48}
            width={96}
            hint={soundHint(`macro${i + 1}`)}
            midiTarget={`track:${track.id}:${macroKey(i)}`}
            learnLabel={`${track.name} · ${m.name}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="segmented" data-hint="synth.voice.mode">
          <button data-active={!mono} onClick={() => set("voice.mode", "poly")}>
            Poly
          </button>
          <button data-active={mono} onClick={() => !mono && set("voice.mode", "mono")}>
            Mono
          </button>
        </div>
        {glide}
      </div>
      <div className="min-h-[80px] max-h-[220px] flex-1" data-hint="synth.scope">
        <Scope trackId={track.id} color={track.color} meter={false} className="h-full w-full" />
      </div>
    </div>
  );
}

/**
 * The macros: each one's name and where it is (the track's SOUND knob), and up to 4 targets, each
 * moved from its min to its max as the macro turns.
 */
function Macros({
  track,
  patch,
  values,
  setMacro,
  onChange,
}: {
  track: Track;
  patch: SynthPatch;
  values: number[];
  setMacro: (i: number, v: number) => void;
  onChange: (fn: (p: SynthPatch) => void, key?: string) => void;
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
              def={{
                id: `macro${i + 1}`,
                label: "",
                default: m.value,
                format: (v) => `${Math.round(v * 100)}%`,
              }}
              value={values[i]}
              onChange={(v) => setMacro(i, v)}
              color={track.color}
              size={28}
              hint={soundHint(`macro${i + 1}`)}
              midiTarget={`track:${track.id}:${macroKey(i)}`}
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

/**
 * A new target for macro `i`: the knob's whole range, shifted (and squeezed where it must be) so
 * the macro, where it is, gives the value you hear now: adding it doesn't change the sound.
 */
function newTarget(p: SynthPatch, i: number, path: string, values: number[]): MacroTarget {
  const d = paramOf(path)!;
  const at = values[i] ?? p.macros[i].value;
  const v = getPath(applyMacros(withMacroValues(p, values)), path);
  // a copy (p may be a draft) with just this target
  const probe = JSON.parse(JSON.stringify(p)) as SynthPatch;
  probe.macros = [{ name: "", value: at, targets: [{ path, min: d.min, max: d.max }] }];
  setThroughMacros(probe, path, v, d.min, d.max, [at]);
  return probe.macros[0].targets[0];
}

function TargetSelect({
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

/**
 * A section of the Advanced view, in the order the sound flows. Fold it with its title; the
 * editor remembers which are folded.
 */
function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
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

function Box({
  title,
  children,
  on,
  onToggle,
  hint,
  wide,
  clip,
}: {
  title: string;
  children: React.ReactNode;
  on?: boolean;
  onToggle?: (v: boolean) => void;
  hint?: string;
  wide?: boolean;
  /** Copy this block's settings, or paste another block's of the same kind. */
  clip?: { kind: ClipKind; data: object; paste: (data: Record<string, unknown>) => void };
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
                    data: JSON.parse(JSON.stringify(clip.data)),
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
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 px-3 py-1.5"
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
