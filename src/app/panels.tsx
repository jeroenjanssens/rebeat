import { lazy, type FC } from "react";
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
  BookOpen,
} from "lucide-react";
import { DrumMachine } from "../panels/drum-machine/DrumMachine";
import { InspectorPanel } from "../panels/inspector/InspectorPanel";
import { LibraryPanel } from "../panels/library/LibraryPanel";

// secondary panels load when first shown
const lazyPanel = (load: () => Promise<FC<PanelProps>>) =>
  lazy(async () => ({ default: await load() }));
const MasterScopePanel = lazyPanel(() =>
  import("../panels/master-scope/MasterScopePanel").then((m) => m.MasterScopePanel),
);
const MixerPanel = lazyPanel(() => import("../panels/mixer/MixerPanel").then((m) => m.MixerPanel));
const PerformancePanel = lazyPanel(() =>
  import("../panels/performance/PerformancePanel").then((m) => m.PerformancePanel),
);
const PianoRollPanel = lazyPanel(() =>
  import("../panels/piano-roll/PianoRollPanel").then((m) => m.PianoRollPanel),
);
const GuidePanel = lazyPanel(() => import("../panels/guide/GuidePanel").then((m) => m.GuidePanel));
const SampleEditorPanel = lazyPanel(() =>
  import("../panels/sample-editor/SampleEditorPanel").then((m) => m.SampleEditorPanel),
);

export interface PanelProps {
  params: Record<string, unknown>;
}

export interface PanelDef {
  /** Dockview component name; also the panel id for single-instance panels. */
  id: string;
  title: string;
  icon: LucideIcon;
  component: FC<PanelProps> | ReturnType<typeof lazy<FC<PanelProps>>>;
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
  {
    id: "guide",
    title: "Guide",
    icon: BookOpen,
    component: GuidePanel,
    minWidth: 360,
  },
];

export const panelDef = (component: string) => PANELS.find((p) => p.id === component);
