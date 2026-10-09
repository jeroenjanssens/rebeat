/**
 * The icons of sounds and modes (D96): one per sound family (a sample as a one-shot or a loop, a
 * synth, a sampled instrument), the places they come from (kits, Your sounds, recordings) and one
 * per mode. The same everywhere: the library, step tracks, pickers and the Inspector.
 */
import {
  AudioWaveform,
  Cable,
  CircleDot,
  Drum,
  Mic,
  Music,
  Piano,
  RectangleHorizontal,
  Repeat,
  User,
  type LucideIcon,
} from "lucide-react";
import type { Sound, Track, TrackMode } from "../model/types";

export type SoundKind = "oneshot" | "loop" | "synth" | "instrument";

export const SOUND_ICONS: Record<SoundKind, LucideIcon> = {
  oneshot: AudioWaveform,
  loop: Repeat,
  // patch cables: not a wave, so a synth can't be mistaken for a sample (nor for the mixer)
  synth: Cable,
  instrument: Piano,
};

export const SOUND_KIND_LABEL: Record<SoundKind, string> = {
  oneshot: "One-shot sample",
  loop: "Loop",
  synth: "Synth",
  instrument: "Sampled instrument",
};

/** Where sounds come from, in the library. */
export const PLACE_ICONS = { kit: Drum, yours: User, recording: Mic };

export const MODE_ICONS: Record<TrackMode, LucideIcon> = {
  hits: CircleDot,
  notes: Music,
  clip: RectangleHorizontal,
};

export const MODE_LABEL: Record<TrackMode, string> = {
  hits: "Hits",
  notes: "Notes",
  clip: "Clip",
};

/** What a sound is (a library sound or a step track's), for its icon. */
export function soundKind(s: Sound | undefined, loop = false): SoundKind {
  const src = s?.source ?? "sample";
  if (src === "sample") return loop ? "loop" : "oneshot";
  return src === "synth" ? "synth" : "instrument";
}

/** What a track plays: a sample (a loop in Clip mode, else a one-shot), a synth or an instrument. */
export function trackSoundKind(track: Track): SoundKind {
  if (!track.sound && track.mode === "notes") return "synth";
  return soundKind(track.sound, track.mode === "clip");
}

export function SoundIcon({ kind, size = 12 }: { kind: SoundKind; size?: number }) {
  const Icon = SOUND_ICONS[kind];
  return (
    <span title={SOUND_KIND_LABEL[kind]} className="inline-flex shrink-0" data-sound-kind={kind}>
      <Icon size={size} />
    </span>
  );
}

export function ModeIcon({ mode, size = 11 }: { mode: TrackMode; size?: number }) {
  const Icon = MODE_ICONS[mode];
  return (
    <span title={`Plays ${MODE_LABEL[mode]}`} className="inline-flex shrink-0" data-mode={mode}>
      <Icon size={size} />
    </span>
  );
}
