import { X } from "lucide-react";
import type { Track } from "../../model/types";
import { useStore } from "../../state/store";
import { Section } from "./InspectorPanel";

/** MIDI mappings of the track's controls (learn them from any knob's right-click menu). */
export function MidiSection({ track }: { track: Track }) {
  const all = useStore((s) => s.project.midiMappings);
  const commit = useStore((s) => s.commit);
  const mine = all.filter((m) => m.target.startsWith(`track:${track.id}:`));
  if (!mine.length) return null;
  return (
    <Section title="MIDI">
      {mine.map((m) => (
        <div key={m.id} className="flex items-center gap-2 text-[11.5px]">
          <span className="num w-24 text-dim">
            {m.type === "cc" ? "CC" : "Note"} {m.number} · ch {m.channel + 1}
          </span>
          <span className="flex-1 truncate">{m.label}</span>
          <button
            className="tool-btn !h-5 !min-w-5 !p-0"
            title="Remove"
            data-hint="inspector.midi.remove"
            onClick={() =>
              commit((p) => void (p.midiMappings = p.midiMappings.filter((x) => x.id !== m.id)))
            }
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </Section>
  );
}
