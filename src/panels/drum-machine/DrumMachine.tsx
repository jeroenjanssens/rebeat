import { useRef } from "react";
import { useEditPattern, useStore } from "../../state/store";
import { EncoderStrip } from "./EncoderStrip";
import { EuclidPopover } from "./EuclidPopover";
import { FunctionBar } from "./FunctionBar";
import { HeaderBar } from "./HeaderBar";
import { geometry, useSizeClass } from "./layout";
import { PadView } from "./PadView";
import { PageStrip } from "./PageStrip";
import { TrackList } from "./TrackList";

/** The drum machine panel: header, page strip, display + encoders, tracks or pads, function buttons. */
export function DrumMachine() {
  const ref = useRef<HTMLDivElement>(null);
  const view = useStore((s) => s.view);
  const zoom = useStore((s) => s.zoom);
  const pattern = useEditPattern();
  const { sizeClass, width } = useSizeClass(ref);
  const geo = geometry(width, pattern, sizeClass, zoom);

  return (
    <div
      ref={ref}
      className="@container relative flex h-full min-h-0 flex-col bg-panel"
      data-size={sizeClass}
    >
      <HeaderBar sizeClass={sizeClass} />
      <PageStrip sizeClass={sizeClass} />
      <EncoderStrip sizeClass={sizeClass} />
      {view === "grid" ? <TrackList geo={geo} /> : <PadView sizeClass={sizeClass} width={width} />}
      <FunctionBar sizeClass={sizeClass} />
      <EuclidPopover />
    </div>
  );
}
