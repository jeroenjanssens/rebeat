import type { Track } from "../../model/types";
import { Section } from "./InspectorPanel";

/** The instrument track's sound source (presets and samplers arrive in Phase 5b). */
export function InstrumentSection({ track }: { track: Track }) {
  return (
    <Section title="Instrument">
      <div className="text-[11.5px] text-dim">{track.source}</div>
    </Section>
  );
}
