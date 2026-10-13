import { useRef } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { EffectEditor } from "../../components/EffectEditor";
import { addEffectItems, chainMenu } from "../../components/fxMenus";
import { contextMenu, dropdown } from "../../components/Menu";
import type { Track } from "../../model/types";
import { Section } from "./InspectorPanel";

/** The track's insert effects: add, reorder, bypass, dry/wet, parameters. */
export function EffectsSection({ track }: { track: Track }) {
  const addRef = useRef<HTMLButtonElement>(null);
  const target = { track: track.id };
  return (
    <Section
      title="Effects"
      right={
        <span className="flex items-center">
          <button
            ref={addRef}
            className="tool-btn !h-6"
            title="Add an effect"
            data-hint="inspector.effects.add"
            onClick={() => dropdown(addRef.current!, addEffectItems(target))}
            data-testid="add-effect"
          >
            <Plus size={12} /> Add
          </button>
          <button
            className="tool-btn !h-6"
            title="Copy or paste the effects"
            data-hint="inspector.effects.menu"
            data-testid="effects-menu"
            onClick={(e) => contextMenu(e, chainMenu(target, track.effects, e))}
          >
            <MoreHorizontal size={12} />
          </button>
        </span>
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
