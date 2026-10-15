/**
 * The Basic view of the synth editor: macros, voice mode and scope.
 */
import { Encoder } from "../../components/Encoder";
import { Scope } from "../../components/Scope";
import { macroKey, soundHint } from "../../library/synthTrack";
import type { SynthPatch } from "../../model/synth";
import type { Track } from "../../model/types";
import { macroDef } from "./matrix";

/**
 * The Basic view: the 8 macros (the track's SOUND knobs), Poly/Mono with glide, and a scope of
 * what the synth plays. Everything else is in Advanced.
 */
export function Basic({
  track,
  patch,
  values,
  setMacro,
  set,
  glide,
  learn,
}: {
  track: Track;
  patch: SynthPatch;
  values: number[];
  setMacro: (i: number, v: number) => void;
  set: (path: string, v: unknown) => void;
  glide: React.ReactNode;
  /** MIDI learn (tracks only: a mapping needs one) and the scope of the track. */
  learn: boolean;
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
            def={macroDef(m, i)}
            value={values[i]}
            onChange={(v) => setMacro(i, v)}
            color={track.color}
            size={48}
            width={96}
            hint={soundHint(`macro${i + 1}`)}
            midiTarget={learn ? `track:${track.id}:${macroKey(i)}` : undefined}
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
        {learn && (
          <Scope trackId={track.id} color={track.color} meter={false} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}
