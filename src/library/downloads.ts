/**
 * Which streamed instruments are downloaded (D78). smplr caches their samples in the browser
 * (Cache API); this remembers which ones finished loading, so the library can show it.
 */
import { create } from "zustand";
import { platform } from "../platform";

const KEY = "rebeat.downloaded";

const load = (): string[] => {
  try {
    return JSON.parse(platform.kv.get(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

interface Downloads {
  /** smplr presets ("piano", "sf:flute"). */
  done: string[];
  /** Being downloaded right now. */
  busy: string[];
}

export const useDownloads = create<Downloads>()(() => ({ done: load(), busy: [] }));

export function markDownloaded(preset: string) {
  const { done, busy } = useDownloads.getState();
  const next = done.includes(preset) ? done : [...done, preset];
  useDownloads.setState({ done: next, busy: busy.filter((b) => b !== preset) });
  platform.kv.set(KEY, JSON.stringify(next));
}

export function markBusy(preset: string, on: boolean) {
  const { busy } = useDownloads.getState();
  useDownloads.setState({
    busy: on ? [...new Set([...busy, preset])] : busy.filter((b) => b !== preset),
  });
}
