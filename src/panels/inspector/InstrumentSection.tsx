import { useEffect, useState } from "react";
import { DragValue } from "../../components/DragValue";
import { instrumentState } from "../../engine/engine";
import { SAMPLED_INSTRUMENTS, SYNTH_PRESETS, defaultInstrument } from "../../engine/instruments";
import { droppedSamples } from "../../library/drop";
import { loadSample, sampleName } from "../../library/library";
import { noteName } from "../../model/notes";
import type { Arpeggiator, InstrumentSource, StepSize, Track } from "../../model/types";
import { useStore } from "../../state/store";
import { setInstrument } from "../../state/trackActions";
import { Section } from "./InspectorPanel";

const ARP_RATES: StepSize[] = ["1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"];
const DEFAULT_ARP: Arpeggiator = { on: false, mode: "up", rate: "1/16", octaves: 1, gate: 0.6 };

function useInstrumentState(trackId: string) {
  const [state, setState] = useState(() => instrumentState(trackId));
  useEffect(() => {
    const t = setInterval(() => setState(instrumentState(trackId)), 400);
    return () => clearInterval(t);
  }, [trackId]);
  return state;
}

/** The instrument track's sound source, transpose and arpeggiator. */
export function InstrumentSection({ track }: { track: Track }) {
  const commit = useStore((s) => s.commit);
  const src = track.instrument ?? defaultInstrument(track);
  const state = useInstrumentState(track.id);
  const [hover, setHover] = useState(false);
  const arp = track.arp ?? DEFAULT_ARP;

  const update = (fn: (t: Track) => void, key?: string) =>
    commit((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    }, key);
  const setSource = (next: InstrumentSource) => setInstrument(track.id, next);
  const setArp = (patch: Partial<Arpeggiator>) =>
    update((t) => void (t.arp = { ...(t.arp ?? DEFAULT_ARP), ...patch }));

  return (
    <Section
      title="Instrument"
      right={
        src.source === "smplr" && (
          <span
            className="text-[10px]"
            style={{
              color:
                state === "error"
                  ? "#ef4444"
                  : state === "loading"
                    ? "var(--lit)"
                    : "var(--text-faint)",
            }}
          >
            {state === "loading"
              ? "Loading samples…"
              : state === "error"
                ? "Couldn't load"
                : "Ready"}
          </span>
        )
      }
    >
      <div className="flex flex-col gap-2">
        <div className="segmented self-start" data-hint="inspector.instrument.source">
          {(
            [
              ["synth", "Synth"],
              ["sampler", "Sampler"],
              ["smplr", "Instrument"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              data-active={src.source === id}
              onClick={() =>
                setSource(
                  id === "synth"
                    ? defaultInstrument(track)
                    : id === "smplr"
                      ? { source: "smplr", preset: "piano" }
                      : {
                          source: "sampler",
                          preset: "sampler",
                          sampleId: src.sampleId ?? track.sampleId,
                          rootNote: src.rootNote ?? 60,
                        },
                )
              }
            >
              {label}
            </button>
          ))}
        </div>

        {src.source === "synth" && (
          <select
            className="input"
            value={src.preset}
            onChange={(e) => setSource({ source: "synth", preset: e.target.value })}
            data-testid="synth-preset"
            data-hint="inspector.instrument.synth.preset"
          >
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
        )}

        {src.source === "smplr" && (
          <>
            <select
              className="input"
              value={src.preset}
              onChange={(e) => setSource({ source: "smplr", preset: e.target.value })}
              data-hint="inspector.instrument.smplr.preset"
            >
              {[...new Set(SAMPLED_INSTRUMENTS.map((p) => `${p.family} · ${p.group}`))].map((g) => (
                <optgroup key={g} label={g}>
                  {SAMPLED_INSTRUMENTS.filter((p) => `${p.family} · ${p.group}` === g).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-[10px] leading-snug text-faint">
              Sampled instruments by smplr, streamed the first time you use them.
            </p>
          </>
        )}

        {src.source === "sampler" && (
          <div
            className="rounded-md border border-dashed p-2 text-[11.5px]"
            style={{ borderColor: hover ? "var(--accent)" : "var(--border-strong)" }}
            data-hint="inspector.instrument.sampler.drop"
            onDragOver={(e) => {
              e.preventDefault();
              setHover(true);
            }}
            onDragLeave={() => setHover(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setHover(false);
              const [id] = (await droppedSamples(e.dataTransfer)).ids;
              if (!id) return;
              await loadSample(id);
              setSource({ ...src, sampleId: id });
            }}
          >
            <div className="mb-1.5 truncate">
              {src.sampleId
                ? sampleName(src.sampleId)
                : "Drop a sample here to play it across the keyboard"}
            </div>
            <label className="flex items-center gap-2">
              <span className="label">Root note</span>
              <select
                className="input !h-6"
                value={src.rootNote ?? 60}
                onChange={(e) => setSource({ ...src, rootNote: Number(e.target.value) })}
                data-hint="inspector.instrument.sampler.rootnote"
              >
                {Array.from({ length: 61 }, (_, i) => 24 + i).map((m) => (
                  <option key={m} value={m}>
                    {noteName(m, true)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span data-hint="inspector.instrument.transpose">
            <DragValue
              label="Transpose"
              value={track.transpose ?? 0}
              min={-24}
              max={24}
              defaultValue={0}
              format={(v) => `${v > 0 ? "+" : ""}${v} st`}
              onChange={(v) => update((t) => (t.transpose = v), `transpose-${track.id}`)}
            />
          </span>
        </div>

        <div className="rounded-md border border-line p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="label">Arpeggiator</span>
            <button
              className="tool-btn !h-5 ml-auto border border-line !text-[10px]"
              data-active={arp.on}
              onClick={() => setArp({ on: !arp.on })}
              data-testid="arp-toggle"
              data-hint="inspector.arp.toggle"
            >
              {arp.on ? "On" : "Off"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" style={{ opacity: arp.on ? 1 : 0.5 }}>
            <select
              className="input !h-6"
              value={arp.mode}
              onChange={(e) => setArp({ mode: e.target.value as Arpeggiator["mode"] })}
              data-hint="inspector.arp.mode"
            >
              {["up", "down", "updown", "random", "played"].map((m) => (
                <option key={m} value={m}>
                  {m === "updown" ? "Up/down" : m[0].toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
            <select
              className="input !h-6"
              value={arp.rate}
              onChange={(e) => setArp({ rate: e.target.value as StepSize })}
              data-hint="inspector.arp.rate"
            >
              {ARP_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              className="input !h-6"
              value={arp.octaves}
              onChange={(e) => setArp({ octaves: Number(e.target.value) })}
              data-hint="inspector.arp.octaves"
            >
              {[1, 2, 3].map((o) => (
                <option key={o} value={o}>
                  {o} oct
                </option>
              ))}
            </select>
            <span data-hint="inspector.arp.gate">
              <DragValue
                label="Gate"
                value={Math.round(arp.gate * 100)}
                min={5}
                max={100}
                step={5}
                defaultValue={60}
                format={(v) => `${v}%`}
                onChange={(v) => setArp({ gate: v / 100 })}
              />
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}
