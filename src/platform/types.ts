/**
 * Everything platform-specific goes through this interface, so a desktop (Electron) build only
 * needs another implementation. Nothing outside `platform/` calls these browser APIs directly.
 */
export interface OpenFilesOptions {
  /** File extensions or MIME types, e.g. [".wav", "audio/*"]. */
  accept?: string[];
  multiple?: boolean;
  /** Pick a whole folder (all files inside, recursively). */
  directory?: boolean;
}

export interface Platform {
  kind: "web" | "electron";

  /** Small synchronous key/value storage for settings and layouts. */
  kv: {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
  };

  storage: {
    /** Ask the browser not to evict our data. */
    persist(): Promise<boolean>;
    estimate(): Promise<{ usage: number; quota: number } | null>;
  };

  files: {
    open(options?: OpenFilesOptions): Promise<File[]>;
    save(name: string, data: Blob): Promise<void>;
    /** "Save to folder" (File System Access API) is available. */
    supportsFolders: boolean;
    pickFolder(): Promise<FileSystemDirectoryHandle | null>;
  };

  fullscreen: {
    /** Enter full screen with an element (default: the whole app). */
    enter(el?: Element): Promise<void>;
    exit(): Promise<void>;
    element(): Element | null;
    onChange(fn: () => void): () => void;
  };

  media: {
    getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
    devices(): Promise<MediaDeviceInfo[]>;
    onDevicesChange(fn: () => void): () => void;
    micPermission(): Promise<PermissionState | "unknown">;
  };

  midi: {
    supported: boolean;
    /** `sysex` is needed by controllers like Launchpad and Push (LEDs, modes). */
    request(sysex?: boolean): Promise<MIDIAccess | null>;
  };

  /** Run when the user tries to leave (close tab / window). Return true to warn. */
  onBeforeUnload(fn: () => boolean): () => void;
}
