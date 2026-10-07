import { electronPlatform, nativeBridge } from "./electron";
import type { Platform } from "./types";
import { webPlatform } from "./web";

export type { Platform, OpenFilesOptions } from "./types";

const native = typeof window !== "undefined" ? nativeBridge() : undefined;

/** The active platform: the desktop app when running in Electron, the web otherwise. */
export const platform: Platform = native ? electronPlatform(native) : webPlatform;

/** Desktop-only hooks (menu commands, opened files), or undefined on the web. */
export const desktop = native;
