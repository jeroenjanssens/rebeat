import type { FC } from "react";
import {
  AudioWaveform,
  Drum,
  Gauge,
  Library,
  type LucideIcon,
  Piano,
  SlidersHorizontal,
  SlidersVertical,
  Activity,
} from "lucide-react";
import { DrumMachine } from "../panels/drum-machine/DrumMachine";
import { InspectorPanel } from "../panels/inspector/InspectorPanel";
import { LibraryPanel } from "../panels/library/LibraryPanel";
import { MasterScopePanel } from "../panels/master-scope/MasterScopePanel";
import { MixerPanel } from "../panels/mixer/MixerPanel";

export interface PanelProps {
  params: Record<string, unknown>;
}

export interface PanelDef {
  /** Dockview component name; also the panel id for single-instance panels. */
  id: string;
  title: string;
  icon: LucideIcon;
  component: FC<PanelProps>;
  minWidth?: number;
  minHeight?: number;
}

function placeholder(title: string, phase: string): FC<PanelProps> {
  return function Placeholder() {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <div className="label mb-1 !text-ink">{title}</div>
          <div className="text-[12px] text-faint">Arrives in {phase}.</div>
        </div>
      </div>
    );
  };
}

export const PANELS: PanelDef[] = [
  {
    id: "drum-machine",
    title: "Drum machine",
    icon: Drum,
    component: DrumMachine,
    minWidth: 420,
    minHeight: 320,
  },
  {
    id: "library",
    title: "Library",
    icon: Library,
    component: LibraryPanel,
    minWidth: 200,
  },
  {
    id: "inspector",
    title: "Inspector",
    icon: SlidersHorizontal,
    component: InspectorPanel,
    minWidth: 220,
  },
  {
    id: "mixer",
    title: "Mixer",
    icon: SlidersVertical,
    component: MixerPanel,
    minHeight: 160,
  },
  {
    id: "sample-editor",
    title: "Sample editor",
    icon: AudioWaveform,
    component: placeholder("Sample editor", "Phase 7"),
    minHeight: 160,
  },
  {
    id: "piano-roll",
    title: "Piano roll",
    icon: Piano,
    component: placeholder("Piano roll", "Phase 5b"),
    minHeight: 160,
  },
  {
    id: "performance",
    title: "Performance",
    icon: Gauge,
    component: placeholder("Performance", "Phase 8"),
    minWidth: 320,
  },
  {
    id: "master-scope",
    title: "Master scope",
    icon: Activity,
    component: MasterScopePanel,
    minWidth: 200,
    minHeight: 120,
  },
];

export const panelDef = (component: string) => PANELS.find((p) => p.id === component);
