import { useSyncExternalStore } from "react";
import { onSamplesChange, samplesVersion } from "../engine/samples";

/** Re-render when decoded samples are added (e.g. once the built-in kits are rendered). */
export function useSamplesVersion() {
  return useSyncExternalStore(onSamplesChange, samplesVersion);
}
