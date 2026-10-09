import type { ReactNode } from "react";
import { Encoder } from "../../components/Encoder";
import { InlineEdit } from "../../components/InlineEdit";
import { MIX_PARAMS, type ParamDef } from "../../model/params";
import { soundDefs, soundHint } from "../../library/synthTrack";
import type { Track } from "../../model/types";
import { useSelectedTrack, useStore } from "../../state/store";
import { EffectsSection } from "./EffectsSection";
import { NotesSection, SoundSection } from "./SoundSection";
import { MODE_LABEL, ModeIcon, SoundIcon, trackSoundKind } from "../../components/soundIcons";
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
            hint={prefix === "sound" ? soundHint(def.id) : `param.${prefix}.${def.id}`}
          />
        );
      })}
    </div>
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
        <span className="text-dim">
          <SoundIcon kind={trackSoundKind(track)} size={13} />
        </span>
        <span className="label flex items-center gap-1">
          <ModeIcon mode={track.mode} />
          {MODE_LABEL[track.mode]}
        </span>
      </div>
      <SoundSection track={track} />
      {track.mode === "notes" && <NotesSection track={track} />}
      <Section title="Sound knobs">
        <EncoderGrid track={track} defs={soundDefs(track)} prefix="sound" />
      </Section>
      <Section title="Mix">
        <EncoderGrid track={track} defs={MIX_PARAMS} prefix="mix" />
      </Section>
      <EffectsSection track={track} />
      <MidiSection track={track} />
    </div>
  );
}
