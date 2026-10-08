import { useRef, useState, type ReactNode } from "react";
import { AudioLines, Library, Music2, Pencil } from "lucide-react";
import { focusPanel, openSampleEditor } from "../../app/openers";
import { Encoder } from "../../components/Encoder";
import { InlineEdit } from "../../components/InlineEdit";
import { PeaksCanvas } from "../../components/PeaksCanvas";
import { Playhead } from "../../components/Playhead";
import * as engine from "../../engine/engine";
import { useSamplesVersion } from "../../components/useSamplesVersion";
import { getBuffer, samplePeaks } from "../../engine/samples";
import { droppedSamples, isSampleDrag } from "../../library/drop";
import { isBuiltIn, sampleName, useLibrary } from "../../library/library";
import { MIX_PARAMS, SOUND_PARAMS, type ParamDef } from "../../model/params";
import type { Track } from "../../model/types";
import { useSelectedTrack, useStore } from "../../state/store";
import { replaceSound } from "../../state/trackActions";
import { EffectsSection } from "./EffectsSection";
import { InstrumentSection } from "./InstrumentSection";
import { MidiSection } from "./MidiSection";

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="border-b border-line px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="label">{title}</span>
        <span className="flex-1" />
        {right}
      </div>
      {children}
    </section>
  );
}

function EncoderGrid({
  track,
  defs,
  prefix,
}: {
  track: Track;
  defs: ParamDef[];
  prefix: "sound" | "mix";
}) {
  const commit = useStore((s) => s.commit);
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-y-2">
      {defs.map((def) => {
        const isVolume = prefix === "mix" && def.id === "volume";
        const key = `${prefix}.${def.id}`;
        return (
          <Encoder
            key={def.id}
            def={def}
            size={34}
            color={track.color}
            value={isVolume ? track.volume : (track.params[key] ?? def.default)}
            onChange={(v) =>
              commit((p) => {
                const t = p.tracks.find((x) => x.id === track.id);
                if (!t) return;
                if (isVolume) t.volume = v;
                else t.params[key] = v;
              }, `insp-${track.id}-${key}`)
            }
            midiTarget={isVolume ? `track:${track.id}:volume` : `track:${track.id}:${key}`}
            hint={`param.${prefix}.${def.id}`}
          />
        );
      })}
    </div>
  );
}

function SampleSection({ track }: { track: Track }) {
  useSamplesVersion();
  const record = useLibrary((s) => s.samples.find((x) => x.id === track.sampleId));
  const [hover, setHover] = useState(false);
  const [run, setRun] = useState<{ n: number; seconds: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buffer = getBuffer(track.sampleId);
  const id = track.sampleId;
  return (
    <Section
      title={track.kind === "audio" ? "Clip" : "Sample"}
      right={
        id && (
          <div className="flex gap-0.5">
            <button
              className="tool-btn !h-6 !min-w-6 !p-0"
              title="Show in library"
              data-hint="inspector.sample.show"
              onClick={() => {
                focusPanel("library");
                useLibrary.getState().set({ selectedId: id });
              }}
            >
              <Library size={12} />
            </button>
            {!isBuiltIn(id) && (
              <button
                className="tool-btn !h-6 !min-w-6 !p-0"
                title="Edit in the sample editor"
                data-hint="inspector.sample.edit"
                onClick={() => openSampleEditor(id)}
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        )
      }
    >
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
        <div className="mb-1.5 truncate text-[11.5px] text-white/85">
          {id ? sampleName(id) : "No sample: drop one here"}
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
      </div>
    </Section>
  );
}

export function InspectorPanel() {
  const track = useSelectedTrack();
  const commit = useStore((s) => s.commit);
  const index = useStore((s) => s.project.tracks.findIndex((t) => t.id === track?.id));
  if (!track)
    return (
      <div className="p-4 text-[12px] text-faint">
        Select a track to see its sound, mix and effects.
      </div>
    );
  const update = (fn: (t: Track) => void) =>
    commit((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    });
  const Icon = track.kind === "instrument" ? Music2 : track.kind === "audio" ? AudioLines : null;
  return (
    <div className="scroll-thin h-full overflow-auto" data-testid="inspector">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="h-6 w-1.5 shrink-0 rounded-sm" style={{ background: track.color }} />
        <span className="num text-[11px] text-faint">{String(index + 1).padStart(2, "0")}</span>
        <span data-hint="inspector.name" className="min-w-0 flex-1">
          <InlineEdit
            value={track.name}
            onCommit={(v) => update((t) => (t.name = v))}
            className="text-[13px] font-semibold uppercase tracking-wide"
          />
        </span>
        {Icon && <Icon size={13} className="text-dim" />}
        <span className="label">{track.kind}</span>
      </div>
      {track.kind === "instrument" ? (
        <InstrumentSection track={track} />
      ) : (
        <SampleSection track={track} />
      )}
      <Section title="Sound">
        <EncoderGrid track={track} defs={SOUND_PARAMS[track.kind]} prefix="sound" />
      </Section>
      <Section title="Mix">
        <EncoderGrid track={track} defs={MIX_PARAMS} prefix="mix" />
      </Section>
      <EffectsSection track={track} />
      <MidiSection track={track} />
    </div>
  );
}
