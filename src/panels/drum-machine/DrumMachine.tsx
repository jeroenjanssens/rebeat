import { useRef } from "react";
import { useEditPattern, useStore } from "../../state/store";
import { useSettings } from "../../state/settings";
import { EncoderStrip } from "./EncoderStrip";
import { EuclidPopover } from "./EuclidPopover";
import { FunctionBar } from "./FunctionBar";
import { HeaderBar } from "./HeaderBar";
import { geometry, useSizeClass } from "./layout";
import { PadView } from "./PadView";
import { SectionBar, SongStrip } from "./SongStrip";
import { TrackList } from "./TrackList";

/** The drum machine panel: header, song strip, display + encoders, tracks or pads, function buttons. */
export function DrumMachine() {
  const ref = useRef<HTMLDivElement>(null);
  const view = useStore((s) => s.view);
  const zoom = useSettings((s) => s.zoom);
  const hasTracks = useStore((s) => s.project.tracks.length > 0);
  const pattern = useEditPattern();
  const { sizeClass, width } = useSizeClass(ref);
  const geo = geometry(width, pattern, sizeClass, zoom);

  return (
    <div
      ref={ref}
      className="@container relative flex h-full min-h-0 flex-col bg-panel"
      data-size={sizeClass}
    >
      <HeaderBar sizeClass={sizeClass} effectiveZoom={geo.effectiveZoom} />
      <SongStrip sizeClass={sizeClass} />
      <SectionBar />
      {hasTracks && <EncoderStrip sizeClass={sizeClass} />}
      {view === "grid" || !hasTracks ? (
        <TrackList geo={geo} />
      ) : (
        <PadView sizeClass={sizeClass} width={width} />
      )}
      <FunctionBar sizeClass={sizeClass} />
      <EuclidPopover />
    </div>
  );
}
