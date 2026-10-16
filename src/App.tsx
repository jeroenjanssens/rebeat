import { lazy, Suspense, useEffect } from "react";
import { MenuHost } from "./components/Menu";
import { AskHost } from "./components/Ask";
import { AudioStartOverlay } from "./app/AudioStartOverlay";
import { CommandPalette } from "./app/CommandPalette";
import { installHints } from "./app/hintLayer";
import { addKeyHook, installKeyboard, registerCommands, runCommand } from "./app/commands";
import { importProjectFile } from "./app/projectActions";
import { desktop } from "./platform";
import { defaultCommands } from "./app/defaultCommands";
import { Dock } from "./app/Dock";
import { trackFullscreen } from "./app/PanelFrame";
import { SettingsDialog } from "./app/SettingsDialog";
import { ShortcutsDialog } from "./app/ShortcutsDialog";
import { TransportBar } from "./app/TransportBar";
import { trackerCommands } from "./app/trackerCommands";
import { useAppearance } from "./app/useAppearance";
import { ToastHost, toast } from "./components/Toast";

// Dialogs that open infrequently or pull in heavy deps are lazily loaded so
// they don't end up in the startup bundle.
const ExportDialog = lazy(() =>
  import("./app/ExportDialog").then((m) => ({ default: m.ExportDialog })),
);
const SynthWizardDialog = lazy(() =>
  import("./app/SynthWizardDialog").then((m) => ({ default: m.SynthWizardDialog })),
);
const WavetableDialog = lazy(() =>
  import("./app/WavetableDialog").then((m) => ({ default: m.WavetableDialog })),
);
const SampleExportDialog = lazy(() =>
  import("./app/SampleExportDialog").then((m) => ({ default: m.SampleExportDialog })),
);
const WelcomeDialog = lazy(() =>
  import("./app/WelcomeDialog").then((m) => ({ default: m.WelcomeDialog })),
);
const ProjectBrowser = lazy(() =>
  import("./app/ProjectBrowser").then((m) => ({ default: m.ProjectBrowser })),
);
import { useStore } from "./state/store";
import { startProjects } from "./storage/projects";
import { startLibrary } from "./library/library";
import { watchOverrides } from "./state/automationOverride";
import { watchRecordAutomation } from "./state/recordAutomation";

export function App() {
  useAppearance();

  useEffect(() => {
    const offs = [
      registerCommands(defaultCommands()),
      registerCommands(trackerCommands()),
      installKeyboard(),
      installHints(window),
      trackFullscreen(),
      // turning an automated knob overrides its lane, or records it (D191)
      watchOverrides(),
      watchRecordAutomation(),
      // the SHIFT function button follows the Shift key
      addKeyHook((e, down) => {
        if (e.key === "Shift") useStore.getState().setUi({ shiftHeld: down });
        return false;
      }),
      // desktop app: native menu items and files opened from the OS
      desktop?.onCommand((id) => runCommand(id)) ?? (() => {}),
      desktop?.onOpenFile(
        (f) => void importProjectFile(new File([f.data as Uint8Array<ArrayBuffer>], f.name)),
      ) ?? (() => {}),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // D14c: a soft limit of 32 tracks
  useEffect(() => {
    let count = useStore.getState().project.tracks.length;
    return useStore.subscribe((st) => {
      const n = st.project.tracks.length;
      if (n > 32 && count <= 32)
        toast("More than 32 tracks: playback may strain the CPU", "error", 4000);
      count = n;
    });
  }, []);

  useEffect(() => {
    startLibrary();
    void startProjects("example:night-drive");
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TransportBar />
      <main className="min-h-0 flex-1 p-1">
        <Dock />
      </main>
      <MenuHost />
      <AskHost />
      <CommandPalette />
      <SettingsDialog />
      <ShortcutsDialog />
      <Suspense fallback={null}>
        <ProjectBrowser />
        <ExportDialog />
        <SynthWizardDialog />
        <WavetableDialog />
        <SampleExportDialog />
        <WelcomeDialog />
      </Suspense>
      <ToastHost />
      <AudioStartOverlay />
    </div>
  );
}
