import { useRef, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Encoder } from "../../components/Encoder";
import { Keyboard } from "../../components/Keyboard";
import { toast } from "../../components/Toast";
import * as engine from "../../engine/engine";
import { SYNTH_PRESETS, defaultInstrument, patchOf } from "../../engine/instruments";
import { factorySynth } from "../../library/synths";
import { saveInstrument } from "../../library/userInstruments";
import { INIT_PATCH, type Adsr, type Osc, type SynthPatch, type Wave } from "../../model/synth";
import { STEP_SIZES, type StepSize, type Track } from "../../model/types";
import { useSelectedTrack, useStore } from "../../state/store";
import { setInstrument, soundLabel } from "../../state/trackActions";
import {
  SECTIONS,
  fromKnob,
  getPath,
  knobDef,
  setPath,
  toKnob,
  type PatchParam,
} from "./patchParams";

const WAVES: [Wave, string][] = [
  ["sine", "Sine"],
  ["triangle", "Tri"],
  ["sawtooth", "Saw"],
  ["square", "Square"],
  ["pulse", "Pulse"],
];

/** Shape the selected track's synth (D81): edits a copy on the track; built-ins never change. */
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
  const edited = !!src.patch;
  const [saving, setSaving] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // the keyboard's lowest C: two octaves around the track's range
  const [low, setLow] = useState(track.category === "bass" ? 24 : 48);

  /** Change the patch: the first edit copies the factory synth onto the track. */
  const edit = (fn: (p: SynthPatch) => void, key?: string) =>
    commit((pr) => {
      const t = pr.tracks.find((x) => x.id === track.id);
      if (!t) return;
      t.instrument ??= { ...src };
      t.instrument.patch ??= structuredClone(patchOf(t.instrument));
      fn(t.instrument.patch as SynthPatch);
    }, key);

  const knob = (d: PatchParam) => (
    <Encoder
      key={d.path}
      def={knobDef(d, getPath(factory?.patch ?? INIT_PATCH, d.path))}
      value={toKnob(d, getPath(patch, d.path))}
      onChange={(k) => edit((p) => setPath(p, d.path, fromKnob(d, k)), `syn-${track.id}-${d.path}`)}
      color={track.color}
      size={34}
      hint={`synth.${d.path}`}
    />
  );

  const choice = <T extends string | number>(
    value: T,
    options: [T, string][],
    set: (v: T) => void,
    hint: string,
  ) => (
    <div className="segmented" data-hint={hint}>
      {options.map(([v, label]) => (
        <button key={String(v)} data-active={value === v} onClick={() => set(v)}>
          {label}
        </button>
      ))}
    </div>
  );

  const section = (id: string) => SECTIONS.find((s) => s.id === id)!;
  const knobs = (id: string, skip: string[] = []) =>
    section(id)
      .params.filter((d) => !skip.includes(d.path))
      .map(knob);

  const oscBox = (n: 1 | 2) => {
    const o = patch[`osc${n}`] as Osc;
    return (
      <Box title={`Oscillator ${n}`} key={n}>
        {choice(o.wave, WAVES, (w) => edit((p) => void (p[`osc${n}`].wave = w)), "synth.wave")}
        <div className="flex flex-wrap gap-1">
          {knobs(`osc${n}`, o.wave === "pulse" ? [] : [`osc${n}.width`])}
        </div>
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

      <SignalFlow patch={patch} color={track.color} />
      <div className="scroll-thin grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2 overflow-auto p-2">
        {oscBox(1)}
        {oscBox(2)}
        <Box title="Sub · noise · FM">
          <div className="flex flex-wrap gap-1">{knobs("extra")}</div>
        </Box>
        <Box title="Filter">
          <div className="flex flex-wrap gap-2">
            {choice(
              patch.filter.type,
              [
                ["lowpass", "LP"],
                ["highpass", "HP"],
                ["bandpass", "BP"],
              ],
              (v) => edit((p) => void (p.filter.type = v)),
              "synth.filter.type",
            )}
            {choice(
              patch.filter.slope,
              [
                [12, "12 dB"],
                [24, "24 dB"],
              ],
              (v) => edit((p) => void (p.filter.slope = v)),
              "synth.filter.slope",
            )}
          </div>
          <div className="flex flex-wrap gap-1">{knobs("filter")}</div>
        </Box>
        <Box title="Filter envelope">
          <EnvelopeView
            env={patch.filterEnv}
            color={track.color}
            onChange={(e, key) => edit((p) => void (p.filterEnv = e), key)}
            hint="synth.filterEnv.view"
          />
          <div className="flex flex-wrap gap-1">{knobs("filterEnv")}</div>
        </Box>
        <Box title="Amp envelope">
          <EnvelopeView
            env={patch.amp}
            color={track.color}
            onChange={(e, key) => edit((p) => void (p.amp = e), key)}
            hint="synth.amp.view"
          />
          <div className="flex flex-wrap gap-1">{knobs("amp")}</div>
        </Box>
        <Box title="Voice · output">
          <div className="flex flex-wrap items-center gap-2">
            {choice(
              patch.mono ? "mono" : "poly",
              [
                ["poly", "Poly"],
                ["mono", "Mono"],
              ],
              (v) => edit((p) => void (p.mono = v === "mono")),
              "synth.mono",
            )}
          </div>
          <div className="flex flex-wrap gap-1">{knobs("voice")}</div>
        </Box>
        <Box title="LFO">
          <div className="flex flex-wrap gap-2">
            {choice(
              patch.lfo.target,
              [
                ["pitch", "Pitch"],
                ["filter", "Filter"],
                ["amp", "Volume"],
                ["pan", "Pan"],
              ],
              (v) => edit((p) => void (p.lfo.target = v)),
              "synth.lfo.target",
            )}
            {choice(
              patch.lfo.shape,
              [
                ["sine", "∿"],
                ["triangle", "△"],
                ["square", "⊓"],
                ["sawtooth", "⩘"],
              ],
              (v) => edit((p) => void (p.lfo.shape = v)),
              "synth.lfo.shape",
            )}
            <select
              className="input !h-6"
              value={patch.lfo.sync ?? ""}
              onChange={(e) =>
                edit((p) => void (p.lfo.sync = (e.target.value || null) as StepSize | null))
              }
              data-hint="synth.lfo.sync"
            >
              <option value="">Free</option>
              {STEP_SIZES.map((s) => (
                <option key={s} value={s}>
                  Sync {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1">
            {knobs("lfo", patch.lfo.sync ? ["lfo.rate"] : [])}
          </div>
        </Box>
      </div>
      <div className="h-[74px] shrink-0 border-t border-line px-2 py-1.5">
        <Keyboard
          low={low}
          scope={root}
          onOctave={(d) => setLow((l) => Math.max(12, Math.min(84, l + 12 * d)))}
          play={(pitch, velocity) => engine.holdNote(track, pitch, velocity)}
        />
      </div>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-line bg-surface/50 p-2">
      <div className="label">{title}</div>
      {children}
    </section>
  );
}

const W = 230;
const H = 56;

/** One cycle of what the oscillators make together. */
function WavePreview({ patch, color }: { patch: SynthPatch; color: string }) {
  const wave = (o: Osc, x: number) => {
    const ph = (x * Math.pow(2, o.octave)) % 1;
    if (o.wave === "sine") return Math.sin(ph * 2 * Math.PI);
    if (o.wave === "triangle") return 1 - 4 * Math.abs(ph - 0.5);
    if (o.wave === "sawtooth") return 2 * ph - 1;
    if (o.wave === "square") return ph < 0.5 ? 1 : -1;
    return ph < o.width ? 1 : -1;
  };
  const pts: string[] = [];
  const n = 200;
  let peak = 0;
  const ys = Array.from({ length: n + 1 }, (_, i) => {
    const x = i / n;
    const y =
      patch.osc1.level * wave(patch.osc1, x) +
      patch.osc2.level * wave(patch.osc2, x) +
      patch.sub * Math.sin(x * Math.PI);
    peak = Math.max(peak, Math.abs(y));
    return y;
  });
  ys.forEach((y, i) => pts.push(`${(i / n) * W},${H / 2 - (y / (peak || 1)) * (H / 2 - 3)}`));
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

/** An ADSR shape with draggable points: attack, decay/sustain, release. */
function EnvelopeView({
  env,
  color,
  onChange,
  hint,
}: {
  env: Adsr;
  color: string;
  onChange: (e: Adsr, key: string) => void;
  hint: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ point: "a" | "d" | "r"; key: string } | null>(null);
  // times drawn on a square-root scale, so short and long envelopes both fit
  const seg = W / 4;
  const tx = (t: number) => Math.sqrt(Math.min(t, 10) / 10) * seg;
  const fromX = (x: number) => Math.max(0.001, Math.pow(Math.max(0, x) / seg, 2) * 10);
  const a = tx(env.attack);
  const d = a + tx(env.decay);
  const s = H - 4 - env.sustain * (H - 8);
  const hold = d + seg * 0.6;
  const r = hold + tx(env.release);
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    const next = { ...env };
    if (drag.current.point === "a") next.attack = fromX(x);
    if (drag.current.point === "d") {
      next.decay = fromX(x - a);
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
        points={`0,${H - 4} ${a},4 ${d},${s} ${hold},${s} ${r},${H - 4}`}
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

/** The path the sound takes, left to right; the envelopes and the LFO steer it. */
function SignalFlow({ patch, color }: { patch: SynthPatch; color: string }) {
  const sources = [
    "Osc 1",
    patch.osc2.level > 0 && "Osc 2",
    patch.sub > 0 && "Sub",
    patch.noise > 0 && "Noise",
  ].filter(Boolean);
  const step = (label: string, sub?: string) => (
    <span className="flex flex-col items-center rounded border border-line bg-surface px-2 py-0.5">
      <span className="text-[11px] text-ink">{label}</span>
      {sub && <span className="text-[9.5px] text-faint">{sub}</span>}
    </span>
  );
  const arrow = <span className="text-faint">→</span>;
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5"
      data-hint="synth.flow"
    >
      <div className="w-[140px]">
        <WavePreview patch={patch} color={color} />
      </div>
      {step(sources.join(" + "), patch.fm.index > 0 ? "with FM" : undefined)}
      {arrow}
      {step("Filter", "filter envelope")}
      {arrow}
      {step("Amp", "amp envelope")}
      {arrow}
      {step(patch.drive > 0.01 ? "Drive · out" : "Out")}
      {patch.lfo.depth > 0 && (
        <span className="text-[10.5px] text-faint">
          · LFO → {patch.lfo.target === "amp" ? "volume" : patch.lfo.target}
        </span>
      )}
    </div>
  );
}
