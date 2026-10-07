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
import { PerformancePanel } from "../panels/performance/PerformancePanel";
import { PianoRollPanel } from "../panels/piano-roll/PianoRollPanel";
import { SampleEditorPanel } from "../panels/sample-editor/SampleEditorPanel";

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
    component: SampleEditorPanel,
    minHeight: 160,
  },
  {
    id: "piano-roll",
    title: "Piano roll",
    icon: Piano,
    component: PianoRollPanel,
    minHeight: 160,
  },
  {
    id: "performance",
    title: "Performance",
    icon: Gauge,
    component: PerformancePanel,
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
