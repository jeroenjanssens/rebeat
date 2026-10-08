/** One icon per kind of sound (D78), the same in the library, on tracks and in pickers. */
import { AudioLines, AudioWaveform, Piano, Waves, type LucideIcon } from "lucide-react";
import type { Track } from "../model/types";

export type SoundKind = "oneshot" | "loop" | "instrument" | "synth";

export const SOUND_ICONS: Record<SoundKind, LucideIcon> = {
  oneshot: AudioWaveform,
  loop: AudioLines,
  instrument: Piano,
  synth: Waves,
};

export const SOUND_KIND_LABEL: Record<SoundKind, string> = {
  oneshot: "One-shot sample",
  loop: "Loop",
  instrument: "Instrument",
  synth: "Synth",
};

/** What a track plays: drum tracks one-shots, audio tracks loops, instrument tracks by source. */
export function trackSoundKind(track: Track): SoundKind {
  if (track.kind === "drum") return "oneshot";
  if (track.kind === "audio") return "loop";
  return (track.instrument?.source ?? "synth") === "synth" ? "synth" : "instrument";
}

export function SoundIcon({ kind, size = 12 }: { kind: SoundKind; size?: number }) {
  const Icon = SOUND_ICONS[kind];
  return (
    <span title={SOUND_KIND_LABEL[kind]} className="inline-flex shrink-0" data-sound-kind={kind}>
      <Icon size={size} />
    </span>
  );
}
