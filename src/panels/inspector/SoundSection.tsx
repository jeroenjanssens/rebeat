/**
 * The Inspector's Sound section, the same for every step track (D97): how it plays (Hits, Notes,
 * Clip), what plays (a sample, a synth or a sampled instrument) and that sound's own settings,
 * with Edit and Save to Your sounds. Notes mode adds transpose and the arpeggiator (NotesSection).
 */
import { useEffect, useRef, useState } from "react";
import { Library, Pencil } from "lucide-react";
import { focusPanel, openInBeatbox, openSampleEditor, openSynthEditor } from "../../app/openers";
import { DragValue } from "../../components/DragValue";
import { PeaksCanvas } from "../../components/PeaksCanvas";
import { Playhead } from "../../components/Playhead";
import { SoundIcon, trackSoundKind } from "../../components/soundIcons";
import { toast } from "../../components/Toast";
import { useSamplesVersion } from "../../components/useSamplesVersion";
import * as engine from "../../engine/engine";
import { instrumentState } from "../../engine/engine";
import { SAMPLED_INSTRUMENTS, SYNTH_PRESETS } from "../../engine/instruments";
import { getBuffer, samplePeaks } from "../../engine/samples";
import { droppedSamples, isSampleDrag } from "../../library/drop";
import { isBuiltIn, loadSample, sampleName, useLibrary } from "../../library/library";
import { defaultSynth } from "../../library/synthTrack";
import { saveInstrument } from "../../library/userInstruments";
import { noteName } from "../../model/notes";
import { setMode } from "../../model/project";
import { canClip, hitNoteOf, player, sampleOf } from "../../model/tracks";
import {
  soundFamily,
  type Arpeggiator,
  type Sound,
  type SoundFamily,
  type StepSize,
  type Track,
  type TrackMode,
} from "../../model/types";
import { useStore } from "../../state/store";
import { replaceSound, setSound, soundLabel } from "../../state/trackActions";
import { Section } from "./InspectorPanel";

const MODES: [TrackMode, string][] = [
  ["hits", "Hits"],
  ["notes", "Notes"],
  ["clip", "Clip"],
];

const FAMILIES: [SoundFamily, string][] = [
  ["sample", "Sample"],
  ["synth", "Synth"],
  ["instrument", "Sampled instrument"],
];

const NOTES = Array.from({ length: 61 }, (_, i) => 24 + i);

function useInstrumentState(trackId: string) {
  const [state, setState] = useState(() => instrumentState(trackId));
  useEffect(() => {
    const t = setInterval(() => setState(instrumentState(trackId)), 400);
    return () => clearInterval(t);
  }, [trackId]);
  return state;
}

export function SoundSection({ track }: { track: Track }) {
  const commit = useStore((s) => s.commit);
  const state = useInstrumentState(track.id);
  const src = track.sound;
  const family: SoundFamily = src ? soundFamily(src) : track.mode === "notes" ? "synth" : "sample";
  const update = (fn: (t: Track) => void) =>
    commit((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    });
  // switching the family starts on a sound of that family
  const pickFamily = (f: SoundFamily) => {
    if (f === family) return;
    const sample = sampleOf(track);
    if (f === "synth") setSound(track.id, defaultSynth(track));
    else if (f === "instrument") setSound(track.id, { source: "smplr", preset: "piano" });
    else if (sample) replaceSound(track.id, sample);
    else setSound(track.id, { source: "sample", sampleId: "kit:808:cowbell" });
  };
  const loading = src?.source === "smplr" || src?.source === "sf2";

  return (
    <Section
      title="Sound"
      right={
        loading && (
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
      <div className="flex flex-col gap-2" data-testid="sound-section">
        <div className="flex items-center gap-2">
          <span className="label w-[38px] shrink-0">Play</span>
          <div className="segmented" data-hint="inspector.mode" data-testid="mode-switch">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                data-active={track.mode === m}
                disabled={m === "clip" && !canClip(src)}
                title={
                  m === "clip" && !canClip(src)
                    ? "Clip mode plays samples only"
                    : `Play as ${label}`
                }
                onClick={() => commit((p) => setMode(p, track.id, m))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {track.mode !== "clip" && (
          <div className="flex items-center gap-2">
            <div
              className="segmented"
              data-hint="inspector.sound.family"
              data-testid="sound-family"
            >
              {FAMILIES.map(([f, label]) => (
                <button key={f} data-active={family === f} onClick={() => pickFamily(f)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {family === "sample" && <SampleBox track={track} />}
        {family === "synth" && <SynthBox track={track} />}
        {family === "instrument" && src && <InstrumentBox track={track} src={src} />}

        {player(track) === "voice" && track.mode === "hits" && (
          <label className="flex items-center gap-2">
            <span className="label">Hit note</span>
            <select
              className="input !h-6"
              value={hitNoteOf(track)}
              onChange={(e) => update((t) => (t.hitNote = Number(e.target.value)))}
              data-hint="inspector.sound.hitnote"
              data-testid="hit-note"
            >
              {NOTES.map((m) => (
                <option key={m} value={m}>
                  {noteName(m, true)}
                </option>
              ))}
            </select>
          </label>
        )}

        {(src || track.mode === "notes") && (
          <button
            className="tool-btn self-start border border-line"
            data-hint="inspector.sound.save"
            data-testid="save-to-your-sounds"
            onClick={() => {
              const name = soundLabel(track) || track.name;
              void saveInstrument(track, name).then((entry) => {
                setSound(track.id, entry.source);
                toast(`Saved “${name}” to Your sounds`);
              });
            }}
          >
            Save to Your sounds
          </button>
        )}
        {track.mode === "clip" && sampleOf(track) && (
          <button
            className="tool-btn self-start border border-line"
            data-hint="inspector.sound.beatbox"
            onClick={() => openInBeatbox(sampleOf(track)!, track.name)}
          >
            Open in Beatbox
          </button>
        )}
      </div>
    </Section>
  );
}

/** A sample: drop another on it, hear it, open it in the library or the sample editor. */
function SampleBox({ track }: { track: Track }) {
  useSamplesVersion();
  const id = sampleOf(track);
  const record = useLibrary((s) => s.samples.find((x) => x.id === id));
  const [hover, setHover] = useState(false);
  const [run, setRun] = useState<{ n: number; seconds: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buffer = getBuffer(id);
  return (
    <div
      ref={ref}
      className="rounded-md border bg-display p-2"
      style={{ borderColor: hover ? "var(--accent)" : "var(--border)" }}
      data-hint="inspector.sample"
      onDragOver={(e) => {
        if (!isSampleDrag(e.dataTransfer)) return;
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setHover(false);
        const [sid] = (await droppedSamples(e.dataTransfer)).ids;
        if (sid) replaceSound(track.id, sid);
      }}
      title="Drop a sample here to replace the sound"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-white/50">
          <SoundIcon kind={trackSoundKind(track)} size={11} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/85">
          {id ? sampleName(id) : "No sample: drop one here"}
        </span>
        {id && (
          <>
            <button
              className="tool-btn !h-5 !min-w-5 !p-0"
              title="Show in library"
              data-hint="inspector.sample.show"
              onClick={() => {
                focusPanel("library");
                useLibrary.getState().set({ selectedId: id });
              }}
            >
              <Library size={11} />
            </button>
            {!isBuiltIn(id) && (
              <button
                className="tool-btn !h-5 !min-w-5 !p-0"
                title="Edit in the sample editor"
                data-hint="inspector.sample.edit"
                onClick={() => openSampleEditor(id)}
              >
                <Pencil size={11} />
              </button>
            )}
          </>
        )}
      </div>
      <div
        className="relative cursor-pointer"
        onClick={() => setRun({ n: performance.now(), seconds: engine.playOnce(track) })}
        title="Click to hear it"
        data-testid="inspector-wave"
      >
        <PeaksCanvas peaks={samplePeaks(id, 160)} color={track.color} className="h-10 w-full" />
        <Playhead run={run} />
      </div>
      <div className="num mt-1.5 flex gap-3 text-[10px] text-white/45">
        {buffer && <span>{buffer.duration.toFixed(2)} s</span>}
        {buffer && <span>{(buffer.sampleRate / 1000).toFixed(1)} kHz</span>}
        {buffer && <span>{buffer.numberOfChannels === 1 ? "mono" : "stereo"}</span>}
        {record?.bpm && <span>{record.bpm} BPM</span>}
      </div>
      {track.mode === "notes" && id && (
        <label className="mt-1.5 flex items-center gap-2">
          <span className="label !text-white/50">Root note</span>
          <select
            className="input !h-6"
            value={track.sound?.rootNote ?? 60}
            onChange={(e) =>
              setSound(track.id, { ...track.sound!, rootNote: Number(e.target.value) })
            }
            data-hint="inspector.instrument.sampler.rootnote"
          >
            {NOTES.map((m) => (
              <option key={m} value={m}>
                {noteName(m, true)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function SynthBox({ track }: { track: Track }) {
  const preset = track.sound?.source === "synth" ? track.sound.preset : undefined;
  return (
    <div className="flex flex-col gap-2">
      <select
        className="input"
        value={preset ?? defaultSynth(track).preset}
        onChange={(e) => setSound(track.id, { source: "synth", preset: e.target.value })}
        data-testid="synth-preset"
        data-hint="inspector.instrument.synth.preset"
      >
        {track.sound?.name && <option value={preset}>{track.sound.name}</option>}
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
      <button
        className="tool-btn self-start border border-line"
        onClick={() => openSynthEditor(track.id)}
        data-hint="inspector.instrument.synth.edit"
        data-testid="edit-synth"
      >
        Edit synth…
      </button>
    </div>
  );
}

/** A sampled instrument: streamed ones from the list; SoundFonts and multi-samples by name. */
function InstrumentBox({ track, src }: { track: Track; src: Sound }) {
  if (src.source !== "smplr")
    return (
      <div className="rounded-md border border-line px-2 py-1.5 text-[11.5px]">
        {src.name ?? (src.source === "sf2" ? "SoundFont" : "Multi-sample")}
        <div className="text-[10px] text-faint">
          {src.source === "sf2"
            ? "An instrument from a SoundFont you imported."
            : `${src.zones?.length ?? 0} samples across the keyboard.`}
        </div>
      </div>
    );
  return (
    <>
      <select
        className="input"
        value={src.preset}
        onChange={(e) => setSound(track.id, { source: "smplr", preset: e.target.value })}
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
  );
}

const ARP_RATES: StepSize[] = ["1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"];
const DEFAULT_ARP: Arpeggiator = { on: false, mode: "up", rate: "1/16", octaves: 1, gate: 0.6 };

/** Notes mode: transpose and the arpeggiator. */
export function NotesSection({ track }: { track: Track }) {
  const commit = useStore((s) => s.commit);
  const arp = track.arp ?? DEFAULT_ARP;
  const update = (fn: (t: Track) => void, key?: string) =>
    commit((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    }, key);
  const setArp = (patch: Partial<Arpeggiator>) =>
    update((t) => void (t.arp = { ...(t.arp ?? DEFAULT_ARP), ...patch }));
  // a sample dropped while it isn't loaded yet
  const sample = sampleOf(track);
  useEffect(() => {
    if (sample) void loadSample(sample);
  }, [sample]);
  return (
    <Section title="Notes">
      <div className="flex flex-col gap-2">
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
