import { useEffect } from "react";
import { MenuHost } from "./components/Menu";
import { AudioStartOverlay } from "./app/AudioStartOverlay";
import { CommandPalette } from "./app/CommandPalette";
import { addKeyHook, installKeyboard, registerCommands } from "./app/commands";
import { defaultCommands } from "./app/defaultCommands";
import { Dock } from "./app/Dock";
import { trackFullscreen } from "./app/PanelFrame";
import { SettingsDialog } from "./app/SettingsDialog";
import { ShortcutsDialog } from "./app/ShortcutsDialog";
import { TransportBar } from "./app/TransportBar";
import { useAppearance } from "./app/useAppearance";
import { ExportDialog } from "./app/ExportDialog";
import { ProjectBrowser } from "./app/ProjectBrowser";
import { ToastHost } from "./components/Toast";
import { useStore } from "./state/store";
import { startProjects } from "./storage/projects";
import { startLibrary } from "./library/library";
import { demoProject } from "./templates/nightDrive";

export function App() {
  useAppearance();

  useEffect(() => {
    const offs = [
      registerCommands(defaultCommands()),
      installKeyboard(),
      trackFullscreen(),
      // the SHIFT function button follows the Shift key
      addKeyHook((e, down) => {
        if (e.key === "Shift") useStore.getState().setUi({ shiftHeld: down });
        return false;
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    startLibrary();
    void startProjects(demoProject);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TransportBar />
      <main className="min-h-0 flex-1 p-1">
        <Dock />
      </main>
      <MenuHost />
      <CommandPalette />
      <SettingsDialog />
      <ShortcutsDialog />
      <ProjectBrowser />
      <ExportDialog />
      <ToastHost />
      <AudioStartOverlay />
    </div>
  );
}
