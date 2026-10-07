import { useState } from "react";
import { X } from "lucide-react";
import { Encoder } from "../components/Encoder";
import { euclid } from "../model/project";
import { applyEuclid, laneLen } from "../state/actions";
import type { Track } from "../model/types";
import { useSelectedTrack, useStore } from "../state/store";

/** Euclidean rhythm generator for the selected track, opened by the EUCLID button. */
export function EuclidPopover() {
  const open = useStore((s) => s.euclidOpen);
  const track = useSelectedTrack();
  if (!open || track.kind === "audio") return null;
  return <EuclidEditor key={track.id} track={track} />;
}

function EuclidEditor({ track }: { track: Track }) {
  const setUi = useStore((s) => s.setUi);
  const [pulses, setPulses] = useState(5);
  const [length, setLength] = useState(() => laneLen(track.id));
  const [rotation, setRotation] = useState(0);

  const update = (p: number, l: number, r: number) => {
    const pp = Math.min(p, l);
    setPulses(pp);
    setLength(l);
    setRotation(r % l);
    applyEuclid(track.id, pp, l, r % l);
  };
  const hits = euclid(Math.min(pulses, length), length, rotation);

  return (
    <div className="absolute bottom-16 right-4 z-30 w-[300px] rounded-lg border border-line-strong bg-raised p-3 shadow-2xl">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-sm" style={{ background: track.color }} />
        <span className="label !text-ink">Euclid · {track.name}</span>
        <button
          className="tool-btn ml-auto !h-6 !min-w-6 !p-0"
          onClick={() => setUi({ euclidOpen: false })}
        >
          <X size={13} />
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-[3px]">
        {hits.map((on, i) => (
          <div
            key={i}
            className="h-3.5 w-3.5 rounded-[3px]"
            style={{
              background: on
                ? track.color
                : `color-mix(in oklab, ${track.color} 16%, var(--pad-bg))`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-around">
        <Encoder
          def={{
            id: "pulses",
            label: "Pulses",
            default: 5 / 32,
            steps: 33,
            format: (v) => `${Math.round(v * 32)}`,
          }}
          value={pulses / 32}
          onChange={(v) => update(Math.round(v * 32), length, rotation)}
          color={track.color}
        />
        <Encoder
          def={{
            id: "steps",
            label: "Steps",
            default: 15 / 63,
            steps: 64,
            format: (v) => `${Math.round(v * 63) + 1}`,
          }}
          value={(length - 1) / 63}
          onChange={(v) => update(pulses, Math.round(v * 63) + 1, rotation)}
          color={track.color}
        />
        <Encoder
          def={{
            id: "rotate",
            label: "Rotate",
            default: 0,
            steps: 32,
            format: (v) => `${Math.round(v * 31)}`,
          }}
          value={rotation / 31}
          onChange={(v) => update(pulses, length, Math.round(v * 31))}
          color={track.color}
        />
      </div>
    </div>
  );
}
