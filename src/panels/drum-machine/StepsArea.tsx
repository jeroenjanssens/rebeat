import type { StepLane, Track } from "../../model/types";
import type { Geometry } from "./layout";
import { StepPad } from "./StepPad";

interface Props {
  track: Track;
  lane: StepLane;
  length: number;
  geo: Geometry;
  selected: Set<number>;
}

/** The pads of one track, grouped by beat with a divider at each bar. */
export function StepsArea({ track, lane, length, geo, selected }: Props) {
  const instrument = track.kind === "instrument";

  // note continuations (ties) for instrument tracks
  const tie = new Set<number>();
  if (instrument) {
    for (let i = 0; i < length; i++) {
      const s = lane.steps[i];
      if (!s.on || !s.length) continue;
      for (let k = 1; k < s.length && i + k < length && !lane.steps[i + k].on; k++) tie.add(i + k);
    }
  }

  return (
    <div
      className="flex items-center"
      style={{ gap: geo.beatGap, ["--tie-gap" as string]: `${geo.gap}px` }}
    >
      {geo.groups.map((g, gi) => (
        <div key={gi} className="flex items-center" style={{ gap: geo.beatGap }}>
          {g.barStart && <div className="w-px self-stretch bg-line-strong" />}
          <div className="flex items-center" style={{ gap: geo.gap }}>
            {g.indices.map((i) => (
              <StepPad
                key={i}
                trackId={track.id}
                index={i}
                step={lane.steps[i]}
                color={track.color}
                beyond={i >= length}
                tie={tie.has(i)}
                selected={selected.has(i)}
                velBar={geo.sizeClass === "large"}
                instrument={instrument}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
