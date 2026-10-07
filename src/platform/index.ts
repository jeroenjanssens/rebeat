import type { Platform } from "./types";
import { webPlatform } from "./web";

export type { Platform, OpenFilesOptions } from "./types";

/** The active platform implementation (web for now; Electron in Phase 10). */
export const platform: Platform = webPlatform;
