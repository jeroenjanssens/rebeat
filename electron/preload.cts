/** The bridge between the desktop shell and the web app (window.rebeatNative). */
import { contextBridge, ipcRenderer } from "electron";

export interface NativeFile {
  name: string;
  /** Relative path inside a picked folder ("" for single files). */
  path: string;
  data: Uint8Array;
}

contextBridge.exposeInMainWorld("rebeatNative", {
  platform: process.platform,
  openFiles: (opts: { accept?: string[]; multiple?: boolean; directory?: boolean }): Promise<NativeFile[]> =>
    ipcRenderer.invoke("dialog:open", opts),
  saveFile: (name: string, data: Uint8Array): Promise<boolean> => ipcRenderer.invoke("dialog:save", name, data),
  onCommand: (fn: (id: string) => void) => {
    const listener = (_e: unknown, id: string) => fn(id);
    ipcRenderer.on("command", listener);
    return () => ipcRenderer.off("command", listener);
  },
  onOpenFile: (fn: (file: { name: string; data: Uint8Array }) => void) => {
    const listener = (_e: unknown, f: { name: string; data: Uint8Array }) => fn(f);
    ipcRenderer.on("file:open", listener);
    return () => ipcRenderer.off("file:open", listener);
  },
});
