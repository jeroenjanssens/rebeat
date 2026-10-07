/** The desktop (Electron) platform: native file dialogs, no storage eviction; the rest is web. */
import type { OpenFilesOptions, Platform } from "./types";
import { webPlatform } from "./web";

export interface RebeatNative {
  platform: string;
  openFiles(opts: OpenFilesOptions): Promise<{ name: string; path: string; data: Uint8Array }[]>;
  saveFile(name: string, data: Uint8Array): Promise<boolean>;
  onCommand(fn: (id: string) => void): () => void;
  onOpenFile(fn: (file: { name: string; data: Uint8Array }) => void): () => void;
}

export function nativeBridge(): RebeatNative | undefined {
  return (window as unknown as { rebeatNative?: RebeatNative }).rebeatNative;
}

export function electronPlatform(native: RebeatNative): Platform {
  return {
    ...webPlatform,
    kind: "electron",
    storage: {
      ...webPlatform.storage,
      // a desktop app's storage isn't evicted
      persist: async () => true,
    },
    files: {
      ...webPlatform.files,
      open: async (opts = {}) =>
        (await native.openFiles(opts)).map((f) => {
          const file = new File([f.data as Uint8Array<ArrayBuffer>], f.name);
          if (f.path) Object.defineProperty(file, "webkitRelativePath", { value: f.path });
          return file;
        }),
      save: async (name, data) => {
        await native.saveFile(name, new Uint8Array(await data.arrayBuffer()));
      },
    },
  };
}
