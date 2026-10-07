import type { Track } from "../../model/types";
import { Section } from "./InspectorPanel";

/** The track's insert effects (editable chain arrives with the effect factory, Phase 5). */
export function EffectsSection({ track }: { track: Track }) {
  return (
    <Section title="Effects">
      <div className="text-[11.5px] text-dim">
        {track.effects.length ? track.effects.map((f) => f.name).join(" → ") : "No effects"}
      </div>
    </Section>
  );
}
