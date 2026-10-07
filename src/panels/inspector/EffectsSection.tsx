import { useRef } from "react";
import { Plus } from "lucide-react";
import { EffectEditor } from "../../components/EffectEditor";
import { dropdown } from "../../components/Menu";
import { EFFECT_TYPES } from "../../model/params";
import type { Track } from "../../model/types";
import { addEffect } from "../../state/effectActions";
import { Section } from "./InspectorPanel";

/** The track's insert effects: add, reorder, bypass, dry/wet, parameters. */
export function EffectsSection({ track }: { track: Track }) {
  const addRef = useRef<HTMLButtonElement>(null);
  const target = { track: track.id };
  return (
    <Section
      title="Effects"
      right={
        <button
          ref={addRef}
          className="tool-btn !h-6"
          title="Add an effect"
          data-hint="inspector.effects.add"
          onClick={() =>
            dropdown(
              addRef.current!,
              EFFECT_TYPES.filter((t) => t !== "Limiter").map((t) => ({
                label: t,
                onSelect: () => addEffect(target, t),
              })),
            )
          }
          data-testid="add-effect"
        >
          <Plus size={12} /> Add
        </button>
      }
    >
      <div className="flex flex-col gap-1.5">
        {track.effects.length === 0 && (
          <div className="text-[11.5px] text-faint">
            No effects. Sends to the reverb and delay buses are in Mix.
          </div>
        )}
        {track.effects.map((fx, i) => (
          <EffectEditor
            key={fx.id ?? i}
            target={target}
            effect={fx}
            index={i}
            count={track.effects.length}
            color={track.color}
            midiPrefix={`track:${track.id}:fx`}
          />
        ))}
      </div>
    </Section>
  );
}
